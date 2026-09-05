import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { createAiStarterParty } from '@poke-lounge/battle/ai-policy';
import {
  CompetitivePartyValidationError,
  normalizeCompetitiveParty,
} from '@poke-lounge/battle/competitive-party';
import {
  hashPokeLoungeRoomCommand,
  type PokeLoungeIdempotentCommandContext,
  type PokeLoungeRoomCommandContext,
  type PokeLoungeRoomOperation,
} from './poke-lounge-room-command';
import {
  PokeLoungePartySnapshotLocked,
  PokeLoungeRoomConflict,
  PokeLoungeRoomFull,
  toPokeLoungePublicRoomState,
} from './poke-lounge-room-conflict';
import {
  POKE_LOUNGE_ROOM_EVENT_PUBLISHER,
  type PokeLoungeRoomCommittedEvent,
  type PokeLoungeRoomEventPublisher,
} from './poke-lounge-room-event.publisher';
import {
  advancePokeLoungeRoomClock,
  completePokeLoungeTournamentMatch,
  convergeOfflinePokeLoungeTournamentMatches,
  getPokeLoungeRoomHostPlayerId,
  getPokeLoungeRoomExpiresAtMs,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
  POKE_LOUNGE_ROOM_CAPACITY,
  resetPokeLoungeRoundPreparation,
} from './poke-lounge-room-policy';
import {
  POKE_LOUNGE_ROOM_REPOSITORY,
  type PokeLoungeRepositoryResult,
  type PokeLoungeRoomRepository,
  type PokeLoungeRoomSnapshot,
} from './poke-lounge-room.repository';
import type {
  AddPokeLoungeAiParticipantInput,
  CreatePokeLoungeRoomInput,
  JoinPokeLoungeRoomInput,
  LeavePokeLoungeRoomInput,
  PokeLoungeMatchResultReason,
  PokeLoungePartySnapshot,
  PokeLoungePublicRoomState,
  PokeLoungeRoomParticipant,
  PokeLoungeRoomState,
  PokeLoungeTournamentMatch,
  RemovePokeLoungeAiParticipantInput,
  SetPokeLoungeReadyInput,
  SetPokeLoungeRoundReadyInput,
  StartPokeLoungeRoomInput,
  SubmitPokeLoungeMatchResultInput,
  UpdatePokeLoungePartySnapshotInput,
} from './poke-lounge-room.types';
import { CompetitiveProjectionService } from './competitive/competitive-projection.service';
import {
  DEFAULT_ROUND_DURATION_MS,
  ROUND_DURATION_OPTIONS_MS,
} from '@poke-lounge/battle/round-settings';

const MIN_ROUND_DURATION_MS = 1;
const MAX_ROUND_DURATION_MS = 3_600_000;
const MAX_ROOM_OCCUPANTS = 8;
const MIN_AUTO_FILLED_PARTICIPANTS = 4;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AI_DISPLAY_NAMES = [
  '반바지 꼬마 오성',
  '반바지 꼬마 강철',
  '반바지 꼬마 정수',
  '곤충채집소년 미키',
  '곤충채집소년 광일',
  '피크닉걸 은향',
  '캠프보이 고광',
  '낚시꾼 세형',
  '낚시꾼 주원',
  '낚시꾼 태명',
  '새조련사 선정',
  '등산가 스톰',
  '애호가클럽 동휘',
  '쌍둥이 아롱&다롱',
  '불놀이꾼 다인',
  '선원 시현',
  '저글러 죤',
  '피크닉걸 진미',
];
const MATCH_RESULT_REASONS = new Set<PokeLoungeMatchResultReason>([
  'faint',
  'timeout',
  'forfeit',
]);

type MutationInput = {
  operation: Exclude<PokeLoungeRoomOperation, 'create'>;
  roomCode: string;
  actorPlayerId: string;
  command: PokeLoungeRoomCommandContext | PokeLoungeIdempotentCommandContext;
  nowMs: number;
  body: unknown;
  apply: (room: PokeLoungeRoomSnapshot) => PokeLoungeRoomSnapshot;
};

type PresenceAdmissionOptions = {
  requireSocketAcknowledgement?: boolean;
};

class PokeLoungePresenceMutationCancelled extends Error {
  constructor() {
    super('Poke Lounge presence mutation cancelled');
  }
}

@Injectable()
export class PokeLoungeRoomService {
  private readonly logger = new Logger(PokeLoungeRoomService.name);

  constructor(
    @Inject(POKE_LOUNGE_ROOM_REPOSITORY)
    private readonly repository: PokeLoungeRoomRepository,
    @Inject(POKE_LOUNGE_ROOM_EVENT_PUBLISHER)
    private readonly eventPublisher: PokeLoungeRoomEventPublisher,
    private readonly competitiveProjection: CompetitiveProjectionService,
    @Optional() private readonly roomCodeFactory: () => string = createRoomCode,
    @Optional()
    private readonly nowFactory: () => number = function callback() {
      return Date.now();
    },
  ) {}

  async createRoom(
    input: CreatePokeLoungeRoomInput,
    command: PokeLoungeRoomCommandContext,
    options: PresenceAdmissionOptions = {},
  ): Promise<PokeLoungeRoomSnapshot> {
    if (command.expectedRevision !== 0) {
      throw new BadRequestException(
        'If-Match-Revision must be 0 when creating a room',
      );
    }

    const normalized = normalizeCreateInput(input);
    const nowMs = this.normalizeNow(input.nowMs);
    const { visibility, ...privateCommandBody } = normalized;
    const requestHash = hashPokeLoungeRoomCommand({
      operation: 'create',
      body: normalizedCommandBody(
        visibility === 'public' ? normalized : privateCommandBody,
        input.nowMs,
      ),
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const room: PokeLoungeRoomSnapshot = {
        roomCode: normalized.roomCode ?? this.roomCodeFactory(),
        visibility,
        status: 'waiting',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        participants: [
          createParticipant(
            normalized,
            'participant',
            nowMs,
            options.requireSocketAcknowledgement === true,
          ),
        ],
        partySnapshots: {},
        round: {
          index: 1,
          phase: 'waiting',
          durationMs: normalized.roundDurationMs,
          startedAtMs: null,
          endsAtMs: null,
        },
        tournament: {
          version: 2,
          bracket: null,
          activeMatchId: null,
          activeMatchAuthority: null,
          roundScores: {},
          cumulativeScores: {},
        },
        finalStandings: [],
        revision: 0,
        expiresAtMs: 0,
      };
      room.expiresAtMs = getPokeLoungeRoomExpiresAtMs(room);

      const result = await this.repository.create({
        room,
        actorPlayerId: normalized.playerId,
        idempotencyKey: command.idempotencyKey,
        requestHash,
        nowMs,
      });

      if (result.outcome === 'public-room-exists') {
        const existing = await this.repository.getAndAdvance(
          result.roomCode,
          nowMs,
        );
        if (!existing.snapshot) {
          continue;
        }
        if (existing.committedChange) {
          await this.publish(
            'room-clock-advanced',
            await this.commandEventSnapshot(existing.snapshot),
          );
        }
        return this.joinRoom(
          result.roomCode,
          {
            playerId: normalized.playerId,
            sessionId: normalized.sessionId,
            ...(normalized.userId ? { userId: normalized.userId } : {}),
            displayName: normalized.displayName,
            ...(input.nowMs === undefined ? {} : { nowMs }),
          },
          {
            idempotencyKey: deriveCreateOrJoinIdempotencyKey(
              command.idempotencyKey,
            ),
            expectedRevision: existing.snapshot.revision,
          },
          options,
        );
      }

      if (result.outcome === 'room-code-collision') {
        if (normalized.roomCode) {
          const existing = await this.repository.getAndAdvance(
            normalized.roomCode,
            nowMs,
          );
          if (!existing.snapshot) {
            continue;
          }
          if (existing.committedChange) {
            await this.publish(
              'room-clock-advanced',
              await this.commandEventSnapshot(existing.snapshot),
            );
          }

          return this.joinRoom(
            normalized.roomCode,
            {
              playerId: normalized.playerId,
              sessionId: normalized.sessionId,
              ...(normalized.userId ? { userId: normalized.userId } : {}),
              displayName: normalized.displayName,
              ...(input.nowMs === undefined ? {} : { nowMs }),
            },
            {
              idempotencyKey: deriveCreateOrJoinIdempotencyKey(
                command.idempotencyKey,
              ),
              expectedRevision: existing.snapshot.revision,
            },
            options,
          );
        }
        continue;
      }

      if (result.outcome === 'capacity-reached') {
        throw new BadRequestException('Poke Lounge room capacity reached');
      }

      if (!('snapshot' in result)) {
        continue;
      }

      const snapshot = structuredClone(result.snapshot);
      if (result.committedChange) {
        await this.publish(
          'room-created',
          await this.commandEventSnapshot(result.snapshot),
        );
      }

      this.throwForConflict({ ...result, snapshot });

      return structuredClone(snapshot);
    }

    throw new BadRequestException('Unable to create a unique room code');
  }

  async quickPlay(
    input: JoinPokeLoungeRoomInput,
    command: PokeLoungeIdempotentCommandContext,
    options: PresenceAdmissionOptions = {},
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = normalizeJoinInput(input);
    const nowMs = this.normalizeNow(input.nowMs);
    const joinIdempotencyKey = deriveIdempotencyKey(
      'quick-play-join',
      command.idempotencyKey,
    );

    // ponytail: bounded by the existing 20-room cap; add a public-room index only if that cap grows.
    for (let attempt = 0; attempt < POKE_LOUNGE_ROOM_CAPACITY; attempt += 1) {
      const rooms: PokeLoungeRoomSnapshot[] = [];
      for (const roomCode of await this.repository.listRoomCodes(nowMs)) {
        try {
          rooms.push(await this.getRoom(roomCode));
        } catch (error) {
          if (!(error instanceof NotFoundException)) {
            throw error;
          }
        }
      }

      const existing = rooms
        .filter(function filterItem(room) {
          return (
            room.visibility === 'public' &&
            (room.status === 'waiting' ||
              room.status === 'round-started' ||
              room.status === 'tournament')
          );
        })
        .flatMap(function mapItem(room) {
          const participant = room.participants.find(function findItem(item) {
            return (
              item.sessionId === normalized.sessionId &&
              (!normalized.playerId || item.playerId === normalized.playerId)
            );
          });
          return participant ? [{ room, participant }] : [];
        })
        .sort(function compareItems(left, right) {
          return compareMatchmakingRooms(left.room, right.room);
        })[0];
      const target =
        existing?.room ??
        rooms
          .filter(isPublicRoomMatchmakingCandidate)
          .sort(compareMatchmakingRooms)[0];

      if (!target) {
        try {
          return await this.createRoom(
            {
              ...normalized,
              visibility: 'public',
              ...(input.nowMs === undefined ? {} : { nowMs }),
            },
            { idempotencyKey: command.idempotencyKey, expectedRevision: 0 },
            options,
          );
        } catch (error) {
          if (
            (error instanceof PokeLoungeRoomConflict &&
              error.kind === 'revision') ||
            error instanceof PokeLoungeRoomFull ||
            error instanceof NotFoundException
          ) {
            continue;
          }
          throw error;
        }
      }

      try {
        return await this.joinRoom(
          target.roomCode,
          {
            ...normalized,
            ...(existing ? { playerId: existing.participant.playerId } : {}),
            ...(input.nowMs === undefined ? {} : { nowMs }),
          },
          {
            idempotencyKey: joinIdempotencyKey,
            expectedRevision: target.revision,
          },
          options,
        );
      } catch (error) {
        if (
          (error instanceof PokeLoungeRoomConflict &&
            error.kind === 'revision') ||
          error instanceof PokeLoungeRoomFull ||
          error instanceof NotFoundException
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('Unable to join a public room');
  }

  async getRoom(
    roomCode: string,
    afterRevision?: number,
  ): Promise<PokeLoungeRoomSnapshot> {
    const result = await this.repository.getAndAdvance(
      normalizeRoomCode(roomCode),
      this.normalizeNow(undefined),
    );

    if (!result.snapshot) {
      throw new NotFoundException('Poke Lounge room not found');
    }

    const snapshot = await this.readCurrentSnapshot(
      result.snapshot.roomCode,
      afterRevision,
    );
    if (result.committedChange) {
      await this.publish(
        'room-clock-advanced',
        selectEventSnapshot(result.snapshot, snapshot),
      );
    }

    return structuredClone(snapshot);
  }

  async authorizeSubscription(
    roomCode: string,
    playerId: string,
    sessionId: string,
    afterRevision?: number,
  ): Promise<PokeLoungePublicRoomState> {
    const result = await this.repository.getAndAdvance(
      normalizeRoomCode(roomCode),
      this.normalizeNow(undefined),
    );

    const snapshot = result.snapshot
      ? await this.readCurrentSnapshot(result.snapshot.roomCode, afterRevision)
      : null;
    if (snapshot && result.committedChange) {
      await this.publish(
        'room-clock-advanced',
        selectEventSnapshot(result.snapshot!, snapshot),
      );
    }

    const participant = snapshot?.participants.find(
      function findItem(candidate) {
        return candidate.playerId === playerId;
      },
    );

    if (!snapshot || participant?.sessionId !== sessionId) {
      throw new BadRequestException('Poke Lounge room subscription rejected');
    }

    return structuredClone(toPokeLoungePublicRoomState(snapshot));
  }

  async expireParticipantPresence(
    roomCode: string,
    playerId: string,
    sessionId: string,
    presenceEpoch?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const normalizedPlayerId = playerId.trim();
    const normalizedSessionId = sessionId.trim();
    const normalizedPresenceEpoch = presenceEpoch?.trim();

    for (let attempt = 0; attempt < MAX_ROOM_OCCUPANTS; attempt += 1) {
      if (signal?.aborted) {
        return;
      }
      let room: PokeLoungeRoomSnapshot;
      try {
        room = await this.getRoom(roomCode);
      } catch (error) {
        if (error instanceof NotFoundException) {
          return;
        }
        throw error;
      }
      if (signal?.aborted) {
        return;
      }

      const participant = room.participants.find(function findItem(candidate) {
        return candidate.playerId === normalizedPlayerId;
      });
      if (
        !participant ||
        participant.sessionId !== normalizedSessionId ||
        !participant.connected ||
        (normalizedPresenceEpoch !== undefined &&
          participant.presenceEpoch !== normalizedPresenceEpoch)
      ) {
        return;
      }

      try {
        const nowMs = this.normalizeNow(undefined);
        await this.mutateRoom({
          operation: 'leave',
          roomCode: room.roomCode,
          actorPlayerId: normalizedPlayerId,
          command: {
            idempotencyKey: randomUUID(),
            expectedRevision: room.revision,
          },
          nowMs,
          body: {
            playerId: normalizedPlayerId,
            sessionId: normalizedSessionId,
            ...(normalizedPresenceEpoch === undefined
              ? {}
              : { presenceEpoch: normalizedPresenceEpoch }),
          },
          apply: (current) => {
            if (signal?.aborted) {
              throw new PokeLoungePresenceMutationCancelled();
            }
            const currentParticipant = findParticipant(
              current,
              normalizedPlayerId,
            );
            assertParticipantSession(
              currentParticipant,
              normalizedSessionId,
              'Leave sessionId does not match this participant',
            );
            if (
              normalizedPresenceEpoch !== undefined &&
              currentParticipant.presenceEpoch !== normalizedPresenceEpoch
            ) {
              throw new PokeLoungePresenceMutationCancelled();
            }
            return applyParticipantLeave(current, currentParticipant, nowMs, {
              preserveRoundParticipant: true,
              keepRoomOpen: true,
            });
          },
        });
        return;
      } catch (error) {
        if (error instanceof PokeLoungePresenceMutationCancelled) {
          return;
        }
        if (error instanceof PokeLoungeRoomConflict) {
          continue;
        }
        if (error instanceof NotFoundException) {
          return;
        }
        throw error;
      }
    }
  }

  async markParticipantDisconnectPending(
    roomCode: string,
    playerId: string,
    sessionId: string,
    presenceEpoch: string,
    expiresAtMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const normalizedPlayerId = playerId.trim();
    const normalizedSessionId = sessionId.trim();
    const normalizedPresenceEpoch = presenceEpoch.trim();
    const normalizedExpiresAtMs = this.normalizeNow(expiresAtMs);

    for (let attempt = 0; attempt < MAX_ROOM_OCCUPANTS; attempt += 1) {
      if (signal?.aborted) {
        return;
      }
      let room: PokeLoungeRoomSnapshot;
      try {
        room = await this.getRoom(roomCode);
      } catch (error) {
        if (error instanceof NotFoundException) {
          return;
        }
        throw error;
      }
      const participant = room.participants.find(function findItem(candidate) {
        return candidate.playerId === normalizedPlayerId;
      });
      if (
        !participant ||
        participant.sessionId !== normalizedSessionId ||
        !participant.connected ||
        participant.presenceEpoch !== normalizedPresenceEpoch
      ) {
        return;
      }
      if (participant.disconnectPendingUntilMs === normalizedExpiresAtMs) {
        return;
      }

      const nowMs = this.normalizeNow(undefined);
      try {
        await this.mutateRoom({
          operation: 'presence',
          roomCode: room.roomCode,
          actorPlayerId: normalizedPlayerId,
          command: {
            idempotencyKey: randomUUID(),
            expectedRevision: room.revision,
          },
          nowMs,
          body: {
            playerId: normalizedPlayerId,
            sessionId: normalizedSessionId,
            presenceEpoch: normalizedPresenceEpoch,
            expiresAtMs: normalizedExpiresAtMs,
          },
          apply: (current) => {
            if (signal?.aborted) {
              throw new PokeLoungePresenceMutationCancelled();
            }
            const currentParticipant = findParticipant(
              current,
              normalizedPlayerId,
            );
            assertParticipantSession(
              currentParticipant,
              normalizedSessionId,
              'Presence sessionId does not match this participant',
            );
            if (
              !currentParticipant.connected ||
              currentParticipant.presenceEpoch !== normalizedPresenceEpoch
            ) {
              throw new PokeLoungePresenceMutationCancelled();
            }
            currentParticipant.disconnectPendingUntilMs = normalizedExpiresAtMs;
            current.updatedAtMs = nowMs;
            return current;
          },
        });
        return;
      } catch (error) {
        if (error instanceof PokeLoungePresenceMutationCancelled) {
          return;
        }
        if (error instanceof PokeLoungeRoomConflict) {
          continue;
        }
        if (error instanceof NotFoundException) {
          return;
        }
        throw error;
      }
    }

    throw new Error('Unable to persist Poke Lounge disconnect grace');
  }

  async acknowledgeParticipantPresence(
    roomCode: string,
    playerId: string,
    sessionId: string,
    afterRevision?: number,
    presenceEpoch?: string,
    signal?: AbortSignal,
  ): Promise<PokeLoungePublicRoomState> {
    const normalizedPlayerId = playerId.trim();
    const normalizedSessionId = sessionId.trim();
    const normalizedPresenceEpoch = presenceEpoch?.trim();

    for (let attempt = 0; attempt < MAX_ROOM_OCCUPANTS; attempt += 1) {
      if (signal?.aborted) {
        throw new PokeLoungePresenceMutationCancelled();
      }
      const room = await this.getRoom(roomCode, afterRevision);
      if (signal?.aborted) {
        throw new PokeLoungePresenceMutationCancelled();
      }
      const participant = room.participants.find(function findItem(candidate) {
        return candidate.playerId === normalizedPlayerId;
      });
      if (!participant || participant.sessionId !== normalizedSessionId) {
        throw new BadRequestException('Poke Lounge room subscription rejected');
      }
      if (
        participant.connected &&
        participant.presencePendingUntilMs === undefined &&
        participant.disconnectPendingUntilMs === undefined &&
        (normalizedPresenceEpoch === undefined ||
          participant.presenceEpoch === normalizedPresenceEpoch)
      ) {
        return structuredClone(toPokeLoungePublicRoomState(room));
      }

      const nowMs = this.normalizeNow(undefined);
      try {
        const activated = await this.mutateRoom({
          operation: 'presence',
          roomCode,
          actorPlayerId: normalizedPlayerId,
          command: {
            idempotencyKey: randomUUID(),
            expectedRevision: room.revision,
          },
          nowMs,
          body: {
            playerId: normalizedPlayerId,
            sessionId: normalizedSessionId,
            ...(normalizedPresenceEpoch === undefined
              ? {}
              : { presenceEpoch: normalizedPresenceEpoch }),
          },
          apply: (current) => {
            if (signal?.aborted) {
              throw new PokeLoungePresenceMutationCancelled();
            }
            const currentParticipant = findParticipant(
              current,
              normalizedPlayerId,
            );
            assertParticipantSession(
              currentParticipant,
              normalizedSessionId,
              'Poke Lounge room subscription rejected',
            );
            currentParticipant.connected = true;
            currentParticipant.leftAtMs = undefined;
            delete currentParticipant.presencePendingUntilMs;
            delete currentParticipant.disconnectPendingUntilMs;
            if (normalizedPresenceEpoch !== undefined) {
              currentParticipant.presenceEpoch = normalizedPresenceEpoch;
            }
            current.updatedAtMs = nowMs;
            return current;
          },
        });
        const current = await this.readCurrentSnapshot(
          activated.roomCode,
          afterRevision,
        );
        return structuredClone(toPokeLoungePublicRoomState(current));
      } catch (error) {
        if (error instanceof PokeLoungeRoomConflict) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('Poke Lounge room subscription rejected');
  }

  async joinRoom(
    roomCode: string,
    input: JoinPokeLoungeRoomInput,
    command: PokeLoungeRoomCommandContext,
    options: PresenceAdmissionOptions = {},
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = normalizeJoinInput(input);
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'join',
      roomCode,
      actorPlayerId:
        normalized.playerId ??
        createAnonymousJoinActorPlayerId(normalized.sessionId),
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        const playerId = normalized.playerId ?? createNextParticipantId(room);
        const existing = room.participants.find(function findItem(participant) {
          return participant.playerId === playerId;
        });

        if (existing) {
          assertExistingParticipantRejoinable(room);
          assertParticipantSession(
            existing,
            normalized.sessionId,
            'Join sessionId does not match this participant',
          );
          const requiresAcknowledgement =
            !existing.connected ||
            existing.presencePendingUntilMs !== undefined;
          existing.connected = true;
          existing.leftAtMs = undefined;
          if (
            options.requireSocketAcknowledgement === true &&
            requiresAcknowledgement
          ) {
            existing.presencePendingUntilMs =
              nowMs + POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS;
          } else if (options.requireSocketAcknowledgement !== true) {
            delete existing.presencePendingUntilMs;
            delete existing.disconnectPendingUntilMs;
          }
          existing.ready =
            existing.role === 'participant' ? existing.ready : false;
          if (room.status === 'waiting' && normalized.displayName) {
            existing.displayName = normalized.displayName;
          }
          room.updatedAtMs = nowMs;
          return room;
        }

        assertRoomJoinable(room);
        if (room.participants.length >= MAX_ROOM_OCCUPANTS) {
          throw new PokeLoungeRoomFull();
        }
        room.participants.push(
          createParticipant(
            {
              ...normalized,
              playerId,
              displayName:
                normalized.displayName ?? formatDefaultPlayerName(playerId),
            },
            'participant',
            nowMs,
            options.requireSocketAcknowledgement === true,
          ),
        );
        room.updatedAtMs = nowMs;

        return room;
      },
    });
  }

  async setReady(
    roomCode: string,
    input: SetPokeLoungeReadyInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = {
      playerId: input.playerId.trim(),
      sessionId: input.sessionId?.trim(),
      ready: input.ready,
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'ready',
      roomCode,
      actorPlayerId: normalized.playerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        if (room.status !== 'waiting' || room.round.phase !== 'waiting') {
          throw new BadRequestException(
            'Ready can only change in a waiting room',
          );
        }
        const participant = findParticipant(room, normalized.playerId);
        assertParticipantSession(
          participant,
          normalized.sessionId,
          'Ready sessionId does not match this participant',
        );

        if (participant.role !== 'participant') {
          throw new BadRequestException('Spectators cannot become ready');
        }
        if (
          normalized.ready &&
          !room.partySnapshots[participant.playerId]?.competitiveParty.members
            .length
        ) {
          throw new BadRequestException(
            'Party snapshot is required before becoming ready',
          );
        }

        participant.ready = normalized.ready;
        room.updatedAtMs = nowMs;

        return room;
      },
    });
  }

  async setRoundReady(
    roomCode: string,
    input: SetPokeLoungeRoundReadyInput,
    command: PokeLoungeIdempotentCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    if (!Number.isSafeInteger(input.roundIndex) || input.roundIndex < 1) {
      throw new BadRequestException('roundIndex must be a positive integer');
    }

    const normalized = {
      playerId: input.playerId.trim(),
      sessionId: input.sessionId?.trim(),
      roundIndex: input.roundIndex,
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'round-ready',
      roomCode,
      actorPlayerId: normalized.playerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        const participant = findParticipant(room, normalized.playerId);
        assertParticipantSession(
          participant,
          normalized.sessionId,
          'Round ready sessionId does not match this participant',
        );

        if (participant.role !== 'participant') {
          throw new BadRequestException('Spectators cannot become ready');
        }
        if (
          room.round.index > normalized.roundIndex ||
          (room.round.index === normalized.roundIndex &&
            (room.status === 'tournament' || room.status === 'completed'))
        ) {
          return room;
        }
        if (room.round.index !== normalized.roundIndex) {
          throw new BadRequestException('Round ready index does not match');
        }
        if (
          room.status !== 'round-started' ||
          room.round.phase !== 'round-started' ||
          room.round.endsAtMs === null ||
          nowMs < room.round.endsAtMs
        ) {
          throw new BadRequestException('Round is not ready to finish');
        }
        if (
          !room.partySnapshots[participant.playerId]?.competitiveParty.members
            .length
        ) {
          throw new BadRequestException(
            'Party snapshot is required before becoming ready',
          );
        }

        participant.ready = true;
        room.updatedAtMs = nowMs;

        return advancePokeLoungeRoomClock(room, nowMs) ?? room;
      },
    });
  }

  async startRoom(
    roomCode: string,
    input: StartPokeLoungeRoomInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = {
      playerId: input.playerId.trim(),
      sessionId: input.sessionId.trim(),
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'start',
      roomCode,
      actorPlayerId: normalized.playerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        if (room.status !== 'waiting' || room.round.phase !== 'waiting') {
          throw new BadRequestException('Room is not waiting to start');
        }

        const participant = findParticipant(room, normalized.playerId);
        assertParticipantSession(
          participant,
          normalized.sessionId,
          'Start sessionId does not match this participant',
        );
        if (getPokeLoungeRoomHostPlayerId(room) !== participant.playerId) {
          throw new BadRequestException('Only the room host can start');
        }

        const participants = room.participants.filter(
          function filterItem(candidate) {
            return candidate.role === 'participant';
          },
        );
        if (participants.length > MAX_ROOM_OCCUPANTS) {
          throw new BadRequestException('Room has too many participants');
        }
        if (
          participants.some(function testItem(candidate) {
            return (
              !candidate.connected ||
              candidate.presencePendingUntilMs !== undefined
            );
          })
        ) {
          throw new BadRequestException(
            'All participants must be connected before starting',
          );
        }
        if (
          participants.some(function testItem(candidate) {
            return candidate.controller !== 'ai' && !candidate.ready;
          })
        ) {
          throw new BadRequestException(
            'All participants must be ready before starting',
          );
        }
        if (
          participants.some(function testItem(candidate) {
            return !room.partySnapshots[candidate.playerId]?.competitiveParty
              .members.length;
          })
        ) {
          throw new BadRequestException(
            'All participants need a party snapshot before starting',
          );
        }

        const targetParticipantCount =
          participants.length < MIN_AUTO_FILLED_PARTICIPANTS
            ? MIN_AUTO_FILLED_PARTICIPANTS
            : MAX_ROOM_OCCUPANTS;
        while (participants.length < targetParticipantCount) {
          participants.push(appendAiParticipant(room, nowMs));
        }

        room.status = 'round-started';
        room.round.phase = 'round-started';
        room.round.startedAtMs = nowMs;
        room.round.endsAtMs = nowMs + room.round.durationMs;
        for (const candidate of participants) {
          candidate.ready = false;
        }
        room.updatedAtMs = nowMs;
        return room;
      },
    });
  }

  async addAiParticipant(
    roomCode: string,
    input: AddPokeLoungeAiParticipantInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const playerId = input.playerId.trim();
    const sessionId = input.sessionId.trim();
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'ai-add',
      roomCode,
      actorPlayerId: playerId,
      command,
      nowMs,
      body: { playerId, sessionId },
      apply: (room) => {
        assertRoomJoinable(room);
        const host = findParticipant(room, playerId);
        assertParticipantSession(
          host,
          sessionId,
          'AI management sessionId does not match this participant',
        );
        if (getPokeLoungeRoomHostPlayerId(room) !== playerId) {
          throw new BadRequestException('Only the room host can manage AI');
        }
        if (room.participants.length >= MAX_ROOM_OCCUPANTS) {
          throw new PokeLoungeRoomFull();
        }

        appendAiParticipant(room, nowMs);
        room.updatedAtMs = nowMs;
        return room;
      },
    });
  }

  async removeAiParticipant(
    roomCode: string,
    input: RemovePokeLoungeAiParticipantInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const playerId = input.playerId.trim();
    const sessionId = input.sessionId.trim();
    const aiPlayerId = input.aiPlayerId.trim();
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'ai-remove',
      roomCode,
      actorPlayerId: playerId,
      command,
      nowMs,
      body: { playerId, sessionId, aiPlayerId },
      apply: (room) => {
        assertRoomJoinable(room);
        const host = findParticipant(room, playerId);
        assertParticipantSession(
          host,
          sessionId,
          'AI management sessionId does not match this participant',
        );
        if (getPokeLoungeRoomHostPlayerId(room) !== playerId) {
          throw new BadRequestException('Only the room host can manage AI');
        }
        const ai = findParticipant(room, aiPlayerId);
        if (ai.controller !== 'ai') {
          throw new BadRequestException('Only AI participants can be removed');
        }
        room.participants = room.participants.filter(
          function filterItem(participant) {
            return participant.playerId !== aiPlayerId;
          },
        );
        delete room.partySnapshots[aiPlayerId];
        room.updatedAtMs = nowMs;
        return room;
      },
    });
  }

  async updatePartySnapshot(
    roomCode: string,
    input: UpdatePokeLoungePartySnapshotInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = {
      playerId: input.playerId.trim(),
      sessionId: input.sessionId.trim(),
      ...(input.displayName?.trim()
        ? { displayName: input.displayName.trim() }
        : {}),
      competitiveParty: normalizePartySnapshot(input.competitiveParty),
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'party-snapshot',
      roomCode,
      actorPlayerId: normalized.playerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        const participant = findParticipant(room, normalized.playerId);
        assertParticipantSession(
          participant,
          normalized.sessionId,
          'Party snapshot sessionId does not match this participant',
        );

        if (participant.role !== 'participant') {
          throw new BadRequestException(
            'Spectators cannot update tournament party snapshots',
          );
        }

        if (
          room.status === 'tournament' ||
          room.status === 'completed' ||
          room.status === 'closed'
        ) {
          throw new PokeLoungePartySnapshotLocked();
        }

        room.partySnapshots[participant.playerId] = {
          version: 2,
          playerId: participant.playerId,
          ...(normalized.displayName
            ? { displayName: normalized.displayName }
            : participant.displayName
              ? { displayName: participant.displayName }
              : {}),
          competitiveParty: normalized.competitiveParty,
          updatedAtMs: nowMs,
        };
        room.updatedAtMs = nowMs;

        return room;
      },
    });
  }

  async submitMatchResult(
    roomCode: string,
    input: SubmitPokeLoungeMatchResultInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = {
      reportingPlayerId: input.reportingPlayerId.trim(),
      reportingSessionId: input.reportingSessionId?.trim(),
      matchId: input.matchId.trim(),
      winnerPlayerId: input.winnerPlayerId.trim(),
      loserPlayerId: input.loserPlayerId.trim(),
      reason: input.reason,
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'result',
      roomCode,
      actorPlayerId: normalized.reportingPlayerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        if (room.status !== 'tournament') {
          throw new BadRequestException(
            'Room is not accepting tournament results',
          );
        }
        if (room.tournament.activeMatchAuthority === 'server') {
          throw new BadRequestException(
            'Server-authoritative matches only accept competitive actions',
          );
        }

        const match = findActiveMatch(room, normalized.matchId);
        assertValidMatchResult(room, match, normalized);
        completeMatch(
          room,
          match,
          normalized.winnerPlayerId,
          normalized.reason,
          nowMs,
        );

        return room;
      },
    });
  }

  async leaveRoom(
    roomCode: string,
    input: LeavePokeLoungeRoomInput,
    command: PokeLoungeRoomCommandContext,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalized = {
      playerId: input.playerId?.trim() ?? '',
      sessionId: input.sessionId?.trim(),
    };
    const nowMs = this.normalizeNow(input.nowMs);

    return this.mutateRoom({
      operation: 'leave',
      roomCode,
      actorPlayerId: normalized.playerId,
      command,
      nowMs,
      body: normalizedCommandBody(normalized, input.nowMs),
      apply: (room) => {
        const participant = findParticipant(room, normalized.playerId);
        assertParticipantSession(
          participant,
          normalized.sessionId,
          'Leave sessionId does not match this participant',
        );
        return applyParticipantLeave(room, participant, nowMs);
      },
    });
  }

  private async mutateRoom(
    input: MutationInput,
  ): Promise<PokeLoungeRoomSnapshot> {
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const result = await this.repository.mutate({
      operation: input.operation,
      roomCode: normalizedRoomCode,
      actorPlayerId: input.actorPlayerId,
      idempotencyKey: input.command.idempotencyKey,
      requestHash: hashPokeLoungeRoomCommand({
        operation: input.operation,
        roomCode: normalizedRoomCode,
        body: input.body,
      }),
      ...('expectedRevision' in input.command
        ? { expectedRevision: input.command.expectedRevision }
        : {}),
      nowMs: input.nowMs,
      apply: input.apply,
    });

    if (!result) {
      throw new NotFoundException('Poke Lounge room not found');
    }

    const snapshot = structuredClone(result.snapshot);
    const enrichedResult = { ...result, snapshot };
    if (result.committedChange) {
      await this.publish(
        result.outcome === 'committed' ? 'room-updated' : 'room-clock-advanced',
        await this.commandEventSnapshot(result.snapshot),
      );
    }

    this.throwForConflict(enrichedResult);

    return structuredClone(snapshot);
  }

  private throwForConflict(result: PokeLoungeRepositoryResult): void {
    if (result.outcome === 'revision-conflict') {
      throw new PokeLoungeRoomConflict('revision', result.snapshot);
    }

    if (result.outcome === 'idempotency-conflict') {
      throw new PokeLoungeRoomConflict('idempotency', result.snapshot);
    }
  }

  private async publish(
    type: PokeLoungeRoomCommittedEvent['type'],
    snapshot: PokeLoungeRoomSnapshot,
  ): Promise<void> {
    try {
      await this.eventPublisher.publish({
        type,
        snapshot: toPokeLoungePublicRoomState(snapshot),
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish committed Poke Lounge room event for ${snapshot.roomCode}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async commandEventSnapshot(
    snapshot: PokeLoungeRoomSnapshot,
  ): Promise<PokeLoungeRoomSnapshot> {
    const consistent = await this.competitiveProjection.findRoomSnapshot(
      snapshot.roomCode,
    );
    if (!consistent) {
      return structuredClone(snapshot);
    }
    return selectEventSnapshot(snapshot, consistent);
  }

  private async readCurrentSnapshot(
    roomCode: string,
    afterRevision?: number,
  ): Promise<PokeLoungeRoomSnapshot> {
    const consistent = await this.competitiveProjection.findRoomSnapshot(
      roomCode,
      afterRevision,
    );
    if (!consistent) {
      throw new NotFoundException('Poke Lounge room not found');
    }
    return consistent;
  }

  private normalizeNow(nowMs: number | undefined): number {
    return normalizeNow(nowMs, this.nowFactory);
  }
}

function selectEventSnapshot(
  snapshot: PokeLoungeRoomSnapshot,
  consistent: PokeLoungeRoomSnapshot,
): PokeLoungeRoomSnapshot {
  if (consistent.revision > snapshot.revision) {
    const selected = structuredClone(consistent);
    if ((snapshot.competitiveTransitions?.length ?? 0) > 0) {
      selected.competitiveTransitions = structuredClone(
        snapshot.competitiveTransitions,
      );
    }
    return selected;
  }
  if (snapshot.revision !== consistent.revision || !consistent.competitive) {
    return structuredClone(snapshot);
  }
  return {
    ...structuredClone(snapshot),
    competitive: structuredClone(consistent.competitive),
  };
}

function applyParticipantLeave(
  room: PokeLoungeRoomSnapshot,
  participant: PokeLoungeRoomParticipant,
  nowMs: number,
  options: {
    preserveRoundParticipant?: boolean;
    keepRoomOpen?: boolean;
  } = {},
): PokeLoungeRoomSnapshot {
  participant.connected = false;
  participant.ready = false;
  participant.leftAtMs = nowMs;
  delete participant.presencePendingUntilMs;
  delete participant.disconnectPendingUntilMs;
  delete participant.presenceEpoch;
  room.updatedAtMs = nowMs;

  if (
    room.status === 'waiting' ||
    (room.status === 'round-started' && !options.preserveRoundParticipant)
  ) {
    room.participants = room.participants.filter(function filterItem(row) {
      return row.playerId !== participant.playerId;
    });
    delete room.partySnapshots[participant.playerId];
  }

  if (participant.role === 'participant' && room.status === 'tournament') {
    completeParticipantLeaveAsForfeit(room, participant.playerId, nowMs);
  }

  if (
    room.status === 'round-started' &&
    !options.preserveRoundParticipant &&
    room.participants.filter(function filterItem(row) {
      return row.role === 'participant' && row.connected;
    }).length < 2
  ) {
    resetPokeLoungeRoundPreparation(room);
  }

  if (
    !room.participants.some(function testItem(row) {
      return row.connected && row.controller !== 'ai';
    }) &&
    !options.keepRoomOpen &&
    !(room.status === 'round-started' && options.preserveRoundParticipant)
  ) {
    room.status = 'closed';
    room.round.phase = 'completed';
    for (const ai of room.participants.filter(function filterItem(row) {
      return row.controller === 'ai';
    })) {
      delete room.partySnapshots[ai.playerId];
    }
    room.participants = room.participants.filter(function filterItem(row) {
      return row.controller !== 'ai';
    });
  }

  return room;
}

type NormalizedParticipantInput = {
  playerId: string;
  sessionId: string;
  userId?: string;
  displayName: string;
};

type NormalizedJoinInput = Omit<
  NormalizedParticipantInput,
  'playerId' | 'displayName'
> & {
  playerId?: string;
  displayName?: string;
};

type NormalizedCreateInput = NormalizedParticipantInput & {
  roomCode?: string;
  visibility: PokeLoungeRoomState['visibility'];
  roundDurationMs: number;
};

function normalizeCreateInput(
  input: CreatePokeLoungeRoomInput,
): NormalizedCreateInput {
  const playerId = input.playerId?.trim() || 'player-1';

  return {
    ...(input.roomCode?.trim()
      ? { roomCode: normalizeRoomCode(input.roomCode) }
      : {}),
    visibility: input.visibility === 'public' ? 'public' : 'private',
    playerId,
    sessionId: requireSessionId(input.sessionId),
    ...(input.userId?.trim() ? { userId: input.userId.trim() } : {}),
    displayName: input.displayName?.trim() || formatDefaultPlayerName(playerId),
    roundDurationMs: normalizeRoundDuration(input.roundDurationMs),
  };
}

function normalizeJoinInput(
  input: JoinPokeLoungeRoomInput,
): NormalizedJoinInput {
  const playerId = input.playerId?.trim();

  return {
    ...(playerId ? { playerId } : {}),
    sessionId: requireSessionId(input.sessionId),
    ...(input.userId?.trim() ? { userId: input.userId.trim() } : {}),
    ...(input.displayName?.trim()
      ? { displayName: input.displayName.trim() }
      : {}),
  };
}

function normalizedCommandBody<T extends Record<string, unknown>>(
  normalized: T,
  nowMs: number | undefined,
): T & { nowMs?: number } {
  return {
    ...normalized,
    ...(typeof nowMs === 'number' && Number.isFinite(nowMs)
      ? { nowMs: normalizeNow(nowMs) }
      : {}),
  };
}

function createParticipant(
  input: NormalizedParticipantInput,
  role: PokeLoungeRoomParticipant['role'],
  nowMs: number,
  requireSocketAcknowledgement = false,
): PokeLoungeRoomParticipant {
  return {
    sessionId: input.sessionId,
    playerId: input.playerId,
    ...(input.userId ? { userId: input.userId } : {}),
    displayName: input.displayName,
    controller: 'human',
    role,
    ready: false,
    connected: true,
    ...(requireSocketAcknowledgement
      ? {
          presencePendingUntilMs: nowMs + POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
        }
      : {}),
    joinedAtMs: nowMs,
  };
}

function appendAiParticipant(
  room: PokeLoungeRoomState,
  nowMs: number,
): PokeLoungeRoomParticipant {
  const aiPlayerId = `ai-${randomUUID()}`;
  const displayName = createAiDisplayName(room);
  const participant: PokeLoungeRoomParticipant = {
    sessionId: randomUUID(),
    playerId: aiPlayerId,
    displayName,
    controller: 'ai',
    role: 'participant',
    ready: true,
    connected: true,
    joinedAtMs: nowMs,
  };
  room.participants.push(participant);
  room.partySnapshots[aiPlayerId] = {
    version: 2,
    playerId: aiPlayerId,
    displayName,
    competitiveParty: createAiStarterParty(function random() {
      return randomInt(0, 1_000_000) / 1_000_000;
    }),
    updatedAtMs: nowMs,
  };
  return participant;
}

function createAiDisplayName(room: PokeLoungeRoomState): string {
  const usedNames = new Set(
    room.participants.map(function mapItem(participant) {
      return participant.displayName;
    }),
  );
  const startIndex = randomInt(0, AI_DISPLAY_NAMES.length);

  for (let offset = 0; offset < AI_DISPLAY_NAMES.length; offset += 1) {
    const index = (startIndex + offset) % AI_DISPLAY_NAMES.length;
    const displayName = AI_DISPLAY_NAMES[index];
    if (!usedNames.has(displayName)) {
      return displayName;
    }
  }

  throw new Error('AI display name pool exhausted');
}

function createAnonymousJoinActorPlayerId(sessionId: string): string {
  return `join-session-${createHash('sha256').update(sessionId).digest('hex')}`;
}

function createNextParticipantId(room: PokeLoungeRoomState): string {
  const playerIds = new Set(
    room.participants.map(function mapItem(participant) {
      return participant.playerId;
    }),
  );

  for (let index = 1; index <= room.participants.length + 1; index += 1) {
    const playerId = `player-${index}`;

    if (!playerIds.has(playerId)) {
      return playerId;
    }
  }

  throw new Error('Unable to allocate Poke Lounge participant id');
}

function requireSessionId(sessionId: string | undefined): string {
  const normalized = sessionId?.trim();

  if (!normalized) {
    throw new BadRequestException('sessionId is required');
  }

  return normalized;
}

function assertParticipantSession(
  participant: PokeLoungeRoomParticipant,
  sessionId: string | undefined,
  message: string,
): void {
  if (!sessionId || participant.sessionId !== sessionId) {
    throw new BadRequestException(message);
  }
}

function findParticipant(
  room: PokeLoungeRoomState,
  playerId: string,
): PokeLoungeRoomParticipant {
  const participant = room.participants.find(function findItem(candidate) {
    return candidate.playerId === playerId;
  });

  if (!participant) {
    throw new BadRequestException('Player is not in this room');
  }

  return participant;
}

function assertRoomJoinable(room: PokeLoungeRoomState): void {
  if (room.status !== 'waiting') {
    throw new BadRequestException('Room is not joinable');
  }
}

function assertExistingParticipantRejoinable(room: PokeLoungeRoomState): void {
  if (
    room.status !== 'waiting' &&
    room.status !== 'round-started' &&
    room.status !== 'tournament'
  ) {
    throw new BadRequestException('Room is not joinable');
  }
}

function findActiveMatch(
  room: PokeLoungeRoomState,
  matchId: string,
): PokeLoungeTournamentMatch {
  const match = room.tournament.bracket?.currentRound?.matches.find(
    function findItem(candidate) {
      return candidate.matchId === matchId;
    },
  );

  if (!match) {
    throw new BadRequestException('Match not found');
  }

  if (match.status !== 'ready') {
    throw new BadRequestException('Match result is already completed');
  }

  return match;
}

function assertValidMatchResult(
  room: PokeLoungeRoomState,
  match: PokeLoungeTournamentMatch,
  input: {
    reportingPlayerId: string;
    reportingSessionId?: string;
    winnerPlayerId: string;
    loserPlayerId: string;
    reason: PokeLoungeMatchResultReason;
  },
): void {
  const participantIds = new Set(match.participantIds);

  if (!participantIds.has(input.reportingPlayerId)) {
    throw new BadRequestException(
      'Reporting player is not assigned to this match',
    );
  }

  const reportingParticipant = findParticipant(room, input.reportingPlayerId);
  assertParticipantSession(
    reportingParticipant,
    input.reportingSessionId,
    'Match result sessionId does not match this participant',
  );

  if (!isMatchResultReason(input.reason)) {
    throw new BadRequestException('Unsupported match result reason');
  }

  if (
    !participantIds.has(input.winnerPlayerId) ||
    !participantIds.has(input.loserPlayerId) ||
    input.winnerPlayerId === input.loserPlayerId
  ) {
    throw new BadRequestException(
      'Winner and loser must be match participants',
    );
  }
}

function completeMatch(
  room: PokeLoungeRoomState,
  match: PokeLoungeTournamentMatch,
  winnerPlayerId: string,
  reason: PokeLoungeMatchResultReason,
  nowMs: number,
): void {
  completePokeLoungeTournamentMatch(
    room,
    match.matchId,
    winnerPlayerId,
    reason,
    nowMs,
  );
  convergeOfflinePokeLoungeTournamentMatches(room, nowMs);
}

function completeParticipantLeaveAsForfeit(
  room: PokeLoungeRoomState,
  playerId: string,
  nowMs: number,
): void {
  if (
    room.status !== 'tournament' ||
    room.tournament.activeMatchAuthority === 'server'
  ) {
    return;
  }

  const match = room.tournament.bracket?.currentRound?.matches.find(
    function findItem(candidate) {
      return (
        candidate.status === 'ready' &&
        candidate.participantIds.includes(playerId)
      );
    },
  );
  const opponentId = match?.participantIds.find(function findItem(id) {
    return id !== playerId;
  });

  if (match && opponentId) {
    completeMatch(room, match, opponentId, 'forfeit', nowMs);
  }
}

function normalizePartySnapshot(
  party: UpdatePokeLoungePartySnapshotInput['competitiveParty'],
): PokeLoungePartySnapshot['competitiveParty'] {
  try {
    return normalizeCompetitiveParty(party);
  } catch (error) {
    if (error instanceof CompetitivePartyValidationError) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'POKE_LOUNGE_COMPETITIVE_PARTY_INVALID',
        message: 'Competitive party snapshot is invalid',
        reason: error.reason,
      });
    }
    throw error;
  }
}

function normalizeRoundDuration(roundDurationMs: number | undefined): number {
  const selected = ROUND_DURATION_OPTIONS_MS.find(
    (duration) => duration === roundDurationMs,
  );
  if (selected !== undefined) return selected;
  if (process.env.NODE_ENV !== 'test') {
    return DEFAULT_ROUND_DURATION_MS;
  }

  if (
    typeof roundDurationMs !== 'number' ||
    !Number.isFinite(roundDurationMs)
  ) {
    return DEFAULT_ROUND_DURATION_MS;
  }

  return Math.max(
    MIN_ROUND_DURATION_MS,
    Math.min(MAX_ROUND_DURATION_MS, Math.floor(roundDurationMs)),
  );
}

function normalizeNow(
  nowMs: number | undefined,
  nowFactory: () => number = function callback() {
    return Date.now();
  },
): number {
  return typeof nowMs === 'number' && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor(nowMs))
    : nowFactory();
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function deriveCreateOrJoinIdempotencyKey(
  createIdempotencyKey: string,
): string {
  return deriveIdempotencyKey('create-or-join', createIdempotencyKey);
}

function deriveIdempotencyKey(
  namespace: string,
  idempotencyKey: string,
): string {
  const bytes = createHash('sha256')
    .update(`poke-lounge-${namespace}:${idempotencyKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isPublicRoomMatchmakingCandidate(
  room: PokeLoungeRoomSnapshot,
): boolean {
  return (
    room.visibility === 'public' &&
    room.status === 'waiting' &&
    room.round.phase === 'waiting' &&
    room.participants.length < MAX_ROOM_OCCUPANTS
  );
}

function compareMatchmakingRooms(
  left: PokeLoungeRoomSnapshot,
  right: PokeLoungeRoomSnapshot,
): number {
  return (
    left.createdAtMs - right.createdAtMs ||
    left.roomCode.localeCompare(right.roomCode)
  );
}

function isMatchResultReason(
  value: unknown,
): value is PokeLoungeMatchResultReason {
  return (
    typeof value === 'string' &&
    MATCH_RESULT_REASONS.has(value as PokeLoungeMatchResultReason)
  );
}

function formatDefaultPlayerName(playerId: string): string {
  const match = /^player-(\d+)$/.exec(playerId);

  return match ? `Player ${match[1]}` : playerId;
}

function createRoomCode(): string {
  return Array.from({ length: 6 }, function callback() {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);

    return ROOM_CODE_ALPHABET[index];
  }).join('');
}

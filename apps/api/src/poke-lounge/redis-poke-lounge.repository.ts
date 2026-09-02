import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  canonicalize,
  createCanonicalIdRecord,
  hashCanonicalState,
  type CanonicalTerminalResult,
} from '@poke-lounge/battle/canonical-state';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from '@poke-lounge/battle/competitive-ruleset-config';
import { createSeededRandom } from '@poke-lounge/battle/prng';
import { getReadyTournamentMatches } from '@poke-lounge/battle/tournament-bracket';
import {
  resolveTurn,
  validateCompetitiveAction,
} from '@poke-lounge/battle/resolve-turn';
import { scoreRemainingHpPercentage } from '@poke-lounge/battle/tournament-scoring';
import { type CanonicalCompetitiveAction } from '@poke-lounge/battle/actions';
import { type NormalizedCompetitiveParty } from '@poke-lounge/battle/competitive-party';
import type {
  CompetitiveActionRepository,
  CompetitiveActionResult,
  CompetitivePendingTurn,
  CompetitiveTurnTimeoutResult,
} from './competitive/competitive-action.repository';
import { COMPETITIVE_TURN_DEADLINE_MS } from './competitive/competitive-action.repository';
import type {
  CompetitiveActionProjection,
  CompetitiveActionReceiptStatus,
  SubmitCompetitiveActionInput,
} from './competitive/competitive-action.types';
import type {
  CompetitiveMatchRepository,
  CompetitiveSeatBindingResult,
  CompetitiveSeatRecord,
} from './competitive/competitive-match.repository';
import {
  createSessionCompetitiveAccountId,
  isCompetitiveAssignmentMember,
  planCompetitiveSeatBinding,
} from './competitive/competitive-match.repository';
import type {
  CompetitiveMatchAssignment,
  CompetitivePlayerAccount,
} from './competitive/competitive-match.types';
import { toCompetitiveProjection } from './competitive/competitive-projection';
import { createCompetitiveAssignment } from './competitive/competitive-match.service';
import {
  advancePokeLoungeRoomClock,
  completePokeLoungeTournamentMatch,
  convergeOfflinePokeLoungeTournamentMatches,
  expirePendingPokeLoungePresence,
  getPokeLoungeRoomExpiresAtMs,
  normalizeLegacyPokeLoungeRoomSnapshot,
  POKE_LOUNGE_ROOM_CAPACITY,
} from './poke-lounge-room-policy';
import type {
  PokeLoungeCreateResult,
  PokeLoungeRepositoryResult,
  PokeLoungeRoomRepository,
  PokeLoungeRoomSnapshot,
} from './poke-lounge-room.repository';
import type {
  CompetitiveTerminalTransition,
  PokeLoungeRoomState,
} from './poke-lounge-room.types';
import { PokeLoungeLiveStateService } from './poke-lounge-live-state.service';

const REDIS_DOCUMENT_VERSION = 1;
const REDIS_WRITE_ATTEMPTS = 24;

interface RedisRoomCommandReceipt {
  requestHash: string;
  revision: number;
}

interface RedisCompetitiveActionReceipt {
  matchId: string;
  turn: number;
  actorPlayerId: string;
  actorAccountId: string;
  clientCommandId: string;
  action: CanonicalCompetitiveAction;
  requestHash: string;
  status: CompetitiveActionReceiptStatus;
  response: CompetitiveActionProjection;
  createdAtMs: number;
  resolvedAtMs: number | null;
}

interface RedisPokeLoungeDocument {
  version: typeof REDIS_DOCUMENT_VERSION;
  id: string;
  room: PokeLoungeRoomSnapshot;
  commands: Record<string, RedisRoomCommandReceipt>;
  seats: CompetitiveSeatRecord[];
  matches: Record<string, CompetitiveMatchAssignment>;
  actions: Record<string, RedisCompetitiveActionReceipt>;
}

type CreateCommandReceipt = {
  requestHash: string;
  roomCode: string;
};

@Injectable()
export class RedisPokeLoungeRepository
  implements
    PokeLoungeRoomRepository,
    CompetitiveMatchRepository,
    CompetitiveActionRepository
{
  constructor(private readonly redis: PokeLoungeLiveStateService) {}

  async create(
    input: Parameters<PokeLoungeRoomRepository['create']>[0],
  ): Promise<PokeLoungeCreateResult> {
    const snapshot = prepareCreatedSnapshot(input.room);
    const document: RedisPokeLoungeDocument = {
      version: REDIS_DOCUMENT_VERSION,
      id: randomUUID(),
      room: toStoredRoom(snapshot),
      commands: {
        [roomCommandKey(input.actorPlayerId, input.idempotencyKey)]: {
          requestHash: input.requestHash,
          revision: snapshot.revision,
        },
      },
      seats: [],
      matches: {},
      actions: {},
    };
    const created = await this.redis.createRoomState({
      roomCode: snapshot.roomCode,
      document: serializeDocument(document),
      expiresAtMs: snapshot.expiresAtMs,
      nowMs: input.nowMs,
      capacity: POKE_LOUNGE_ROOM_CAPACITY,
      actorPlayerId: input.actorPlayerId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      visibility: snapshot.visibility,
    });

    if (
      created.outcome !== 'command-exists' &&
      created.outcome !== 'public-room-exists'
    ) {
      if (created.outcome === 'created') {
        return createRepositoryResult(snapshot, 'committed', true);
      }
      return { outcome: created.outcome };
    }

    if (created.outcome === 'public-room-exists') {
      return { outcome: created.outcome, roomCode: created.roomCode };
    }

    const receipt = parseCreateCommandReceipt(created.receipt);
    const current = await this.readDocument(receipt.roomCode);
    if (!current) {
      throw new Error('Poke Lounge create receipt points to an expired room');
    }
    return createRepositoryResult(
      projectRoomSnapshot(current.document),
      receipt.requestHash === input.requestHash
        ? 'replayed'
        : 'idempotency-conflict',
      false,
    );
  }

  async getAndAdvance(
    roomCode: string,
    nowMs: number,
  ): Promise<{
    snapshot: PokeLoungeRoomSnapshot | null;
    committedChange: boolean;
  }> {
    await this.purgeExpired(nowMs);

    for (let attempt = 0; attempt < REDIS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.readDocument(roomCode);
      if (!current) {
        return { snapshot: null, committedChange: false };
      }
      const advanced = normalizeAndAdvanceSnapshot(
        current.document.room,
        nowMs,
      );
      if (!advanced) {
        return {
          snapshot: projectRoomSnapshot(current.document),
          committedChange: false,
        };
      }

      removeParticipantSeats(current.document, current.document.room, advanced);
      ensureActiveTournamentAssignment(current.document, advanced);
      current.document.room = toStoredRoom(advanced);
      if (await this.commitDocument(current.version, current.document)) {
        return {
          snapshot: projectRoomSnapshot(current.document),
          committedChange: true,
        };
      }
    }

    throw new Error('Poke Lounge Redis room clock update was contended');
  }

  async listRoomCodes(nowMs: number): Promise<string[]> {
    await this.purgeExpired(nowMs);
    return this.redis.listRoomStateCodes();
  }

  async mutate(
    input: Parameters<PokeLoungeRoomRepository['mutate']>[0],
  ): Promise<PokeLoungeRepositoryResult | null> {
    await this.purgeExpired(input.nowMs);

    for (let attempt = 0; attempt < REDIS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.readDocument(input.roomCode);
      if (!current) {
        return null;
      }
      const document = current.document;
      const receipt =
        document.commands[
          roomCommandKey(input.actorPlayerId, input.idempotencyKey)
        ];
      const replaysRoundReady =
        input.operation === 'round-ready' &&
        receipt?.requestHash === input.requestHash;

      if (receipt?.requestHash === input.requestHash && !replaysRoundReady) {
        return createRepositoryResult(
          projectRoomSnapshot(document),
          'replayed',
          false,
        );
      }

      const advanced = normalizeAndAdvanceSnapshot(document.room, input.nowMs);
      if (advanced) {
        removeParticipantSeats(document, document.room, advanced);
        ensureActiveTournamentAssignment(document, advanced);
        document.room = toStoredRoom(advanced);
        if (!(await this.commitDocument(current.version, document))) {
          continue;
        }
        return createRepositoryResult(
          projectRoomSnapshot(document),
          replaysRoundReady
            ? 'replayed'
            : receipt
              ? 'idempotency-conflict'
              : 'revision-conflict',
          true,
        );
      }

      if (replaysRoundReady) {
        return createRepositoryResult(
          projectRoomSnapshot(document),
          'replayed',
          false,
        );
      }
      if (receipt) {
        return createRepositoryResult(
          projectRoomSnapshot(document),
          'idempotency-conflict',
          false,
        );
      }
      if (
        input.expectedRevision !== undefined &&
        document.room.revision !== input.expectedRevision
      ) {
        return createRepositoryResult(
          projectRoomSnapshot(document),
          'revision-conflict',
          false,
        );
      }

      const next = prepareMutatedSnapshot(
        document.room,
        input.apply(structuredClone(document.room)),
      );
      removeParticipantSeats(document, document.room, next);
      if (input.operation === 'leave') {
        const activeMatch = findActiveMatchForPlayer(
          document,
          input.actorPlayerId,
        );
        if (activeMatch) {
          completeServerAuthorityParticipantLeave(
            document,
            document.room,
            next,
            activeMatch.bracketMatchId,
            input.actorPlayerId,
            input.nowMs,
          );
        }
      }
      ensureActiveTournamentAssignment(document, next);
      document.commands[
        roomCommandKey(input.actorPlayerId, input.idempotencyKey)
      ] = {
        requestHash: input.requestHash,
        revision: next.revision,
      };
      document.room = toStoredRoom(next);
      if (!(await this.commitDocument(current.version, document))) {
        continue;
      }

      return createRepositoryResult(
        projectRoomSnapshot(document),
        'committed',
        true,
      );
    }

    throw new Error('Poke Lounge Redis room mutation was contended');
  }

  purgeExpired(nowMs: number): Promise<number> {
    return this.redis.purgeExpiredRoomStates(nowMs);
  }

  async bindSeatAndAssign(
    input: Parameters<CompetitiveMatchRepository['bindSeatAndAssign']>[0],
  ): Promise<CompetitiveSeatBindingResult> {
    for (let attempt = 0; attempt < REDIS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.readDocument(input.roomCode);
      if (!current) {
        return { outcome: 'room-not-found' };
      }
      const document = current.document;
      const nowMs = Date.now();
      const plan = planCompetitiveSeatBinding({
        room: document.room,
        seats: document.seats,
        sessionId: input.sessionId,
        accountId: input.accountId,
      });
      if (!('assignmentPlayers' in plan)) {
        return plan;
      }

      const requestedParticipant = document.room.participants.find(
        function findItem(participant) {
          return participant.sessionId === input.sessionId;
        },
      );
      const existingMatch = requestedParticipant
        ? findActiveMatchForPlayer(document, requestedParticipant.playerId)
        : null;
      const activeAssignment =
        document.room.status === 'waiting' ||
        document.room.status === 'round-started'
          ? null
          : existingMatch;
      if (
        activeAssignment &&
        requestedParticipant?.role === 'participant' &&
        requestedParticipant.connected &&
        !isCompetitiveAssignmentMember(activeAssignment, {
          playerId: requestedParticipant.playerId,
          accountId: input.accountId,
        })
      ) {
        if (plan.outcome !== 'bind') {
          return {
            outcome: 'bound-ineligible',
            assignment: null,
            eligible: false,
          };
        }
        document.seats.push(plan.seat);
        renewRoomLease(document.room, nowMs);
        if (!(await this.commitDocument(current.version, document))) {
          continue;
        }
        return {
          outcome: 'bound-ineligible',
          assignment: null,
          eligible: false,
        };
      }

      if (activeAssignment && existingMatch) {
        if (plan.outcome === 'bind') {
          document.seats.push(plan.seat);
          renewRoomLease(document.room, nowMs);
          if (!(await this.commitDocument(current.version, document))) {
            continue;
          }
        }
        return {
          outcome: 'already-assigned',
          assignment: structuredClone(activeAssignment),
          eligible: true,
          committed: false,
          room: projectRoomSnapshot(document),
          projection: projectMatch(document, existingMatch),
        };
      }

      if (plan.outcome === 'bind') {
        document.seats.push(plan.seat);
      }
      if (!plan.assignmentPlayers) {
        if (plan.outcome !== 'bind') {
          return {
            outcome: 'bound-casual',
            assignment: null,
            eligible: false,
          };
        }
        renewRoomLease(document.room, nowMs);
        if (!(await this.commitDocument(current.version, document))) {
          continue;
        }
        return {
          outcome: 'bound-casual',
          assignment: null,
          eligible: false,
        };
      }

      const assignment = input.createAssignment({
        roomId: document.id,
        roomCode: document.room.roomCode,
        assignmentRevision: 1,
        turnStartedAtMs: nowMs,
        players: plan.assignmentPlayers,
        bracketMatchId: plan.assignmentBracketMatchId!,
        kind: plan.assignmentKind!,
        parties: toCompetitiveParties(document.room, plan.assignmentPlayers),
      });
      document.matches[assignment.matchId] = assignment;
      touchRoom(document.room, nowMs);
      document.room.tournament.activeMatchAuthority = 'server';
      if (!(await this.commitDocument(current.version, document))) {
        continue;
      }
      const projection = projectMatch(document, assignment);

      return {
        outcome: 'assigned',
        assignment: structuredClone(assignment),
        eligible: true,
        committed: true,
        room: projectRoomSnapshot(document),
        projection,
      };
    }

    throw new Error('Poke Lounge Redis seat binding was contended');
  }

  async submit(
    input: SubmitCompetitiveActionInput,
  ): Promise<CompetitiveActionResult> {
    const nowMs = Date.now();

    for (let attempt = 0; attempt < REDIS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.readDocument(input.roomCode);
      if (!current) {
        return { outcome: 'room-not-found' };
      }
      const document = current.document;
      const match = document.matches[input.matchId];
      if (!match) {
        return { outcome: 'match-not-found' };
      }
      const actor = match.playerAccounts.find(function findItem(candidate) {
        return candidate.accountId === input.accountId;
      });
      if (!actor) {
        return { outcome: 'actor-not-assigned' };
      }

      const requestHash = hashCompetitiveActionRequest(input);
      const existing = Object.values(document.actions).find(
        function findItem(action) {
          return (
            action.matchId === match.matchId &&
            action.actorPlayerId === actor.playerId &&
            action.clientCommandId === input.clientCommandId
          );
        },
      );
      if (existing) {
        return existing.requestHash === requestHash
          ? {
              outcome: 'replayed',
              response: structuredClone(existing.response),
              room: projectRoomSnapshot(document),
              committed: false,
            }
          : { outcome: 'command-conflict' };
      }
      if (!isSupportedCompetitiveRuleset(match)) {
        return { outcome: 'ruleset-mismatch' };
      }
      if (match.status === 'completed' || match.currentState.terminal) {
        return { outcome: 'terminal' };
      }
      if (match.assignmentRevision !== input.assignmentRevision) {
        return { outcome: 'assignment-revision-conflict' };
      }
      if (match.currentTurn !== input.turn) {
        return { outcome: 'turn-conflict' };
      }

      const turnActions = findTurnActions(document, match);
      if (
        turnActions.some(function testItem(receipt) {
          return receipt.actorPlayerId === actor.playerId;
        })
      ) {
        return { outcome: 'actor-turn-conflict' };
      }
      if (nowMs >= match.turnStartedAtMs + COMPETITIVE_TURN_DEADLINE_MS) {
        return { outcome: 'turn-conflict' };
      }

      try {
        validateCompetitiveAction({
          state: match.currentState,
          playerId: actor.playerId,
          action: input.action,
        });
      } catch {
        return { outcome: 'illegal-action' };
      }

      if (turnActions.length === 0) {
        match.status = 'active';
        touchRoom(document.room, nowMs);
        const response = toCompetitiveProjection(match, [actor.playerId]);
        document.actions[
          competitiveActionKey(
            match.matchId,
            actor.playerId,
            input.clientCommandId,
          )
        ] = createActionReceipt({
          match,
          actor,
          input,
          requestHash,
          response,
          status: 'pending',
          createdAtMs: nowMs,
          resolvedAtMs: null,
        });
        if (!(await this.commitDocument(current.version, document))) {
          continue;
        }
        return {
          outcome: 'accepted',
          response,
          room: projectRoomSnapshot(document),
          committed: true,
        };
      }
      if (turnActions.length !== 1) {
        return { outcome: 'turn-conflict' };
      }

      const actionsByPlayerId =
        createCanonicalIdRecord<CanonicalCompetitiveAction>([
          [turnActions[0].actorPlayerId, turnActions[0].action],
          [actor.playerId, input.action],
        ]);
      const resolved = resolveCompetitiveTurn(
        document,
        match,
        actionsByPlayerId,
        nowMs,
      );
      const resolvedReceipt = createActionReceipt({
        match,
        actor,
        input,
        requestHash,
        response: resolved.response,
        status: 'resolved',
        createdAtMs: nowMs,
        resolvedAtMs: nowMs,
      });
      resolveTurnReceipts(
        [turnActions[0], resolvedReceipt],
        resolved.response,
        nowMs,
      );
      document.actions[
        competitiveActionKey(
          match.matchId,
          actor.playerId,
          input.clientCommandId,
        )
      ] = resolvedReceipt;
      if (!(await this.commitDocument(current.version, document))) {
        continue;
      }

      return {
        outcome: 'accepted',
        ...resolved,
        committed: true,
      };
    }

    throw new Error('Poke Lounge Redis competitive action was contended');
  }

  async findPendingTurns(): Promise<CompetitivePendingTurn[]> {
    const roomCodes = await this.redis.listRoomStateCodes();
    const rooms = await Promise.all(
      roomCodes.map(
        function mapItem(
          this: RedisPokeLoungeRepository,
          roomCode: string,
        ): Promise<{
          version: number;
          document: RedisPokeLoungeDocument;
        } | null> {
          return this.readDocument(roomCode);
        }.bind(this),
      ),
    );

    return rooms.flatMap(function mapItem(current) {
      if (!current) {
        return [];
      }
      return findActiveMatches(current.document).map(function mapItem(match) {
        return toCompetitivePendingTurn(current.document.room.roomCode, match);
      });
    });
  }

  async expirePendingTurn(input: {
    roomCode: string;
    matchId: string;
    turn: number;
    nowMs: number;
  }): Promise<CompetitiveTurnTimeoutResult> {
    for (let attempt = 0; attempt < REDIS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.readDocument(input.roomCode);
      if (!current) {
        return { outcome: 'ignored' };
      }
      const document = current.document;
      const match = document.matches[input.matchId];
      if (
        !match ||
        match.status === 'completed' ||
        match.currentState.terminal ||
        match.currentTurn !== input.turn
      ) {
        return { outcome: 'ignored' };
      }
      const deadlineMs = match.turnStartedAtMs + COMPETITIVE_TURN_DEADLINE_MS;
      if (input.nowMs < deadlineMs) {
        return { outcome: 'not-due', retryAtMs: deadlineMs };
      }

      const resolved = completeExpiredTurn(document, match, input.nowMs);
      const nextMatch = document.matches[input.matchId];
      const nextTurn = nextMatch
        ? nextMatch.status === 'pending' || nextMatch.status === 'active'
          ? toCompetitivePendingTurn(document.room.roomCode, nextMatch)
          : null
        : null;
      if (!(await this.commitDocument(current.version, document))) {
        continue;
      }
      return { outcome: 'resolved', ...resolved, nextTurn };
    }

    throw new Error('Poke Lounge Redis turn timeout was contended');
  }

  async findRoomSnapshot(
    roomCode: string,
    afterRevision?: number,
  ): Promise<PokeLoungeRoomSnapshot | null> {
    if (
      afterRevision !== undefined &&
      (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
    ) {
      throw new Error('afterRevision must be a non-negative safe integer');
    }
    const current = await this.readDocument(roomCode);
    if (!current) {
      return null;
    }
    const snapshot = projectRoomSnapshot(current.document);
    snapshot.competitiveTransitions =
      afterRevision === undefined
        ? []
        : Object.values(current.document.matches)
            .filter(function filterItem(match) {
              return (
                match.status === 'completed' &&
                match.terminalEventId !== null &&
                match.terminalRoomRevision !== null &&
                match.terminalRoomRevision > afterRevision &&
                match.terminalRoomRevision <= snapshot.revision
              );
            })
            .sort(function compareItems(left, right) {
              return (
                left.terminalRoomRevision! - right.terminalRoomRevision! ||
                left.terminalEventId!.localeCompare(right.terminalEventId!)
              );
            })
            .slice(0, 8)
            .map(function mapItem(match) {
              return toTerminalTransition(toCompetitiveProjection(match, []));
            });
    return snapshot;
  }

  private async readDocument(roomCode: string): Promise<{
    version: number;
    document: RedisPokeLoungeDocument;
  } | null> {
    const stored = await this.redis.getRoomState(roomCode);
    if (!stored) {
      return null;
    }
    return {
      version: stored.version,
      document: parseDocument(stored.document),
    };
  }

  private async commitDocument(
    expectedVersion: number,
    document: RedisPokeLoungeDocument,
  ): Promise<boolean> {
    const result = await this.redis.compareAndSetRoomState({
      roomCode: document.room.roomCode,
      expectedVersion,
      document: serializeDocument(document),
      expiresAtMs: document.room.expiresAtMs,
    });
    return result === 'committed';
  }
}

function ensureActiveTournamentAssignment(
  document: RedisPokeLoungeDocument,
  snapshot: PokeLoungeRoomSnapshot,
): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bracket = snapshot.tournament.bracket;
    const readyMatches = bracket ? getReadyTournamentMatches(bracket) : [];
    snapshot.tournament.activeMatchId = readyMatches[0]?.matchId ?? null;

    if (readyMatches.length === 0) {
      snapshot.tournament.activeMatchAuthority = null;
      return;
    }

    let shouldRecompute = false;
    for (const bracketMatch of readyMatches) {
      const players = toCompetitivePlayers(
        snapshot,
        document.seats,
        bracketMatch.participantIds,
        snapshot.roomCode,
      );
      if (!players) {
        snapshot.tournament.activeMatchAuthority = 'casual';
        return;
      }

      const existing = Object.values(document.matches).find(
        function findItem(match) {
          return match.bracketMatchId === bracketMatch.matchId;
        },
      );
      if (existing) {
        const matchesBracket =
          existing.kind === 'tournament-unranked' &&
          hasSameCompetitivePlayers(existing.playerAccounts, players);
        if (!matchesBracket) {
          if (existing.status === 'completed') {
            throw new Error(
              'Completed competitive match does not match the activated bracket',
            );
          }
          deleteMatch(document, existing.matchId);
        } else if (existing.status === 'completed' && existing.terminalResult) {
          completePokeLoungeTournamentMatch(
            snapshot,
            bracketMatch.matchId,
            existing.terminalResult.winnerPlayerId,
            existing.terminalResult.reason,
            existing.completedAt?.getTime() ?? snapshot.updatedAtMs,
            createTerminalHpScores(existing.currentState),
          );
          shouldRecompute = true;
          break;
        } else {
          const offlinePlayerId = selectOfflineMatchLoser(
            snapshot,
            bracketMatch.participantIds,
          );
          if (offlinePlayerId) {
            completeServerAuthorityParticipantLeave(
              document,
              snapshot,
              snapshot,
              bracketMatch.matchId,
              offlinePlayerId,
              snapshot.updatedAtMs,
            );
            shouldRecompute = true;
            break;
          }
          continue;
        }
      }

      const offlinePlayerId = selectOfflineMatchLoser(
        snapshot,
        bracketMatch.participantIds,
      );
      if (offlinePlayerId) {
        convergeOfflinePokeLoungeTournamentMatches(
          snapshot,
          snapshot.updatedAtMs,
          bracketMatch.matchId,
        );
        shouldRecompute = true;
        break;
      }

      const assignment = createCompetitiveAssignment({
        roomId: document.id,
        roomCode: snapshot.roomCode,
        bracketMatchId: bracketMatch.matchId,
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        turnStartedAtMs: snapshot.updatedAtMs,
        players,
        parties: toCompetitiveParties(snapshot, players),
      });
      document.matches[assignment.matchId] = assignment;
    }

    if (shouldRecompute) {
      continue;
    }

    snapshot.tournament.activeMatchAuthority = 'server';
    return;
  }

  throw new Error('Tournament assignment convergence exceeded its bound');
}

function completeServerAuthorityParticipantLeave(
  document: RedisPokeLoungeDocument,
  current: PokeLoungeRoomSnapshot,
  next: PokeLoungeRoomSnapshot,
  bracketMatchId: string,
  playerId: string,
  nowMs: number,
): void {
  if (
    current.status !== 'tournament' ||
    current.tournament.activeMatchAuthority !== 'server' ||
    !bracketMatchId
  ) {
    return;
  }
  const bracketMatch = current.tournament.bracket?.currentRound?.matches.find(
    function findItem(candidate) {
      return candidate.matchId === bracketMatchId;
    },
  );
  if (
    bracketMatch?.status !== 'ready' ||
    !bracketMatch.participantIds.includes(playerId)
  ) {
    return;
  }
  const winnerPlayerId = bracketMatch.participantIds.find(
    function findItem(candidate) {
      return candidate !== playerId;
    },
  );
  const match = Object.values(document.matches).find(
    function findItem(candidate) {
      return (
        candidate.bracketMatchId === bracketMatchId &&
        candidate.status !== 'completed'
      );
    },
  );
  if (!winnerPlayerId || !match) {
    throw new Error('Active server-authority match is missing');
  }

  const terminal = createTerminalResult(winnerPlayerId, playerId, 'forfeit');
  match.currentState.terminal = terminal;
  match.currentStateHash = hashCanonicalState(match.currentState);
  match.terminalResult = terminal;
  match.status = 'completed';
  match.completedAt = new Date(nowMs);
  const finalized = finalizeCompetitiveTerminalMatch(
    document,
    match,
    next.revision,
    next,
  );
  next.competitiveTransitions = [
    ...(next.competitiveTransitions ?? []),
    toTerminalTransition(finalized.projection),
  ];
  if (finalized.nextCompetitive) {
    next.competitive = finalized.nextCompetitive;
  }
  resolveTurnReceipts(
    Object.values(document.actions).filter(function filterItem(action) {
      return action.matchId === match.matchId && action.status === 'pending';
    }),
    finalized.projection,
    nowMs,
  );
}

function finalizeCompetitiveTerminalMatch(
  document: RedisPokeLoungeDocument,
  match: CompetitiveMatchAssignment,
  terminalRoomRevision: number,
  state: PokeLoungeRoomSnapshot = document.room,
): {
  projection: CompetitiveActionProjection;
  nextCompetitive: CompetitiveActionProjection | null;
} {
  if (
    match.status !== 'completed' ||
    !match.terminalResult ||
    !match.currentState.terminal ||
    !match.completedAt
  ) {
    throw new Error('Competitive terminal finalization requires a result');
  }
  if (!match.terminalEventId) {
    match.terminalEventId = randomUUID();
    match.terminalRoomRevision = terminalRoomRevision;
  } else if (match.terminalRoomRevision !== terminalRoomRevision) {
    throw new Error('Competitive terminal metadata revision is immutable');
  }

  const bracketMatch = state.tournament.bracket?.currentRound?.matches.find(
    function findItem(candidate) {
      return candidate.matchId === match.bracketMatchId;
    },
  );
  const nextCompetitive =
    bracketMatch?.status === 'ready'
      ? advanceTournamentAuthorityMatch(document, match, state)
      : null;
  return {
    projection: toCompetitiveProjection(match, []),
    nextCompetitive,
  };
}

function advanceTournamentAuthorityMatch(
  document: RedisPokeLoungeDocument,
  completedMatch: CompetitiveMatchAssignment,
  state: PokeLoungeRoomSnapshot,
): CompetitiveActionProjection | null {
  const terminal = completedMatch.terminalResult;
  if (!terminal) {
    throw new Error('Tournament authority match completed without a result');
  }
  completePokeLoungeTournamentMatch(
    state,
    completedMatch.bracketMatchId,
    terminal.winnerPlayerId,
    terminal.reason,
    completedMatch.completedAt?.getTime() ?? Date.now(),
    createTerminalHpScores(completedMatch.currentState),
  );
  ensureActiveTournamentAssignment(document, state);

  const readyMatchIds = new Set(
    state.tournament.bracket
      ? getReadyTournamentMatches(state.tournament.bracket).map(
          function mapItem(match) {
            return match.matchId;
          },
        )
      : [],
  );
  const nextMatch = findActiveMatches(document).find(
    function findItem(candidate) {
      return readyMatchIds.has(candidate.bracketMatchId);
    },
  );
  return nextMatch ? toCompetitiveProjection(nextMatch, []) : null;
}

function completeExpiredTurn(
  document: RedisPokeLoungeDocument,
  match: CompetitiveMatchAssignment,
  nowMs: number,
): { response: CompetitiveActionProjection; room: PokeLoungeRoomSnapshot } {
  const receipts = findTurnActions(document, match);
  const actionsByPlayerId = createCanonicalIdRecord<CanonicalCompetitiveAction>(
    receipts.map(function mapItem(receipt) {
      return [receipt.actorPlayerId, receipt.action];
    }),
  );
  const resolved = resolveCompetitiveTurn(
    document,
    match,
    actionsByPlayerId,
    nowMs,
  );
  resolveTurnReceipts(receipts, resolved.response, nowMs);
  return resolved;
}

function resolveCompetitiveTurn(
  document: RedisPokeLoungeDocument,
  match: CompetitiveMatchAssignment,
  actionsByPlayerId: Readonly<Record<string, CanonicalCompetitiveAction>>,
  nowMs: number,
): { response: CompetitiveActionProjection; room: PokeLoungeRoomSnapshot } {
  const resolved = resolveTurn({
    state: match.currentState,
    actionsByPlayerId: createCanonicalIdRecord(
      Object.entries(actionsByPlayerId),
    ),
    random: createSeededRandom(`${match.serverSeed}:${match.currentTurn}`),
  });
  if (resolved.terminal && resolved.terminal.reason !== 'faint') {
    throw new Error('Stage 3 engine produced an unsupported terminal reason');
  }

  match.currentState = resolved.state;
  match.currentStateHash = resolved.stateHash;
  match.currentTurn = resolved.state.turn;
  match.turnStartedAtMs = nowMs;
  match.terminalResult = resolved.terminal;
  match.status = resolved.terminal ? 'completed' : 'active';
  match.completedAt = resolved.terminal ? new Date(nowMs) : null;
  let response: CompetitiveActionProjection;
  let nextCompetitive: CompetitiveActionProjection | null = null;
  if (resolved.terminal) {
    const finalized = finalizeCompetitiveTerminalMatch(
      document,
      match,
      document.room.revision + 1,
    );
    response = finalized.projection;
    nextCompetitive = finalized.nextCompetitive;
  } else {
    response = toCompetitiveProjection(match, []);
  }
  touchRoom(document.room, nowMs);

  const room = projectRoomSnapshot(document);
  if (resolved.terminal) {
    room.competitiveTransitions = [toTerminalTransition(response)];
  } else {
    room.competitive = response;
  }
  if (nextCompetitive) {
    room.competitive = nextCompetitive;
  }
  return { response, room };
}

function projectRoomSnapshot(
  document: RedisPokeLoungeDocument,
): PokeLoungeRoomSnapshot {
  const snapshot = structuredClone(document.room);
  delete snapshot.competitive;
  delete snapshot.competitiveAssignments;
  delete snapshot.competitiveTransitions;
  const activeMatchIds = new Set(
    snapshot.tournament.bracket
      ? getReadyTournamentMatches(snapshot.tournament.bracket).map(
          function mapItem(match) {
            return match.matchId;
          },
        )
      : [],
  );
  if (
    activeMatchIds.size === 0 ||
    snapshot.tournament.activeMatchAuthority !== 'server'
  ) {
    snapshot.competitiveAssignments = [];
    return snapshot;
  }
  const matches = findActiveMatches(document).filter(
    function filterItem(candidate) {
      return activeMatchIds.has(candidate.bracketMatchId);
    },
  );
  snapshot.competitiveAssignments = matches.map(function mapItem(match) {
    return projectMatch(document, match);
  });
  if (matches[0]) {
    snapshot.competitive = projectMatch(document, matches[0]);
  }
  return snapshot;
}

function projectMatch(
  document: RedisPokeLoungeDocument,
  match: CompetitiveMatchAssignment,
): CompetitiveActionProjection {
  return toCompetitiveProjection(
    match,
    findTurnActions(document, match).map(function mapItem(action) {
      return action.actorPlayerId;
    }),
  );
}

function findTurnActions(
  document: RedisPokeLoungeDocument,
  match: CompetitiveMatchAssignment,
): RedisCompetitiveActionReceipt[] {
  return Object.values(document.actions)
    .filter(function filterItem(action) {
      return (
        action.matchId === match.matchId && action.turn === match.currentTurn
      );
    })
    .sort(function compareItems(left, right) {
      return left.actorPlayerId.localeCompare(right.actorPlayerId);
    });
}

function findActiveMatches(
  document: RedisPokeLoungeDocument,
): CompetitiveMatchAssignment[] {
  return Object.values(document.matches)
    .filter(function filterItem(match) {
      return match.status === 'pending' || match.status === 'active';
    })
    .sort(function compareItems(left, right) {
      return left.bracketMatchId.localeCompare(right.bracketMatchId);
    });
}

function findActiveMatchForPlayer(
  document: RedisPokeLoungeDocument,
  playerId: string,
): CompetitiveMatchAssignment | null {
  return (
    findActiveMatches(document).find(function findItem(match) {
      return match.playerAccounts.some(function testItem(player) {
        return player.playerId === playerId;
      });
    }) ?? null
  );
}

function toCompetitivePendingTurn(
  roomCode: string,
  match: CompetitiveMatchAssignment,
): CompetitivePendingTurn {
  return {
    roomCode,
    matchId: match.matchId,
    turn: match.currentTurn,
    deadlineMs: match.turnStartedAtMs + COMPETITIVE_TURN_DEADLINE_MS,
  };
}

function removeParticipantSeats(
  document: RedisPokeLoungeDocument,
  previous: PokeLoungeRoomSnapshot,
  next: PokeLoungeRoomSnapshot,
): void {
  const remaining = new Set(
    next.participants.map(function mapItem(participant) {
      return participant.playerId;
    }),
  );
  const removed = new Set(
    previous.participants
      .map(function mapItem(participant) {
        return participant.playerId;
      })
      .filter(function filterItem(playerId) {
        return !remaining.has(playerId);
      }),
  );
  if (removed.size > 0) {
    document.seats = document.seats.filter(function filterItem(seat) {
      return !removed.has(seat.playerId);
    });
  }
}

function deleteMatch(document: RedisPokeLoungeDocument, matchId: string): void {
  delete document.matches[matchId];
  for (const [key, action] of Object.entries(document.actions)) {
    if (action.matchId === matchId) {
      delete document.actions[key];
    }
  }
}

function createActionReceipt(input: {
  match: CompetitiveMatchAssignment;
  actor: CompetitivePlayerAccount;
  input: SubmitCompetitiveActionInput;
  requestHash: string;
  response: CompetitiveActionProjection;
  status: CompetitiveActionReceiptStatus;
  createdAtMs: number;
  resolvedAtMs: number | null;
}): RedisCompetitiveActionReceipt {
  return {
    matchId: input.match.matchId,
    turn: input.input.turn,
    actorPlayerId: input.actor.playerId,
    actorAccountId: input.actor.accountId,
    clientCommandId: input.input.clientCommandId,
    action: structuredClone(input.input.action),
    requestHash: input.requestHash,
    status: input.status,
    response: structuredClone(input.response),
    createdAtMs: input.createdAtMs,
    resolvedAtMs: input.resolvedAtMs,
  };
}

function resolveTurnReceipts(
  receipts: readonly RedisCompetitiveActionReceipt[],
  response: CompetitiveActionProjection,
  resolvedAtMs: number,
): void {
  for (const receipt of receipts) {
    receipt.status = 'resolved';
    receipt.response = structuredClone(response);
    receipt.resolvedAtMs = resolvedAtMs;
  }
}

function createTerminalResult(
  winnerPlayerId: string,
  loserPlayerId: string,
  reason: 'forfeit',
): CanonicalTerminalResult {
  return Object.assign(Object.create(null), {
    winnerPlayerId,
    loserPlayerId,
    reason,
    scoreByPlayerId: createCanonicalIdRecord([
      [winnerPlayerId, 100],
      [loserPlayerId, 50],
    ]),
  }) as CanonicalTerminalResult;
}

function createTerminalHpScores(
  state: CompetitiveMatchAssignment['currentState'],
): Record<string, number> {
  return Object.fromEntries(
    state.participantIds.map(function mapItem(playerId) {
      const team = state.playersById[playerId]?.team;
      if (!team?.length) {
        throw new Error(`Competitive team is missing for ${playerId}`);
      }
      return [playerId, scoreRemainingHpPercentage(team)];
    }),
  );
}

function toCompetitiveParties(
  state: Pick<PokeLoungeRoomState, 'partySnapshots'>,
  players: [CompetitivePlayerAccount, CompetitivePlayerAccount],
): Record<string, NormalizedCompetitiveParty> {
  const parties: Record<string, NormalizedCompetitiveParty> = {};
  for (const player of players) {
    const snapshot = state.partySnapshots[player.playerId];
    if (!snapshot?.competitiveParty.members.length) {
      throw new Error(`Competitive party is not ready for ${player.playerId}`);
    }
    parties[player.playerId] = structuredClone(snapshot.competitiveParty);
  }
  return parties;
}

function toCompetitivePlayers(
  state: Pick<PokeLoungeRoomState, 'participants'>,
  seats: readonly CompetitiveSeatRecord[],
  playerIds: readonly [string, string],
  roomCode: string,
): [CompetitivePlayerAccount, CompetitivePlayerAccount] | null {
  const players = playerIds.map(function mapItem(playerId) {
    const seat = seats.find(function findItem(candidate) {
      return candidate.playerId === playerId;
    });
    const sessionId = state.participants.find(function findItem(participant) {
      return participant.playerId === playerId;
    })?.sessionId;
    const accountId =
      seat?.accountId ??
      (sessionId
        ? createSessionCompetitiveAccountId(roomCode, sessionId)
        : null);
    return accountId ? { playerId, accountId } : null;
  });
  return players[0] && players[1] ? [players[0], players[1]] : null;
}

function normalizeAndAdvanceSnapshot(
  current: PokeLoungeRoomSnapshot,
  nowMs: number,
): PokeLoungeRoomSnapshot | null {
  const presenceExpired = expirePendingPokeLoungePresence(current, nowMs);
  const presenceInput = presenceExpired
    ? { ...presenceExpired, revision: current.revision }
    : current;
  const normalized = normalizeLegacyPokeLoungeRoomSnapshot(
    presenceInput,
    nowMs,
  );
  const clockInput = normalized
    ? { ...normalized, revision: current.revision }
    : presenceInput;
  return (
    advancePokeLoungeRoomClock(clockInput, nowMs) ??
    normalized ??
    presenceExpired
  );
}

function prepareCreatedSnapshot(
  room: PokeLoungeRoomSnapshot,
): PokeLoungeRoomSnapshot {
  const snapshot = structuredClone(room);
  snapshot.roomCode = normalizeRoomCode(snapshot.roomCode);
  snapshot.revision = 0;
  snapshot.expiresAtMs = getPokeLoungeRoomExpiresAtMs(snapshot);
  return snapshot;
}

function prepareMutatedSnapshot(
  current: PokeLoungeRoomSnapshot,
  applied: PokeLoungeRoomSnapshot,
): PokeLoungeRoomSnapshot {
  const snapshot = structuredClone(applied);
  snapshot.roomCode = current.roomCode;
  snapshot.revision = current.revision + 1;
  snapshot.expiresAtMs = getPokeLoungeRoomExpiresAtMs(snapshot);
  return snapshot;
}

function toStoredRoom(
  snapshot: PokeLoungeRoomSnapshot,
): PokeLoungeRoomSnapshot {
  const stored = structuredClone(snapshot);
  delete stored.competitive;
  delete stored.competitiveAssignments;
  delete stored.competitiveTransitions;
  return stored;
}

function touchRoom(room: PokeLoungeRoomSnapshot, nowMs: number): void {
  room.revision += 1;
  room.updatedAtMs = nowMs;
  room.expiresAtMs = getPokeLoungeRoomExpiresAtMs(room);
}

function renewRoomLease(room: PokeLoungeRoomSnapshot, nowMs: number): void {
  room.expiresAtMs = getPokeLoungeRoomExpiresAtMs({
    ...room,
    updatedAtMs: nowMs,
  });
}

function selectOfflineMatchLoser(
  snapshot: PokeLoungeRoomSnapshot,
  participantIds: readonly [string, string],
): string | null {
  const participants = participantIds.map(function mapItem(playerId) {
    return snapshot.participants.find(function findItem(participant) {
      return participant.playerId === playerId;
    });
  });
  const offline = participants.filter(function filterItem(participant) {
    return (
      participant !== undefined &&
      (!participant.connected ||
        participant.presencePendingUntilMs !== undefined)
    );
  });
  if (offline.length === 0) {
    return null;
  }
  if (offline.length === 1) {
    return offline[0]?.playerId ?? participantIds[0];
  }
  const [left, right] = participants;
  const leftAt = left?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  const rightAt = right?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  if (leftAt !== rightAt) {
    return leftAt < rightAt ? participantIds[0] : participantIds[1];
  }
  return [...participantIds].sort(function compareItems(a, b) {
    return b.localeCompare(a);
  })[0];
}

function hasSameCompetitivePlayers(
  left: ReadonlyArray<CompetitivePlayerAccount>,
  right: ReadonlyArray<CompetitivePlayerAccount>,
): boolean {
  return (
    left.length === right.length &&
    left.every(function testItem(player) {
      return right.some(function testItem(candidate) {
        return (
          candidate.playerId === player.playerId &&
          candidate.accountId === player.accountId
        );
      });
    })
  );
}

function hashCompetitiveActionRequest(
  input: Pick<
    SubmitCompetitiveActionInput,
    'matchId' | 'assignmentRevision' | 'turn' | 'clientCommandId' | 'action'
  >,
): string {
  return createHash('sha256')
    .update(
      canonicalize({
        matchId: input.matchId,
        assignmentRevision: input.assignmentRevision,
        turn: input.turn,
        clientCommandId: input.clientCommandId,
        action: input.action,
      }),
      'utf8',
    )
    .digest('hex');
}

function isSupportedCompetitiveRuleset(match: {
  rulesetVersion: number;
  rulesetHash: string;
}): boolean {
  return (
    match.rulesetVersion === COMPETITIVE_RULESET_VERSION &&
    match.rulesetHash === COMPETITIVE_RULESET_HASH
  );
}

function toTerminalTransition(
  projection: CompetitiveActionProjection,
): CompetitiveTerminalTransition {
  if (
    projection.status !== 'completed' ||
    projection.terminalEventId === null ||
    projection.terminalRoomRevision === null
  ) {
    throw new Error('Finalized competitive projection metadata is missing');
  }
  return {
    terminalEventId: projection.terminalEventId,
    terminalRoomRevision: projection.terminalRoomRevision,
    projection: structuredClone(projection),
  };
}

function roomCommandKey(actorPlayerId: string, idempotencyKey: string): string {
  return `${actorPlayerId}:${idempotencyKey}`;
}

function competitiveActionKey(
  matchId: string,
  actorPlayerId: string,
  clientCommandId: string,
): string {
  return `${matchId}:${actorPlayerId}:${clientCommandId}`;
}

function createRepositoryResult(
  snapshot: PokeLoungeRoomSnapshot,
  outcome: PokeLoungeRepositoryResult['outcome'],
  committedChange: boolean,
): PokeLoungeRepositoryResult {
  return { snapshot: structuredClone(snapshot), outcome, committedChange };
}

function parseCreateCommandReceipt(value: string): CreateCommandReceipt {
  const parsed = JSON.parse(value) as unknown;
  if (
    !isRecord(parsed) ||
    typeof parsed.requestHash !== 'string' ||
    typeof parsed.roomCode !== 'string'
  ) {
    throw new Error('Poke Lounge Redis create receipt is malformed');
  }
  return {
    requestHash: parsed.requestHash,
    roomCode: normalizeRoomCode(parsed.roomCode),
  };
}

function parseDocument(value: string): RedisPokeLoungeDocument {
  const parsed = JSON.parse(value) as unknown;
  if (
    !isRecord(parsed) ||
    parsed.version !== REDIS_DOCUMENT_VERSION ||
    typeof parsed.id !== 'string' ||
    !isRecord(parsed.room) ||
    !isRecord(parsed.commands) ||
    !Array.isArray(parsed.seats) ||
    !isRecord(parsed.matches) ||
    !isRecord(parsed.actions)
  ) {
    throw new Error('Poke Lounge Redis document is malformed');
  }
  const document = parsed as unknown as RedisPokeLoungeDocument;
  for (const match of Object.values(document.matches)) {
    match.completedAt = match.completedAt
      ? new Date(String(match.completedAt))
      : null;
    if (
      !Number.isSafeInteger(match.turnStartedAtMs) ||
      match.turnStartedAtMs < 0
    ) {
      const firstTurnActionAtMs = Object.values(document.actions)
        .filter(function filterItem(action) {
          return (
            action.matchId === match.matchId &&
            action.turn === match.currentTurn
          );
        })
        .reduce<number | null>(function reduceItems(earliest, action) {
          return earliest === null
            ? action.createdAtMs
            : Math.min(earliest, action.createdAtMs);
        }, null);
      match.turnStartedAtMs = firstTurnActionAtMs ?? document.room.updatedAtMs;
    }
  }
  return document;
}

function serializeDocument(document: RedisPokeLoungeDocument): string {
  return JSON.stringify(document);
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

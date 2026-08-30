import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  createCanonicalIdRecord,
  hashCanonicalState,
  type CanonicalTerminalResult,
} from '@poke-lounge/battle';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  type DeleteResult,
} from 'typeorm';
import { PokeLoungeRoomCommand } from './entities/poke-lounge-room-command.entity';
import { PokeLoungeCompetitiveMatch } from './entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from './entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeRoom } from './entities/poke-lounge-room.entity';
import { VerifiedPokeLoungeHistoryWriter } from '../game/verified-poke-lounge-history-writer.service';
import { PokeLoungeCompetitiveAction } from './competitive/competitive-action.entity';
import { createCompetitiveAssignment } from './competitive/competitive-match.service';
import {
  toCompetitiveParties,
  toCompetitivePlayers,
} from './competitive/postgres-competitive-match.repository';
import {
  createTerminalHpScores,
  finalizeCompetitiveTerminalMatch,
  resolveTurnReceipts,
} from './competitive/postgres-competitive-action.repository';
import type { CompetitiveActionProjection } from './competitive/competitive-action.types';
import { toCompetitiveProjection } from './competitive/competitive-projection.service';
import {
  advancePokeLoungeRoomClock,
  completePokeLoungeTournamentMatch,
  convergeOfflinePokeLoungeTournamentMatches,
  expirePendingPokeLoungePresence,
  getPokeLoungeRoomExpiresAtMs,
  normalizeLegacyPokeLoungeRoomSnapshot,
  POKE_LOUNGE_CREATION_ADVISORY_LOCK,
  POKE_LOUNGE_ROOM_CAPACITY,
} from './poke-lounge-room-policy';
import type {
  PokeLoungeCreateResult,
  PokeLoungeRepositoryResult,
  PokeLoungeRoomRepository,
  PokeLoungeRoomSnapshot,
} from './poke-lounge-room.repository';
import type { PokeLoungeRoomState } from './poke-lounge-room.types';

const ROOM_CODE_CONSTRAINT = 'UQ_poke_lounge_room_room_code';
const COMMAND_RECEIPT_CONSTRAINTS = [
  'UQ_poke_lounge_room_command_actor_key',
  'UQ_poke_lounge_room_command_room_actor_key',
] as const;
type CreateRoomInput = Parameters<PokeLoungeRoomRepository['create']>[0];
type MutateRoomInput = Parameters<PokeLoungeRoomRepository['mutate']>[0];

@Injectable()
export class PostgresPokeLoungeRoomRepository implements PokeLoungeRoomRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional()
    private readonly historyWriter: VerifiedPokeLoungeHistoryWriter = new VerifiedPokeLoungeHistoryWriter(),
  ) {}

  async create(input: CreateRoomInput): Promise<PokeLoungeCreateResult> {
    for (;;) {
      try {
        return await this.createInTransaction(input);
      } catch (error) {
        if (isUniqueConstraintViolation(error, ROOM_CODE_CONSTRAINT)) {
          return { outcome: 'room-code-collision' };
        }

        if (isCommandReceiptUniqueViolation(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  async getAndAdvance(
    roomCode: string,
    nowMs: number,
  ): Promise<{
    snapshot: PokeLoungeRoomSnapshot | null;
    committedChange: boolean;
  }> {
    return this.dataSource.transaction(async (manager) => {
      await purgeExpiredWithManager(manager, nowMs);
      const room = await this.lockRoomByCode(manager, roomCode);

      if (!room) {
        return { snapshot: null, committedChange: false };
      }

      const currentSnapshot = snapshotFromEntity(room);
      const advancedSnapshot = normalizeAndAdvanceSnapshot(
        currentSnapshot,
        nowMs,
      );

      if (!advancedSnapshot) {
        return { snapshot: currentSnapshot, committedChange: false };
      }

      await deleteRemovedParticipantSeats(
        manager,
        room.id,
        currentSnapshot,
        advancedSnapshot,
      );
      await ensureActiveTournamentAssignment(
        manager,
        room,
        advancedSnapshot,
        this.historyWriter,
      );
      await attachActiveCompetitiveProjection(manager, room, advancedSnapshot);
      await saveSnapshot(manager, room, advancedSnapshot);

      return { snapshot: advancedSnapshot, committedChange: true };
    });
  }

  async mutate(
    input: MutateRoomInput,
  ): Promise<PokeLoungeRepositoryResult | null> {
    for (;;) {
      try {
        return await this.mutateInTransaction(input);
      } catch (error) {
        if (isCommandReceiptUniqueViolation(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  async purgeExpired(nowMs: number): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      return purgeExpiredWithManager(manager, nowMs);
    });
  }

  private createInTransaction(
    input: CreateRoomInput,
  ): Promise<PokeLoungeCreateResult> {
    return this.dataSource.transaction(async (manager) => {
      await lockCommandReceiptKey(
        manager,
        input.actorPlayerId,
        input.idempotencyKey,
      );
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        POKE_LOUNGE_CREATION_ADVISORY_LOCK,
      ]);

      const commandRepository = manager.getRepository(PokeLoungeRoomCommand);
      const existingCommand = await commandRepository.findOne({
        where: {
          actorPlayerId: input.actorPlayerId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existingCommand) {
        if (existingCommand.requestHash === input.requestHash) {
          return createResult(
            receiptSnapshot(existingCommand),
            'replayed',
            false,
          );
        }

        const currentRoom = await this.lockRoomById(
          manager,
          existingCommand.roomId,
        );
        const snapshot = currentRoom
          ? snapshotFromEntity(currentRoom)
          : receiptSnapshot(existingCommand);

        return createResult(snapshot, 'idempotency-conflict', false);
      }

      await purgeExpiredWithManager(manager, input.nowMs);

      const roomRepository = manager.getRepository(PokeLoungeRoom);
      const roomCount = await roomRepository.count();

      if (roomCount >= POKE_LOUNGE_ROOM_CAPACITY) {
        return { outcome: 'capacity-reached' };
      }

      const snapshot = prepareCreatedSnapshot(input.room);
      const room = await roomRepository.save(
        roomRepository.create({
          roomCode: snapshot.roomCode,
          state: storedStateFromSnapshot(snapshot),
          revision: snapshot.revision,
          expiresAt: new Date(snapshot.expiresAtMs),
        }),
      );

      await commandRepository.save(
        commandRepository.create({
          roomId: room.id,
          actorPlayerId: input.actorPlayerId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          responseState: structuredClone(snapshot),
          responseRevision: snapshot.revision,
        }),
      );

      return createResult(snapshot, 'committed', true);
    });
  }

  private mutateInTransaction(
    input: MutateRoomInput,
  ): Promise<PokeLoungeRepositoryResult | null> {
    return this.dataSource.transaction(async (manager) => {
      await lockCommandReceiptKey(
        manager,
        input.actorPlayerId,
        input.idempotencyKey,
      );
      await purgeExpiredWithManager(manager, input.nowMs);
      const room = await this.lockRoomByCode(manager, input.roomCode);

      if (!room) {
        return null;
      }

      const commandRepository = manager.getRepository(PokeLoungeRoomCommand);
      const existingCommand = await commandRepository.findOne({
        where: {
          actorPlayerId: input.actorPlayerId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const replaysRoundReady =
        input.operation === 'round-ready' &&
        existingCommand?.requestHash === input.requestHash;

      if (
        existingCommand?.requestHash === input.requestHash &&
        !replaysRoundReady
      ) {
        return createResult(
          receiptSnapshot(existingCommand),
          'replayed',
          false,
        );
      }

      const currentSnapshot = snapshotFromEntity(room);
      const advancedSnapshot = normalizeAndAdvanceSnapshot(
        currentSnapshot,
        input.nowMs,
      );

      if (advancedSnapshot) {
        await deleteRemovedParticipantSeats(
          manager,
          room.id,
          currentSnapshot,
          advancedSnapshot,
        );
        await ensureActiveTournamentAssignment(
          manager,
          room,
          advancedSnapshot,
          this.historyWriter,
        );
        await attachActiveCompetitiveProjection(
          manager,
          room,
          advancedSnapshot,
        );
        await saveSnapshot(manager, room, advancedSnapshot);

        return createResult(
          advancedSnapshot,
          replaysRoundReady
            ? 'replayed'
            : existingCommand
              ? 'idempotency-conflict'
              : 'revision-conflict',
          true,
        );
      }

      await attachActiveCompetitiveProjection(manager, room, currentSnapshot);

      if (replaysRoundReady) {
        return createResult(currentSnapshot, 'replayed', false);
      }

      if (existingCommand) {
        return createResult(currentSnapshot, 'idempotency-conflict', false);
      }

      if (
        input.expectedRevision !== undefined &&
        currentSnapshot.revision !== input.expectedRevision
      ) {
        return createResult(currentSnapshot, 'revision-conflict', false);
      }

      const appliedSnapshot = input.apply(structuredClone(currentSnapshot));
      const nextSnapshot = prepareMutatedSnapshot(
        currentSnapshot,
        appliedSnapshot,
      );
      await deleteRemovedParticipantSeats(
        manager,
        room.id,
        currentSnapshot,
        nextSnapshot,
      );

      if (input.operation === 'leave') {
        await completeServerAuthorityParticipantLeave(
          manager,
          room,
          currentSnapshot,
          nextSnapshot,
          input.actorPlayerId,
          input.nowMs,
          this.historyWriter,
        );
      }
      await ensureActiveTournamentAssignment(
        manager,
        room,
        nextSnapshot,
        this.historyWriter,
      );
      await attachActiveCompetitiveProjection(manager, room, nextSnapshot);
      await saveSnapshot(manager, room, nextSnapshot);
      await commandRepository.save(
        commandRepository.create({
          roomId: room.id,
          actorPlayerId: input.actorPlayerId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          responseState: structuredClone(nextSnapshot),
          responseRevision: nextSnapshot.revision,
        }),
      );

      return createResult(nextSnapshot, 'committed', true);
    });
  }

  private lockRoomByCode(
    manager: EntityManager,
    roomCode: string,
  ): Promise<PokeLoungeRoom | null> {
    return manager
      .getRepository(PokeLoungeRoom)
      .createQueryBuilder('room')
      .setLock('pessimistic_write')
      .where('room.roomCode = :roomCode', {
        roomCode: normalizeRoomCode(roomCode),
      })
      .getOne();
  }

  private lockRoomById(
    manager: EntityManager,
    roomId: string,
  ): Promise<PokeLoungeRoom | null> {
    return manager
      .getRepository(PokeLoungeRoom)
      .createQueryBuilder('room')
      .setLock('pessimistic_write')
      .where('room.id = :roomId', { roomId })
      .getOne();
  }
}

export async function ensureActiveTournamentAssignment(
  manager: EntityManager,
  room: PokeLoungeRoom,
  snapshot: PokeLoungeRoomSnapshot,
  historyWriter: VerifiedPokeLoungeHistoryWriter = new VerifiedPokeLoungeHistoryWriter(),
): Promise<void> {
  const bracketMatchId = snapshot.tournament.activeMatchId;
  const bracketMatch = snapshot.tournament.bracket?.currentRound?.matches.find(
    (match) => match.matchId === bracketMatchId,
  );
  if (!bracketMatchId || !bracketMatch) {
    return;
  }

  const matchRepository = manager.getRepository(PokeLoungeCompetitiveMatch);
  const active = await matchRepository.findOne({
    where: [
      { roomId: room.id, status: 'pending' },
      { roomId: room.id, status: 'active' },
    ],
    select: {
      matchId: true,
      bracketMatchId: true,
      kind: true,
      playerAccounts: true,
      status: true,
      terminalResult: true,
      currentState: true,
      completedAt: true,
    },
  });
  if (active && active.bracketMatchId !== bracketMatchId) {
    await matchRepository.delete({ matchId: active.matchId });
  }
  const seats = await manager
    .getRepository(PokeLoungeCompetitiveSeat)
    .find({ where: { roomId: room.id } });
  const players = toCompetitivePlayers(
    snapshot,
    seats,
    bracketMatch.participantIds,
    room.roomCode,
  );
  if (!players) {
    snapshot.tournament.activeMatchAuthority = 'casual';
    return;
  }

  const assignmentPlayers = players;
  const assignmentKind = 'tournament-unranked' as const;
  const existing =
    active?.bracketMatchId === bracketMatchId
      ? active
      : await matchRepository.findOne({
          where: { roomId: room.id, bracketMatchId },
          select: {
            matchId: true,
            bracketMatchId: true,
            kind: true,
            playerAccounts: true,
            status: true,
            terminalResult: true,
            currentState: true,
            completedAt: true,
          },
        });
  if (existing) {
    const assignmentMatchesBracket =
      existing.kind === assignmentKind &&
      hasSameCompetitivePlayers(existing.playerAccounts, assignmentPlayers);
    if (!assignmentMatchesBracket) {
      if (existing.status === 'completed') {
        throw new Error(
          'Completed competitive match does not match the activated bracket',
        );
      }
      await matchRepository.delete({ matchId: existing.matchId });
    } else {
      snapshot.tournament.activeMatchAuthority = 'server';
      if (existing.status === 'completed' && existing.terminalResult) {
        completePokeLoungeTournamentMatch(
          snapshot,
          bracketMatchId,
          existing.terminalResult.winnerPlayerId,
          existing.terminalResult.reason,
          existing.completedAt?.getTime() ?? nowFromSnapshot(snapshot),
          createTerminalHpScores(existing.currentState),
        );
        await ensureActiveTournamentAssignment(
          manager,
          room,
          snapshot,
          historyWriter,
        );
        return;
      }
      const offlinePlayerId = selectOfflineMatchLoser(
        snapshot,
        bracketMatch.participantIds,
      );
      if (offlinePlayerId) {
        await completeServerAuthorityParticipantLeave(
          manager,
          room,
          snapshot,
          snapshot,
          offlinePlayerId,
          nowFromSnapshot(snapshot),
          historyWriter,
        );
      }
      return;
    }
  }

  if (
    convergeOfflinePokeLoungeTournamentMatches(
      snapshot,
      nowFromSnapshot(snapshot),
    ).length > 0
  ) {
    await ensureActiveTournamentAssignment(
      manager,
      room,
      snapshot,
      historyWriter,
    );
    return;
  }

  const assignment = createCompetitiveAssignment({
    roomId: room.id,
    roomCode: room.roomCode,
    bracketMatchId,
    kind: assignmentKind,
    assignmentRevision: 1,
    players: [...assignmentPlayers],
    parties: toCompetitiveParties(snapshot, [
      assignmentPlayers[0],
      assignmentPlayers[1],
    ]),
  });
  await matchRepository.save(matchRepository.create(assignment));
  snapshot.tournament.activeMatchAuthority = 'server';
}

export async function completeServerAuthorityParticipantLeave(
  manager: EntityManager,
  room: PokeLoungeRoom,
  currentSnapshot: PokeLoungeRoomSnapshot,
  nextSnapshot: PokeLoungeRoomSnapshot,
  playerId: string,
  nowMs: number,
  historyWriter: VerifiedPokeLoungeHistoryWriter = new VerifiedPokeLoungeHistoryWriter(),
): Promise<void> {
  const activeBracketMatchId = currentSnapshot.tournament.activeMatchId;
  if (
    currentSnapshot.status !== 'tournament' ||
    currentSnapshot.tournament.activeMatchAuthority !== 'server' ||
    !activeBracketMatchId
  ) {
    return;
  }

  const bracketMatch =
    currentSnapshot.tournament.bracket?.currentRound?.matches.find(
      (candidate) => candidate.matchId === activeBracketMatchId,
    );
  if (
    bracketMatch?.status !== 'ready' ||
    !bracketMatch.participantIds.includes(playerId)
  ) {
    return;
  }

  const winnerPlayerId = bracketMatch.participantIds.find(
    (candidate) => candidate !== playerId,
  );
  if (!winnerPlayerId) {
    return;
  }

  const match = await manager
    .getRepository(PokeLoungeCompetitiveMatch)
    .createQueryBuilder('match')
    .setLock('pessimistic_write')
    .addSelect([
      'match.currentState',
      'match.terminalResult',
      'match.historyPublication',
    ])
    .where('match.roomId = :roomId', { roomId: room.id })
    .andWhere('match.bracketMatchId = :bracketMatchId', {
      bracketMatchId: activeBracketMatchId,
    })
    .andWhere('match.status IN (:...statuses)', {
      statuses: ['pending', 'active'],
    })
    .getOne();
  if (!match) {
    throw new Error('Active server-authority match is missing');
  }

  const terminal = Object.assign(Object.create(null), {
    winnerPlayerId,
    loserPlayerId: playerId,
    reason: 'forfeit',
    scoreByPlayerId: createCanonicalIdRecord([
      [winnerPlayerId, 100],
      [playerId, 50],
    ]),
  }) as CanonicalTerminalResult;
  match.currentState.terminal = terminal;
  match.currentStateHash = hashCanonicalState(match.currentState);
  match.terminalResult = terminal;
  match.status = 'completed';
  match.completedAt = new Date(nowMs);
  const finalized = await finalizeCompetitiveTerminalMatch(
    manager,
    room,
    match,
    nextSnapshot.revision,
    historyWriter,
    nextSnapshot,
  );
  nextSnapshot.competitiveTransitions = [
    terminalTransitionFromFinalizedProjection(finalized.projection),
  ];
  if (finalized.nextCompetitive) {
    nextSnapshot.competitive = finalized.nextCompetitive;
  }

  const actionRepository = manager.getRepository(PokeLoungeCompetitiveAction);
  const pendingReceipts = await actionRepository
    .createQueryBuilder('action')
    .addSelect(['action.response'])
    .where('action.matchId = :matchId', { matchId: match.matchId })
    .andWhere('action.status = :status', { status: 'pending' })
    .orderBy('action.actorPlayerId', 'ASC')
    .getMany();
  if (pendingReceipts.length > 1) {
    throw new Error('Competitive leave found multiple pending action receipts');
  }
  if (pendingReceipts.length === 1) {
    resolveTurnReceipts(
      pendingReceipts,
      finalized.projection,
      match.completedAt,
    );
    await actionRepository.save(pendingReceipts);
  }
}

async function attachActiveCompetitiveProjection(
  manager: EntityManager,
  room: PokeLoungeRoom,
  snapshot: PokeLoungeRoomSnapshot,
): Promise<void> {
  delete snapshot.competitive;
  const bracketMatchId = snapshot.tournament.activeMatchId;
  if (
    !bracketMatchId ||
    snapshot.tournament.activeMatchAuthority !== 'server'
  ) {
    return;
  }

  const match = await manager
    .getRepository(PokeLoungeCompetitiveMatch)
    .createQueryBuilder('match')
    .addSelect(['match.currentState', 'match.terminalResult'])
    .where('match.roomId = :roomId', { roomId: room.id })
    .andWhere('match.bracketMatchId = :bracketMatchId', { bracketMatchId })
    .andWhere('match.status IN (:...statuses)', {
      statuses: ['pending', 'active'],
    })
    .getOne();
  if (!match) {
    return;
  }

  const receipts = await manager
    .getRepository(PokeLoungeCompetitiveAction)
    .find({
      select: { actorPlayerId: true },
      where: { matchId: match.matchId, turn: match.currentTurn },
      order: { actorPlayerId: 'ASC' },
    });
  snapshot.competitive = toCompetitiveProjection(
    match,
    receipts.map((receipt) => receipt.actorPlayerId),
  );
}

async function deleteRemovedParticipantSeats(
  manager: EntityManager,
  roomId: string,
  previous: PokeLoungeRoomSnapshot,
  next: PokeLoungeRoomSnapshot,
): Promise<void> {
  const remainingPlayerIds = new Set(
    next.participants.map((participant) => participant.playerId),
  );
  const removedPlayerIds = previous.participants
    .map((participant) => participant.playerId)
    .filter((playerId) => !remainingPlayerIds.has(playerId));
  if (removedPlayerIds.length === 0) {
    return;
  }

  await manager.getRepository(PokeLoungeCompetitiveSeat).delete({
    roomId,
    playerId: In(removedPlayerIds),
  });
}

export function findCompletedCompetitiveMatchesAfterRevision(
  manager: EntityManager,
  roomId: string,
  afterRevision: number,
  currentRevision: number,
): Promise<PokeLoungeCompetitiveMatch[]> {
  if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) {
    throw new Error('afterRevision must be a non-negative safe integer');
  }

  return manager
    .getRepository(PokeLoungeCompetitiveMatch)
    .createQueryBuilder('transition')
    .addSelect(['transition.currentState', 'transition.terminalResult'])
    .where('transition.roomId = :roomId', { roomId })
    .andWhere('transition.status = :status', { status: 'completed' })
    .andWhere('transition.rulesetVersion = :rulesetVersion', {
      rulesetVersion: COMPETITIVE_RULESET_VERSION,
    })
    .andWhere('transition.rulesetHash = :rulesetHash', {
      rulesetHash: COMPETITIVE_RULESET_HASH,
    })
    .andWhere('transition.terminalRoomRevision > :afterRevision', {
      afterRevision,
    })
    .andWhere('transition.terminalRoomRevision <= :currentRevision', {
      currentRevision,
    })
    .andWhere('transition.terminalEventId IS NOT NULL')
    .orderBy('transition.terminalRoomRevision', 'ASC')
    .addOrderBy('transition.terminalEventId', 'ASC')
    .take(8)
    .getMany();
}

function terminalTransitionFromFinalizedProjection(
  projection: CompetitiveActionProjection,
) {
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

function hasSameCompetitivePlayers(
  left: ReadonlyArray<{ playerId: string; accountId: string }>,
  right: ReadonlyArray<{ playerId: string; accountId: string }>,
): boolean {
  return (
    left.length === right.length &&
    left.every((player) =>
      right.some(
        (candidate) =>
          candidate.playerId === player.playerId &&
          candidate.accountId === player.accountId,
      ),
    )
  );
}

function nowFromSnapshot(snapshot: PokeLoungeRoomSnapshot): number {
  return snapshot.updatedAtMs;
}

function normalizeAndAdvanceSnapshot(
  currentSnapshot: PokeLoungeRoomSnapshot,
  nowMs: number,
): PokeLoungeRoomSnapshot | null {
  const presenceExpired = expirePendingPokeLoungePresence(
    currentSnapshot,
    nowMs,
  );
  const presenceInput = presenceExpired
    ? { ...presenceExpired, revision: currentSnapshot.revision }
    : currentSnapshot;
  const normalized = normalizeLegacyPokeLoungeRoomSnapshot(
    presenceInput,
    nowMs,
  );
  const clockInput = normalized
    ? { ...normalized, revision: currentSnapshot.revision }
    : presenceInput;
  const advanced = advancePokeLoungeRoomClock(clockInput, nowMs);

  return advanced ?? normalized ?? presenceExpired;
}

function selectOfflineMatchLoser(
  snapshot: PokeLoungeRoomSnapshot,
  participantIds: readonly [string, string],
): string | null {
  const participants = participantIds.map((playerId) =>
    snapshot.participants.find(
      (participant) => participant.playerId === playerId,
    ),
  );
  const offline = participants.filter(
    (participant) =>
      participant !== undefined &&
      (!participant.connected ||
        participant.presencePendingUntilMs !== undefined),
  );
  if (offline.length === 0) {
    return null;
  }
  if (offline.length === 1) {
    return offline[0]?.playerId ?? participantIds[0];
  }

  const [participantA, participantB] = participants;
  const leftAtA = participantA?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  const leftAtB = participantB?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  if (leftAtA !== leftAtB) {
    return leftAtA < leftAtB ? participantIds[0] : participantIds[1];
  }
  return [...participantIds].sort((left, right) =>
    right.localeCompare(left),
  )[0];
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

function snapshotFromEntity(room: PokeLoungeRoom): PokeLoungeRoomSnapshot {
  return {
    ...structuredClone(room.state),
    roomCode: room.roomCode,
    revision: room.revision,
    expiresAtMs: room.expiresAt.getTime(),
  };
}

function receiptSnapshot(
  command: PokeLoungeRoomCommand,
): PokeLoungeRoomSnapshot {
  return {
    ...structuredClone(command.responseState),
    revision: command.responseRevision,
  };
}

function storedStateFromSnapshot(
  snapshot: PokeLoungeRoomSnapshot,
): PokeLoungeRoomState {
  const state = structuredClone(snapshot);

  return {
    roomCode: state.roomCode,
    status: state.status,
    closeReason: state.closeReason,
    createdAtMs: state.createdAtMs,
    updatedAtMs: state.updatedAtMs,
    participants: state.participants,
    partySnapshots: state.partySnapshots,
    round: state.round,
    tournament: state.tournament,
    finalStandings: state.finalStandings,
  };
}

async function saveSnapshot(
  manager: EntityManager,
  room: PokeLoungeRoom,
  snapshot: PokeLoungeRoomSnapshot,
): Promise<void> {
  snapshot.expiresAtMs = getPokeLoungeRoomExpiresAtMs(snapshot);
  room.roomCode = snapshot.roomCode;
  room.state = storedStateFromSnapshot(snapshot);
  room.revision = snapshot.revision;
  room.expiresAt = new Date(snapshot.expiresAtMs);
  await manager.getRepository(PokeLoungeRoom).save(room);
}

async function lockCommandReceiptKey(
  manager: EntityManager,
  actorPlayerId: string,
  idempotencyKey: string,
): Promise<void> {
  const digest = createHash('sha256')
    .update(actorPlayerId)
    .update('\0')
    .update(idempotencyKey)
    .digest();

  await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
    digest.readInt32BE(0),
    digest.readInt32BE(4),
  ]);
}

async function purgeExpiredWithManager(
  manager: EntityManager,
  nowMs: number,
): Promise<number> {
  const result: DeleteResult = await manager
    .getRepository(PokeLoungeRoom)
    .createQueryBuilder()
    .delete()
    .where('"expires_at" < :expiresAt', { expiresAt: new Date(nowMs) })
    .execute();

  return result.affected ?? 0;
}

function createResult(
  snapshot: PokeLoungeRoomSnapshot,
  outcome: PokeLoungeRepositoryResult['outcome'],
  committedChange: boolean,
): PokeLoungeRepositoryResult {
  return {
    snapshot: structuredClone(snapshot),
    outcome,
    committedChange,
  };
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function isUniqueConstraintViolation(
  error: unknown,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };

  return driverError.code === '23505' && driverError.constraint === constraint;
}

function isCommandReceiptUniqueViolation(error: unknown): boolean {
  return COMMAND_RECEIPT_CONSTRAINTS.some((constraint) => {
    return isUniqueConstraintViolation(error, constraint);
  });
}

import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  canonicalize,
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  createCanonicalIdRecord,
  createSeededRandom,
  resolveTurn,
  scoreRemainingHpPercentage,
  validateCompetitiveAction,
  type CanonicalCompetitiveAction,
  type CanonicalBattleState,
} from '@poke-lounge/battle';
import { DataSource, type EntityManager } from 'typeorm';
import { VerifiedPokeLoungeHistoryWriter } from '../../game/verified-poke-lounge-history-writer.service';
import { GameType } from '../../game/enums/game-type.enum';
import { PokeLoungeRoom } from '../entities/poke-lounge-room.entity';
import { PokeLoungeCompetitiveMatch } from '../entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from '../entities/poke-lounge-competitive-seat.entity';
import {
  completePokeLoungeTournamentMatch,
  convergeOfflinePokeLoungeTournamentMatches,
  getPokeLoungeRoomExpiresAtMs,
} from '../poke-lounge-room-policy';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { PokeLoungeRoomState } from '../poke-lounge-room.types';
import { PokeLoungeCompetitiveAction } from './competitive-action.entity';
import type {
  CompetitiveActionRepository,
  CompetitiveActionResult,
  CompetitiveTurnTimeoutResult,
} from './competitive-action.repository';
import { COMPETITIVE_TURN_DEADLINE_MS } from './competitive-action.repository';
import type {
  CompetitiveActionProjection,
  SubmitCompetitiveActionInput,
} from './competitive-action.types';
import {
  toCompetitiveProjection,
  toCompetitiveTerminalTransition,
} from './competitive-projection.service';
import { createCompetitiveAssignment } from './competitive-match.service';
import {
  toCompetitiveParties,
  toCompetitivePlayers,
} from './postgres-competitive-match.repository';
import type { CompetitiveMatchKind } from './competitive-match.types';

@Injectable()
export class PostgresCompetitiveActionRepository implements CompetitiveActionRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly historyWriter: VerifiedPokeLoungeHistoryWriter,
  ) {}

  submit(
    input: SubmitCompetitiveActionInput,
  ): Promise<CompetitiveActionResult> {
    return this.dataSource.transaction(async (manager) => {
      const room = await lockRoom(manager, input.roomCode);
      if (!room) {
        return { outcome: 'room-not-found' };
      }

      const match = await lockMatch(manager, room.id, input.matchId);
      if (!match) {
        return { outcome: 'match-not-found' };
      }

      const actor = match.playerAccounts.find(
        (candidate) => candidate.accountId === input.accountId,
      );
      if (!actor) {
        return { outcome: 'actor-not-assigned' };
      }

      const actionRepository = manager.getRepository(
        PokeLoungeCompetitiveAction,
      );
      const requestHash = hashCompetitiveActionRequest(input);
      const existingCommand = await actionRepository
        .createQueryBuilder('action')
        .addSelect(['action.requestHash', 'action.response'])
        .where('action.matchId = :matchId', { matchId: match.matchId })
        .andWhere('action.actorPlayerId = :actorPlayerId', {
          actorPlayerId: actor.playerId,
        })
        .andWhere('action.clientCommandId = :clientCommandId', {
          clientCommandId: input.clientCommandId,
        })
        .getOne();

      if (existingCommand) {
        if (existingCommand.requestHash !== requestHash) {
          return { outcome: 'command-conflict' };
        }

        return {
          outcome: 'replayed',
          response: structuredClone(existingCommand.response),
          room: snapshotFromEntity(room),
          committed: false,
        };
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

      const turnActions = await actionRepository
        .createQueryBuilder('action')
        .addSelect(['action.action'])
        .where('action.matchId = :matchId', { matchId: match.matchId })
        .andWhere('action.turn = :turn', { turn: match.currentTurn })
        .orderBy('action.actorPlayerId', 'ASC')
        .getMany();

      if (
        turnActions.some((receipt) => receipt.actorPlayerId === actor.playerId)
      ) {
        return { outcome: 'actor-turn-conflict' };
      }

      const canonicalAction = canonicalize(input.action);
      const nowMs = Date.now();
      if (
        turnActions.length === 1 &&
        nowMs >= getCompetitiveTurnDeadlineMs(turnActions[0])
      ) {
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
        await manager
          .getRepository(PokeLoungeCompetitiveMatch)
          .save({ ...match }, { reload: false });
        await markRoomUpdated(manager, room);
        const response = toProjection(match, [actor.playerId]);
        await actionRepository.save(
          actionRepository.create({
            matchId: match.matchId,
            roomId: room.id,
            turn: input.turn,
            actorPlayerId: actor.playerId,
            actorAccountId: actor.accountId,
            clientCommandId: input.clientCommandId,
            action: input.action,
            canonicalAction,
            requestHash,
            status: 'pending',
            response,
            resolvedAt: null,
          }),
        );

        return {
          outcome: 'accepted',
          response,
          room: {
            ...snapshotFromEntity(room),
            competitive: response,
          },
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
      const resolved = resolveTurn({
        state: match.currentState,
        actionsByPlayerId,
        random: createSeededRandom(`${match.serverSeed}:${match.currentTurn}`),
      });
      if (resolved.terminal && resolved.terminal.reason !== 'faint') {
        throw new Error(
          'Stage 3 engine produced an unsupported terminal reason',
        );
      }

      match.currentState = resolved.state;
      match.currentStateHash = resolved.stateHash;
      match.currentTurn = resolved.state.turn;
      match.terminalResult = resolved.terminal;
      match.status = resolved.terminal ? 'completed' : 'active';
      match.completedAt = resolved.terminal ? new Date() : null;
      match.updatedAt = new Date(nowMs);
      let nextCompetitive: CompetitiveActionProjection | null = null;
      let response: CompetitiveActionProjection;
      if (resolved.terminal) {
        const finalized = await finalizeCompetitiveTerminalMatch(
          manager,
          room,
          match,
          room.revision + 1,
          this.historyWriter,
        );
        response = finalized.projection;
        nextCompetitive = finalized.nextCompetitive;
      } else {
        await manager
          .getRepository(PokeLoungeCompetitiveMatch)
          .save({ ...match }, { reload: false });
        response = toProjection(match, []);
      }
      await markRoomUpdated(manager, room);

      const resolvedAt = new Date();
      const resolvedReceipt = actionRepository.create({
        matchId: match.matchId,
        roomId: room.id,
        turn: input.turn,
        actorPlayerId: actor.playerId,
        actorAccountId: actor.accountId,
        clientCommandId: input.clientCommandId,
        action: input.action,
        canonicalAction,
        requestHash,
        status: 'resolved',
        response,
        resolvedAt,
      });
      resolveTurnReceipts(
        [turnActions[0], resolvedReceipt],
        response,
        resolvedAt,
      );
      await actionRepository.save([turnActions[0], resolvedReceipt]);

      const roomSnapshot = snapshotFromEntity(room);
      if (resolved.terminal) {
        roomSnapshot.competitiveTransitions = [
          toCompetitiveTerminalTransition(response),
        ];
      } else {
        roomSnapshot.competitive = response;
      }
      if (nextCompetitive !== null) {
        roomSnapshot.competitive = nextCompetitive;
      }

      return {
        outcome: 'accepted',
        response,
        room: roomSnapshot,
        committed: true,
      };
    });
  }

  expirePendingTurn(input: {
    roomCode: string;
    matchId: string;
    turn: number;
    nowMs: number;
  }): Promise<CompetitiveTurnTimeoutResult> {
    return this.dataSource.transaction(async (manager) => {
      const room = await lockRoom(manager, input.roomCode);
      if (!room) {
        return { outcome: 'ignored' };
      }

      const match = await lockMatch(manager, room.id, input.matchId);
      if (
        !match ||
        match.status === 'completed' ||
        match.currentState.terminal ||
        match.currentTurn !== input.turn
      ) {
        return { outcome: 'ignored' };
      }

      const actionRepository = manager.getRepository(
        PokeLoungeCompetitiveAction,
      );
      const pendingReceipt = await actionRepository
        .createQueryBuilder('action')
        .addSelect(['action.action', 'action.response'])
        .where('action.matchId = :matchId', { matchId: match.matchId })
        .andWhere('action.turn = :turn', { turn: match.currentTurn })
        .andWhere('action.status = :status', { status: 'pending' })
        .getOne();
      if (!pendingReceipt) {
        return { outcome: 'ignored' };
      }

      const deadlineMs = getCompetitiveTurnDeadlineMs(pendingReceipt);
      if (input.nowMs < deadlineMs) {
        return { outcome: 'not-due', retryAtMs: deadlineMs };
      }

      const resolved = await completePendingTurnDeadline(
        manager,
        room,
        match,
        pendingReceipt,
        input.nowMs,
        this.historyWriter,
      );

      return { outcome: 'resolved', ...resolved, nextTurn: null };
    });
  }
}

function getCompetitiveTurnDeadlineMs(
  receipt: Pick<PokeLoungeCompetitiveAction, 'createdAt'>,
): number {
  return receipt.createdAt.getTime() + COMPETITIVE_TURN_DEADLINE_MS;
}

async function completePendingTurnDeadline(
  manager: EntityManager,
  room: PokeLoungeRoom,
  match: PokeLoungeCompetitiveMatch,
  pendingReceipt: PokeLoungeCompetitiveAction,
  nowMs: number,
  historyWriter: VerifiedPokeLoungeHistoryWriter,
): Promise<{
  response: CompetitiveActionProjection;
  room: PokeLoungeRoomSnapshot;
}> {
  const resolved = resolveTurn({
    state: match.currentState,
    actionsByPlayerId: createCanonicalIdRecord([
      [pendingReceipt.actorPlayerId, pendingReceipt.action],
    ]),
    random: createSeededRandom(`${match.serverSeed}:${match.currentTurn}`),
  });
  match.currentState = resolved.state;
  match.currentStateHash = resolved.stateHash;
  match.currentTurn = resolved.state.turn;
  match.terminalResult = resolved.terminal;
  match.status = resolved.terminal ? 'completed' : 'active';
  match.completedAt = resolved.terminal ? new Date(nowMs) : null;
  match.updatedAt = new Date(nowMs);

  let response: CompetitiveActionProjection;
  let nextCompetitive: CompetitiveActionProjection | null = null;
  if (resolved.terminal) {
    const finalized = await finalizeCompetitiveTerminalMatch(
      manager,
      room,
      match,
      room.revision + 1,
      historyWriter,
    );
    response = finalized.projection;
    nextCompetitive = finalized.nextCompetitive;
  } else {
    await manager
      .getRepository(PokeLoungeCompetitiveMatch)
      .save({ ...match }, { reload: false });
    response = toProjection(match, []);
  }
  await markRoomUpdated(manager, room);
  resolveTurnReceipts([pendingReceipt], response, new Date(nowMs));
  await manager.getRepository(PokeLoungeCompetitiveAction).save(pendingReceipt);

  const roomSnapshot = snapshotFromEntity(room);
  if (resolved.terminal) {
    roomSnapshot.competitiveTransitions = [
      toCompetitiveTerminalTransition(response),
    ];
  } else {
    roomSnapshot.competitive = response;
  }
  if (nextCompetitive) {
    roomSnapshot.competitive = nextCompetitive;
  }

  return { response, room: roomSnapshot };
}

export async function finalizeCompetitiveTerminalMatch(
  manager: EntityManager,
  room: PokeLoungeRoom,
  match: PokeLoungeCompetitiveMatch,
  terminalRoomRevision: number,
  historyWriter: VerifiedPokeLoungeHistoryWriter,
  state: PokeLoungeRoomState = room.state,
): Promise<{
  projection: CompetitiveActionProjection;
  nextCompetitive: CompetitiveActionProjection | null;
}> {
  const terminal = match.terminalResult;
  if (
    match.status !== 'completed' ||
    !terminal ||
    !match.currentState.terminal ||
    !match.completedAt
  ) {
    throw new Error('Competitive terminal finalization requires a result');
  }
  if (!Number.isSafeInteger(terminalRoomRevision) || terminalRoomRevision < 0) {
    throw new Error('Competitive terminal room revision is invalid');
  }

  const hasEventId = match.terminalEventId !== null;
  const hasRoomRevision = match.terminalRoomRevision !== null;
  if (hasEventId !== hasRoomRevision) {
    throw new Error('Competitive terminal metadata pair is incomplete');
  }
  if (!hasEventId) {
    match.terminalEventId = randomUUID();
    match.terminalRoomRevision = terminalRoomRevision;
  } else if (match.terminalRoomRevision !== terminalRoomRevision) {
    throw new Error('Competitive terminal metadata revision is immutable');
  }

  if (
    shouldPublishVerifiedHistory(match.kind) &&
    match.historyPublication === null
  ) {
    const histories = await historyWriter.write(manager, {
      gameType: GameType.POKE_LOUNGE,
      terminalResult: terminal,
      playerAccounts: match.playerAccounts,
      source: { roomId: room.id, matchId: match.matchId },
    });
    match.historyPublication = {
      historyIdByAccountId: Object.fromEntries(
        histories.map((history) => [history.userId, history.id]),
      ),
    };
  }

  await manager
    .getRepository(PokeLoungeCompetitiveMatch)
    .save({ ...match }, { reload: false });

  const nextCompetitive =
    state.tournament.activeMatchId === match.bracketMatchId
      ? await advanceTournamentAuthorityMatch(manager, room, match, state)
      : null;

  return {
    projection: toProjection(match, []),
    nextCompetitive,
  };
}

export async function advanceTournamentAuthorityMatch(
  manager: EntityManager,
  room: PokeLoungeRoom,
  completedMatch: PokeLoungeCompetitiveMatch,
  state: PokeLoungeRoomState = room.state,
): Promise<CompetitiveActionProjection | null> {
  const terminal = completedMatch.terminalResult;
  if (!terminal) {
    throw new Error('Tournament authority match completed without a result');
  }
  if (state.tournament.activeMatchId !== completedMatch.bracketMatchId) {
    throw new Error(
      'Tournament authority match is not the active bracket match',
    );
  }

  completePokeLoungeTournamentMatch(
    state,
    completedMatch.bracketMatchId,
    terminal.winnerPlayerId,
    terminal.reason,
    completedMatch.completedAt?.getTime() ?? Date.now(),
    createTerminalHpScores(completedMatch.currentState),
  );
  convergeOfflinePokeLoungeTournamentMatches(
    state,
    completedMatch.completedAt?.getTime() ?? Date.now(),
  );

  const bracketMatchId = state.tournament.activeMatchId;
  const nextBracketMatch = state.tournament.bracket?.currentRound?.matches.find(
    (match) => match.matchId === bracketMatchId,
  );
  if (!nextBracketMatch || !bracketMatchId) {
    return null;
  }

  const seats = await manager
    .getRepository(PokeLoungeCompetitiveSeat)
    .find({ where: { roomId: room.id } });
  const players = toCompetitivePlayers(
    state,
    seats,
    nextBracketMatch.participantIds,
    room.roomCode,
  );
  if (!players) {
    return null;
  }

  const matchRepository = manager.getRepository(PokeLoungeCompetitiveMatch);
  const assignment = createCompetitiveAssignment({
    roomId: room.id,
    roomCode: room.roomCode,
    bracketMatchId,
    kind: 'tournament-unranked',
    assignmentRevision: 1,
    players,
    parties: toCompetitiveParties(state, players),
  });
  await matchRepository.save(matchRepository.create(assignment));
  state.tournament.activeMatchAuthority = 'server';
  return toCompetitiveProjection(assignment, []);
}

export function shouldPublishVerifiedHistory(
  kind: CompetitiveMatchKind,
): boolean {
  return kind === 'ranked-head-to-head';
}

export function createTerminalHpScores(
  state: Pick<CanonicalBattleState, 'participantIds' | 'playersById'>,
): Record<string, number> {
  return Object.fromEntries(
    state.participantIds.map((playerId) => {
      const team = state.playersById[playerId]?.team;
      if (!team?.length) {
        throw new Error(`Competitive team is missing for ${playerId}`);
      }

      return [playerId, scoreRemainingHpPercentage(team)];
    }),
  );
}

export function hashCompetitiveActionRequest(
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

export function isSupportedCompetitiveRuleset(input: {
  rulesetVersion: number;
  rulesetHash: string;
}): boolean {
  return (
    input.rulesetVersion === COMPETITIVE_RULESET_VERSION &&
    input.rulesetHash === COMPETITIVE_RULESET_HASH
  );
}

export function resolveTurnReceipts(
  receipts: readonly PokeLoungeCompetitiveAction[],
  response: CompetitiveActionProjection,
  resolvedAt: Date,
): void {
  for (const receipt of receipts) {
    receipt.status = 'resolved';
    receipt.response = structuredClone(response);
    receipt.resolvedAt = resolvedAt;
  }
}

function toProjection(
  match: PokeLoungeCompetitiveMatch,
  submittedPlayerIds: readonly string[],
): CompetitiveActionProjection {
  return toCompetitiveProjection(match, submittedPlayerIds);
}

function lockRoom(
  manager: EntityManager,
  roomCode: string,
): Promise<PokeLoungeRoom | null> {
  return manager
    .getRepository(PokeLoungeRoom)
    .createQueryBuilder('room')
    .setLock('pessimistic_write')
    .where('room.roomCode = :roomCode', {
      roomCode: roomCode.trim().toUpperCase(),
    })
    .andWhere('room.expiresAt >= CURRENT_TIMESTAMP')
    .getOne();
}

function lockMatch(
  manager: EntityManager,
  roomId: string,
  matchId: string,
): Promise<PokeLoungeCompetitiveMatch | null> {
  return manager
    .getRepository(PokeLoungeCompetitiveMatch)
    .createQueryBuilder('match')
    .setLock('pessimistic_write')
    .addSelect([
      'match.serverSeed',
      'match.initialState',
      'match.currentState',
      'match.terminalResult',
      'match.historyPublication',
    ])
    .where('match.roomId = :roomId', { roomId })
    .andWhere('match.matchId = :matchId', { matchId })
    .getOne();
}

function snapshotFromEntity(room: PokeLoungeRoom): PokeLoungeRoomSnapshot {
  return {
    ...structuredClone(room.state),
    roomCode: room.roomCode,
    revision: room.revision,
    expiresAtMs: room.expiresAt.getTime(),
  };
}

async function markRoomUpdated(
  manager: EntityManager,
  room: PokeLoungeRoom,
): Promise<void> {
  const committedAt = new Date();
  room.revision += 1;
  room.state.updatedAtMs = committedAt.getTime();
  room.expiresAt = new Date(getPokeLoungeRoomExpiresAtMs(room.state));
  room.updatedAt = committedAt;
  await manager.getRepository(PokeLoungeRoom).save(room);
}

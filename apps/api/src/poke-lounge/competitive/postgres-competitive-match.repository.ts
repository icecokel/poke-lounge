import { Injectable } from '@nestjs/common';
import type { NormalizedCompetitiveParty } from '@poke-lounge/battle';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import { PokeLoungeCompetitiveMatch } from '../entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from '../entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeRoom } from '../entities/poke-lounge-room.entity';
import type {
  CompetitiveMatchRepository,
  CompetitiveSeatRecord,
  CompetitiveSeatBindingResult,
} from './competitive-match.repository';
import {
  createSessionCompetitiveAccountId,
  isCompetitiveAssignmentMember,
  planCompetitiveSeatBinding,
} from './competitive-match.repository';
import type { CompetitiveMatchAssignment } from './competitive-match.types';
import type { CompetitivePlayerAccount } from './competitive-match.types';
import { toCompetitiveProjection } from './competitive-projection.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { PokeLoungeRoomState } from '../poke-lounge-room.types';
import { getPokeLoungeRoomExpiresAtMs } from '../poke-lounge-room-policy';

@Injectable()
export class PostgresCompetitiveMatchRepository implements CompetitiveMatchRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  bindSeatAndAssign(
    input: Parameters<CompetitiveMatchRepository['bindSeatAndAssign']>[0],
  ): Promise<CompetitiveSeatBindingResult> {
    return this.dataSource.transaction(async (manager) => {
      const room = await lockRoom(manager, input.roomCode);
      if (!room) {
        return { outcome: 'room-not-found' };
      }

      const seatRepository = manager.getRepository(PokeLoungeCompetitiveSeat);
      const seats = await seatRepository.find({ where: { roomId: room.id } });
      const plan = planCompetitiveSeatBinding({
        room: room.state,
        seats,
        sessionId: input.sessionId,
        accountId: input.accountId,
      });
      const matchRepository = manager.getRepository(PokeLoungeCompetitiveMatch);
      const existingMatch = await matchRepository
        .createQueryBuilder('match')
        .addSelect([
          'match.serverSeed',
          'match.initialState',
          'match.currentState',
          'match.terminalResult',
        ])
        .where('match.roomId = :roomId AND match.status IN (:...statuses)', {
          roomId: room.id,
          statuses: ['pending', 'active'],
        })
        .getOne();
      const requestedParticipant = room.state.participants.find(
        (participant) => participant.sessionId === input.sessionId,
      );
      const existingAssignment = existingMatch
        ? assignmentFromEntity(existingMatch)
        : null;
      const activeAssignment =
        room.state.status === 'waiting' || room.state.status === 'round-started'
          ? null
          : existingAssignment;

      if (
        activeAssignment &&
        requestedParticipant?.role === 'participant' &&
        requestedParticipant.connected &&
        !isCompetitiveAssignmentMember(activeAssignment, {
          playerId: requestedParticipant.playerId,
          accountId: input.accountId,
        })
      ) {
        if ('assignmentPlayers' in plan && plan.outcome === 'bind') {
          await saveSeat(seatRepository, room.id, plan.seat);
          await renewRoomLease(manager, room);
        }

        return {
          outcome: 'bound-ineligible',
          assignment: null,
          eligible: false,
        };
      }

      if (!('assignmentPlayers' in plan)) {
        return plan;
      }

      if (activeAssignment) {
        if (plan.outcome === 'bind') {
          await saveSeat(seatRepository, room.id, plan.seat);
          await renewRoomLease(manager, room);
        }

        return {
          outcome: 'already-assigned',
          assignment: activeAssignment,
          eligible: true,
          committed: false,
          room: snapshotFromEntity(room),
          projection: toCompetitiveProjection(existingMatch!, []),
        };
      }

      if (plan.outcome === 'bind') {
        await saveSeat(seatRepository, room.id, plan.seat);
      }

      if (!plan.assignmentPlayers) {
        if (plan.outcome === 'bind') {
          await renewRoomLease(manager, room);
        }
        return {
          outcome: 'bound-casual',
          assignment: null,
          eligible: false,
        };
      }

      const assignment = input.createAssignment({
        roomId: room.id,
        roomCode: room.roomCode,
        assignmentRevision: 1,
        players: plan.assignmentPlayers,
        bracketMatchId: plan.assignmentBracketMatchId!,
        kind: plan.assignmentKind!,
        parties: toCompetitiveParties(room.state, plan.assignmentPlayers),
      });
      await matchRepository.save(matchRepository.create(assignment));
      const committedAt = new Date();
      room.revision += 1;
      room.state.updatedAtMs = committedAt.getTime();
      room.state.tournament.activeMatchAuthority = 'server';
      room.expiresAt = new Date(getPokeLoungeRoomExpiresAtMs(room.state));
      room.updatedAt = committedAt;
      await manager.getRepository(PokeLoungeRoom).save(room);

      return {
        outcome: 'assigned',
        assignment: structuredClone(assignment),
        eligible: true,
        committed: true,
        room: snapshotFromEntity(room),
        projection: toCompetitiveProjection(assignment, []),
      };
    });
  }
}

export function toCompetitiveParties(
  state: Pick<PokeLoungeRoomState, 'partySnapshots'>,
  players: [
    { playerId: string; accountId: string },
    { playerId: string; accountId: string },
  ],
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

export function toCompetitivePlayers(
  state: Pick<PokeLoungeRoomState, 'participants'>,
  seats: Pick<PokeLoungeCompetitiveSeat, 'playerId' | 'accountId'>[],
  playerIds: readonly [string, string],
  roomCode: string,
): [CompetitivePlayerAccount, CompetitivePlayerAccount] | null {
  const players = playerIds.map((playerId) => {
    const seat = seats.find((candidate) => candidate.playerId === playerId);
    const sessionId = state.participants.find(
      (participant) => participant.playerId === playerId,
    )?.sessionId;
    const accountId =
      seat?.accountId ??
      (sessionId
        ? createSessionCompetitiveAccountId(roomCode, sessionId)
        : null);

    return accountId ? { playerId, accountId } : null;
  });

  return players[0] && players[1] ? [players[0], players[1]] : null;
}

async function saveSeat(
  repository: Repository<PokeLoungeCompetitiveSeat>,
  roomId: string,
  seat: CompetitiveSeatRecord,
): Promise<void> {
  await repository.save(repository.create({ roomId, ...seat }));
}

async function renewRoomLease(
  manager: EntityManager,
  room: PokeLoungeRoom,
): Promise<void> {
  const renewedAt = new Date();
  room.expiresAt = new Date(
    getPokeLoungeRoomExpiresAtMs({
      ...room.state,
      updatedAtMs: renewedAt.getTime(),
    }),
  );
  room.updatedAt = renewedAt;
  await manager.getRepository(PokeLoungeRoom).save(room);
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
      roomCode: normalizeRoomCode(roomCode),
    })
    .andWhere('room.expiresAt >= CURRENT_TIMESTAMP')
    .getOne();
}

function assignmentFromEntity(
  match: PokeLoungeCompetitiveMatch,
): CompetitiveMatchAssignment {
  return {
    roomId: match.roomId,
    roomCode: match.roomCode,
    matchId: match.matchId,
    bracketMatchId: match.bracketMatchId,
    kind: match.kind,
    assignmentRevision: match.assignmentRevision,
    playerAccounts: structuredClone(match.playerAccounts),
    rulesetVersion: match.rulesetVersion,
    rulesetHash: match.rulesetHash,
    serverSeed: match.serverSeed,
    initialState: structuredClone(match.initialState),
    initialStateHash: match.initialStateHash,
    currentState: structuredClone(match.currentState),
    currentStateHash: match.currentStateHash,
    currentTurn: match.currentTurn,
    turnStartedAtMs:
      match.updatedAt?.getTime() ?? match.createdAt?.getTime() ?? Date.now(),
    status: match.status,
    terminalEventId: match.terminalEventId ?? null,
    terminalRoomRevision: match.terminalRoomRevision ?? null,
    terminalResult: structuredClone(match.terminalResult),
    completedAt: match.completedAt,
  };
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function snapshotFromEntity(room: PokeLoungeRoom): PokeLoungeRoomSnapshot {
  return {
    ...structuredClone(room.state),
    roomCode: room.roomCode,
    revision: room.revision,
    expiresAtMs: room.expiresAt.getTime(),
  };
}

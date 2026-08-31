import { createHash } from 'node:crypto';
import type { PokeLoungeRoomState } from '../poke-lounge-room.types';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { CompetitiveActionProjection } from './competitive-action.types';
import type {
  CompetitiveAssignmentCreateContext,
  CompetitiveMatchAssignment,
  CompetitivePlayerAccount,
} from './competitive-match.types';

export const COMPETITIVE_MATCH_REPOSITORY = Symbol(
  'COMPETITIVE_MATCH_REPOSITORY',
);

export interface CompetitiveSeatRecord extends CompetitivePlayerAccount {
  sessionId: string;
}

export type CompetitiveSeatBindingFailure =
  | 'room-not-found'
  | 'seat-not-found'
  | 'inactive-seat'
  | 'seat-account-conflict'
  | 'duplicate-account';

export type CompetitiveSeatBindingResult =
  | { outcome: CompetitiveSeatBindingFailure }
  | {
      outcome: 'bound-casual' | 'bound-ineligible';
      assignment: null;
      eligible: false;
    }
  | {
      outcome: 'assigned' | 'already-assigned';
      assignment: CompetitiveMatchAssignment;
      eligible: true;
      committed: boolean;
      room: PokeLoungeRoomSnapshot;
      projection: CompetitiveActionProjection;
    };

export interface CompetitiveMatchRepository {
  bindSeatAndAssign(input: {
    roomCode: string;
    sessionId: string;
    accountId: string;
    createAssignment: (
      context: CompetitiveAssignmentCreateContext,
    ) => CompetitiveMatchAssignment;
  }): Promise<CompetitiveSeatBindingResult>;
}

export function isCompetitiveAssignmentMember(
  assignment: Pick<CompetitiveMatchAssignment, 'playerAccounts'>,
  identity: CompetitivePlayerAccount,
): boolean {
  return assignment.playerAccounts.some(function testItem(member) {
    return (
      member.playerId === identity.playerId &&
      member.accountId === identity.accountId
    );
  });
}

export function createSessionCompetitiveAccountId(
  roomCode: string,
  sessionId: string,
): string {
  return `session:${createHash('sha256')
    .update(roomCode.trim().toUpperCase())
    .update('\0')
    .update(sessionId.trim())
    .digest('hex')}`;
}

export type CompetitiveSeatBindingPlan =
  | { outcome: Exclude<CompetitiveSeatBindingFailure, 'room-not-found'> }
  | {
      outcome: 'bind' | 'already-bound';
      seat: CompetitiveSeatRecord;
      assignmentPlayers:
        [CompetitivePlayerAccount, CompetitivePlayerAccount] | null;
      assignmentBracketMatchId: string | null;
      assignmentKind: 'ranked-head-to-head' | 'tournament-unranked' | null;
    };

export function planCompetitiveSeatBinding(input: {
  room: PokeLoungeRoomState;
  seats: readonly CompetitiveSeatRecord[];
  sessionId: string;
  accountId: string;
}): CompetitiveSeatBindingPlan {
  const participant = input.room.participants.find(
    function findItem(candidate) {
      return candidate.sessionId === input.sessionId;
    },
  );

  if (!participant) {
    return { outcome: 'seat-not-found' };
  }
  if (participant.role !== 'participant' || !participant.connected) {
    return { outcome: 'inactive-seat' };
  }

  const existingSeat = input.seats.find(function findItem(seat) {
    return (
      seat.sessionId === input.sessionId ||
      seat.playerId === participant.playerId
    );
  });
  if (existingSeat && existingSeat.accountId !== input.accountId) {
    return { outcome: 'seat-account-conflict' };
  }
  if (
    input.seats.some(function testItem(seat) {
      return (
        seat.accountId === input.accountId &&
        seat.playerId !== participant.playerId
      );
    })
  ) {
    return { outcome: 'duplicate-account' };
  }

  const seat: CompetitiveSeatRecord = existingSeat ?? {
    sessionId: input.sessionId,
    playerId: participant.playerId,
    accountId: input.accountId,
  };
  const resultingSeats = existingSeat
    ? [...input.seats]
    : [...input.seats, seat];
  const activeBracketMatch =
    input.room.tournament.bracket?.currentRound?.matches.find(
      function findItem(match) {
        return (
          match.status === 'ready' &&
          match.participantIds.includes(participant.playerId)
        );
      },
    );
  const tournamentPlayers = activeBracketMatch
    ? activeBracketMatch.participantIds.map(function mapItem(playerId) {
        return resultingSeats.find(function findItem(seat) {
          return seat.playerId === playerId;
        });
      })
    : [];
  const hasTournamentPlayers =
    tournamentPlayers.length === 2 && tournamentPlayers.every(Boolean);
  const assignmentPlayers = hasTournamentPlayers
    ? (tournamentPlayers.map(function mapItem(seat) {
        return {
          playerId: seat!.playerId,
          accountId: seat!.accountId,
        };
      }) as [CompetitivePlayerAccount, CompetitivePlayerAccount])
    : null;
  const assignmentBracketMatchId = hasTournamentPlayers
    ? activeBracketMatch!.matchId
    : null;
  const assignmentKind = hasTournamentPlayers ? 'tournament-unranked' : null;

  return {
    outcome: existingSeat ? 'already-bound' : 'bind',
    seat,
    assignmentPlayers,
    assignmentBracketMatchId,
    assignmentKind,
  };
}

import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type {
  CompetitiveActionProjection,
  SubmitCompetitiveActionInput,
} from './competitive-action.types';

export const COMPETITIVE_ACTION_REPOSITORY = Symbol(
  'COMPETITIVE_ACTION_REPOSITORY',
);

export const COMPETITIVE_TURN_DEADLINE_MS = 30_000;

export type CompetitiveActionFailure =
  | 'room-not-found'
  | 'match-not-found'
  | 'ruleset-mismatch'
  | 'actor-not-assigned'
  | 'assignment-revision-conflict'
  | 'turn-conflict'
  | 'command-conflict'
  | 'actor-turn-conflict'
  | 'terminal'
  | 'illegal-action';

export type CompetitiveActionResult =
  | { outcome: CompetitiveActionFailure }
  | {
      outcome: 'accepted' | 'replayed';
      response: CompetitiveActionProjection;
      room: PokeLoungeRoomSnapshot;
      committed: boolean;
    };

export type CompetitiveTurnTimeoutResult =
  | { outcome: 'ignored' }
  | { outcome: 'not-due'; retryAtMs: number }
  | {
      outcome: 'resolved';
      response: CompetitiveActionProjection;
      room: PokeLoungeRoomSnapshot;
      nextTurn: CompetitivePendingTurn | null;
    };

export interface CompetitivePendingTurn {
  roomCode: string;
  matchId: string;
  turn: number;
  deadlineMs: number;
}

export interface CompetitiveActionRepository {
  submit(input: SubmitCompetitiveActionInput): Promise<CompetitiveActionResult>;
  findPendingTurns?(): Promise<CompetitivePendingTurn[]>;
  expirePendingTurn(input: {
    roomCode: string;
    matchId: string;
    turn: number;
    nowMs: number;
  }): Promise<CompetitiveTurnTimeoutResult>;
}

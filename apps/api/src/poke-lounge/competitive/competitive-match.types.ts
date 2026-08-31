import type {
  CanonicalBattleState,
  CanonicalTerminalResult,
} from '@poke-lounge/battle/canonical-state';
import type { NormalizedCompetitiveParty } from '@poke-lounge/battle/competitive-party';
import type { PublicCompetitiveBattleState } from './competitive-action.types';

export type CompetitiveMatchStatus = 'pending' | 'active' | 'completed';
export type CompetitiveMatchKind =
  'ranked-head-to-head' | 'tournament-unranked';

export interface CompetitiveTerminalMetadata {
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
}

export interface CompetitivePlayerAccount {
  playerId: string;
  accountId: string;
}

export interface CompetitiveMatchAssignment extends CompetitiveTerminalMetadata {
  roomId: string;
  roomCode: string;
  matchId: string;
  bracketMatchId: string;
  kind: CompetitiveMatchKind;
  assignmentRevision: number;
  playerAccounts: [CompetitivePlayerAccount, CompetitivePlayerAccount];
  rulesetVersion: number;
  rulesetHash: string;
  serverSeed: string;
  initialState: CanonicalBattleState;
  initialStateHash: string;
  currentState: CanonicalBattleState;
  currentStateHash: string;
  currentTurn: number;
  turnStartedAtMs: number;
  status: CompetitiveMatchStatus;
  terminalResult: CanonicalTerminalResult | null;
  completedAt: Date | null;
}

export interface CompetitiveAssignmentProjection extends CompetitiveTerminalMetadata {
  matchId: string;
  bracketMatchId: string;
  kind: CompetitiveMatchKind;
  assignmentRevision: number;
  rulesetVersion: number;
  rulesetHash: string;
  currentTurn: number;
  turnEndsAtMs: number;
  status: CompetitiveMatchStatus;
  playerIds: [string, string];
  currentState: PublicCompetitiveBattleState;
  stateHash: string;
  submittedPlayerIds: string[];
  terminal: CanonicalTerminalResult | null;
}

export interface CompetitiveAssignmentCreateContext {
  roomId: string;
  roomCode: string;
  bracketMatchId: string;
  kind: CompetitiveMatchKind;
  assignmentRevision: number;
  turnStartedAtMs?: number;
  players: [CompetitivePlayerAccount, CompetitivePlayerAccount];
  parties: Record<string, NormalizedCompetitiveParty>;
}

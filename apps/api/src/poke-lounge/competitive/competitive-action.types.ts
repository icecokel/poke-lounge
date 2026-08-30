import type {
  CanonicalBattleStatus,
  BattleStatStages,
  CanonicalCompetitiveAction,
  CanonicalTerminalResult,
} from '@poke-lounge/battle';
import type {
  CompetitiveMatchKind,
  CompetitiveMatchStatus,
  CompetitiveTerminalMetadata,
} from './competitive-match.types';

export type CompetitiveActionReceiptStatus = 'pending' | 'resolved';

export interface PublicCompetitiveBattleState {
  rulesetVersion: 2;
  turn: number;
  participantIds: readonly [string, string];
  playersById: Readonly<
    Record<
      string,
      {
        playerId: string;
        activeSlotIndex: number;
        team: readonly {
          speciesId: number;
          slotIndex: number;
          level: number;
          maxHp: number;
          currentHp: number;
          status: CanonicalBattleStatus;
          statStages: BattleStatStages;
          moves: readonly { moveId: number; pp: number }[];
        }[];
      }
    >
  >;
  terminal: CanonicalTerminalResult | null;
}

export interface CompetitiveActionProjection extends CompetitiveTerminalMetadata {
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

export interface SubmitCompetitiveActionInput {
  roomCode: string;
  matchId: string;
  accountId: string;
  assignmentRevision: number;
  turn: number;
  clientCommandId: string;
  action: CanonicalCompetitiveAction;
}

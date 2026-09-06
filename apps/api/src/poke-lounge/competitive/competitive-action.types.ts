import type {
  CanonicalBattleStatus,
  CanonicalTerminalResult,
} from '@poke-lounge/battle/canonical-state';
import type { BattleStatStages } from '@poke-lounge/battle/battle-stat-stages';
import type { CanonicalCompetitiveAction } from '@poke-lounge/battle/actions';
import type {
  CompetitiveMatchKind,
  CompetitiveMatchStatus,
  CompetitiveTerminalMetadata,
} from './competitive-match.types';

export type CompetitiveActionReceiptStatus = 'pending' | 'resolved';

export interface PublicCompetitiveBattleState {
  lastTurnPresentation?: import('@poke-lounge/battle/battle-presentation').ResolvedTurnPresentation;
  rulesetVersion: 2 | 3;
  turn: number;
  participantIds: readonly [string, string];
  playersById: Readonly<
    Record<
      string,
      {
        playerId: string;
        actionRequest?: import('@poke-lounge/battle/gen4/types').Gen4ActionRequest;
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

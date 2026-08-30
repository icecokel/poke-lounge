import type { CompetitivePendingTurn } from './competitive-action.repository';

export const COMPETITIVE_TURN_QUEUE = Symbol('COMPETITIVE_TURN_QUEUE');
export const COMPETITIVE_TURN_QUEUE_NAME = 'poke-lounge-turn-deadlines';
export const COMPETITIVE_TURN_JOB_NAME = 'expire-turn';

export interface CompetitiveTurnQueue {
  schedule(turn: CompetitivePendingTurn): Promise<void>;
}

export type CompetitiveTurnJobData = CompetitivePendingTurn;

export type CompetitiveTurnJobResult =
  { outcome: 'ignored' } | { outcome: 'resolved' };

export function createCompetitiveTurnJobId(
  turn: CompetitivePendingTurn,
): string {
  return `${turn.matchId}-${turn.turn}`;
}

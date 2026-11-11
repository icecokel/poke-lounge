import { FIELD_MAP } from "./adventure/world/field-map";
import {
  ROUND_SPAWN_BASE_X,
  ROUND_SPAWN_BASE_Y,
  ROUND_SPAWN_COLUMNS,
  ROUND_SPAWN_STEP,
} from "./round-start";

/** Bracket announcement and gameplay cutoff share a single deadline. */
export { TOURNAMENT_BRIEFING_DURATION_MS } from "./timing";
export function isTournamentGatheringDue(
  status: string,
  round: { phase: string; endsAtMs: number | null },
  nowMs: number,
): boolean {
  if (status === "tournament") return true;
  return (
    status === "round-started" &&
    round.phase === "round-started" &&
    round.endsAtMs !== null &&
    Number.isFinite(round.endsAtMs) &&
    nowMs >= round.endsAtMs
  );
}

/** Stable slots across clients, spectators, AI and reconnects; never pile on one pixel. */
export function getTournamentGatherPosition(playerId: string, playerIds: readonly string[]) {
  const ids = [...new Set([...playerIds, playerId])].sort();
  const index = ids.indexOf(playerId);
  return {
    map: FIELD_MAP.key,
    x: ROUND_SPAWN_BASE_X + (index % ROUND_SPAWN_COLUMNS) * ROUND_SPAWN_STEP,
    y: ROUND_SPAWN_BASE_Y + Math.floor(index / ROUND_SPAWN_COLUMNS) * ROUND_SPAWN_STEP,
    facing: "back" as const,
  };
}

import { TOURNAMENT_BRIEFING_DURATION_MS } from "./timing";
import { FIELD_MAP } from "./adventure/world/field-map";

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
    nowMs >= round.endsAtMs - TOURNAMENT_BRIEFING_DURATION_MS
  );
}

/** Stable slots across clients, spectators, AI and reconnects; never pile on one pixel. */
export function getTournamentGatherPosition(playerId: string, playerIds: readonly string[]) {
  const ids = [...new Set([...playerIds, playerId])].sort();
  const index = ids.indexOf(playerId);
  return {
    map: FIELD_MAP.key,
    x: FIELD_MAP.recoverySpawn.x - 48 + (index % 4) * 32,
    y: FIELD_MAP.recoverySpawn.y + Math.floor(index / 4) * 32,
    facing: "back" as const,
  };
}

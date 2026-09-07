import { FIELD_MAP } from "./adventure/world/field-map";

export const ROUND_START_COUNTDOWN_MS = 3_000;
export interface RoundStartClock {
  phase: string;
  startedAtMs: number | null;
  endsAtMs: number | null;
}

/** Null means selection/loading; a future server start means the shared countdown. */
export function isRoundStartBlocked(
  status: string,
  round: RoundStartClock,
  nowMs: number,
): boolean {
  return (
    status === "round-started" &&
    round.phase === "round-started" &&
    (round.startedAtMs === null || round.endsAtMs === null || nowMs < round.startedAtMs)
  );
}

export function getRoundStartCount(
  status: string,
  round: RoundStartClock,
  nowMs: number,
): number | null {
  if (!isRoundStartBlocked(status, round, nowMs) || round.startedAtMs === null) return null;
  return Math.min(3, Math.max(1, Math.ceil((round.startedAtMs - nowMs) / 1_000)));
}

/** Eight distinct, walkable slots in the central plaza, shared by humans and AI. */
export function getRoundStartPosition(playerId: string, playerIds: readonly string[]) {
  const ids = [...new Set([...playerIds, playerId])].sort();
  const index = ids.indexOf(playerId);
  return {
    map: FIELD_MAP.key,
    x: FIELD_MAP.recoverySpawn.x - 48 + (index % 4) * 32,
    y: FIELD_MAP.recoverySpawn.y + 64 + Math.floor(index / 4) * 32,
    facing: "front" as const,
  };
}

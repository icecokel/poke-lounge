export type TournamentRoomMessageType =
  "TOURNAMENT_STARTED" | "TOURNAMENT_MATCH_RESULT" | "TOURNAMENT_COMPLETED" | "ROUND_SCORE_UPDATED";

export interface TournamentStartedRoomPayload {
  roundIndex: number;
  hostPlayerId?: string;
  participantIds: string[];
  matchIds: string[];
}

export interface TournamentMatchResultRoomPayload {
  roundIndex: number;
  hostPlayerId?: string;
  matchId: string;
  winnerPlayerId: string;
  reason: "faint" | "timeout" | "forfeit" | "run" | "capture";
}

export interface TournamentCompletedRoomPayload {
  roundIndex: number;
  hostPlayerId?: string;
  championPlayerId: string;
  standings: Array<{
    playerId: string;
    rank: number;
    score: number;
  }>;
}

export interface RoundScoreUpdatedRoomPayload {
  roundIndex: number;
  hostPlayerId?: string;
  playerId: string;
  score: number;
  rank: number;
}

type TournamentRoomPayload =
  | TournamentStartedRoomPayload
  | TournamentMatchResultRoomPayload
  | TournamentCompletedRoomPayload
  | RoundScoreUpdatedRoomPayload;

export function normalizeTournamentRoomPayload(
  type: "TOURNAMENT_STARTED",
  payload: unknown,
): TournamentStartedRoomPayload | null;
export function normalizeTournamentRoomPayload(
  type: "TOURNAMENT_MATCH_RESULT",
  payload: unknown,
): TournamentMatchResultRoomPayload | null;
export function normalizeTournamentRoomPayload(
  type: "TOURNAMENT_COMPLETED",
  payload: unknown,
): TournamentCompletedRoomPayload | null;
export function normalizeTournamentRoomPayload(
  type: "ROUND_SCORE_UPDATED",
  payload: unknown,
): RoundScoreUpdatedRoomPayload | null;
export function normalizeTournamentRoomPayload(
  type: TournamentRoomMessageType,
  payload: unknown,
): TournamentRoomPayload | null;
export function normalizeTournamentRoomPayload(
  type: TournamentRoomMessageType,
  payload: unknown,
): TournamentRoomPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (type === "TOURNAMENT_STARTED") {
    return normalizeTournamentStartedPayload(payload);
  }

  if (type === "TOURNAMENT_MATCH_RESULT") {
    return normalizeTournamentMatchResultPayload(payload);
  }

  if (type === "TOURNAMENT_COMPLETED") {
    return normalizeTournamentCompletedPayload(payload);
  }

  if (type === "ROUND_SCORE_UPDATED") {
    return normalizeRoundScoreUpdatedPayload(payload);
  }

  return null;
}

function normalizeTournamentStartedPayload(
  payload: Record<string, unknown>,
): TournamentStartedRoomPayload | null {
  const roundIndex = normalizeInteger(payload.roundIndex, 1);
  const hostPlayerId = normalizeOptionalId(payload.hostPlayerId);
  const participantIds = normalizeIdList(payload.participantIds, {
    maxCount: 6,
    minCount: 2,
    removeDuplicates: true,
  });
  const matchIds = normalizeIdList(payload.matchIds, { minCount: 1 });

  if (
    roundIndex === null ||
    hostPlayerId === null ||
    participantIds === null ||
    matchIds === null
  ) {
    return null;
  }

  return {
    roundIndex,
    ...(hostPlayerId ? { hostPlayerId } : {}),
    participantIds,
    matchIds,
  };
}

function normalizeTournamentMatchResultPayload(
  payload: Record<string, unknown>,
): TournamentMatchResultRoomPayload | null {
  const roundIndex = normalizeInteger(payload.roundIndex, 1);
  const hostPlayerId = normalizeOptionalId(payload.hostPlayerId);
  const matchId = normalizeId(payload.matchId);
  const winnerPlayerId = normalizeId(payload.winnerPlayerId);
  const reason = normalizeMatchResultReason(payload.reason);

  if (
    roundIndex === null ||
    hostPlayerId === null ||
    matchId === null ||
    winnerPlayerId === null ||
    reason === null
  ) {
    return null;
  }

  return {
    roundIndex,
    ...(hostPlayerId ? { hostPlayerId } : {}),
    matchId,
    winnerPlayerId,
    reason,
  };
}

function normalizeTournamentCompletedPayload(
  payload: Record<string, unknown>,
): TournamentCompletedRoomPayload | null {
  const roundIndex = normalizeInteger(payload.roundIndex, 1);
  const hostPlayerId = normalizeOptionalId(payload.hostPlayerId);
  const championPlayerId = normalizeId(payload.championPlayerId);
  const standings = normalizeStandings(payload.standings, championPlayerId);

  if (
    roundIndex === null ||
    hostPlayerId === null ||
    championPlayerId === null ||
    standings === null
  ) {
    return null;
  }

  return {
    roundIndex,
    ...(hostPlayerId ? { hostPlayerId } : {}),
    championPlayerId,
    standings,
  };
}

function normalizeRoundScoreUpdatedPayload(
  payload: Record<string, unknown>,
): RoundScoreUpdatedRoomPayload | null {
  const roundIndex = normalizeInteger(payload.roundIndex, 1);
  const hostPlayerId = normalizeOptionalId(payload.hostPlayerId);
  const playerId = normalizeId(payload.playerId);
  const score = normalizeInteger(payload.score, 0);
  const rank = normalizeInteger(payload.rank, 1);

  if (
    roundIndex === null ||
    hostPlayerId === null ||
    playerId === null ||
    score === null ||
    rank === null
  ) {
    return null;
  }

  return {
    roundIndex,
    ...(hostPlayerId ? { hostPlayerId } : {}),
    playerId,
    score,
    rank,
  };
}

function normalizeStandings(
  value: unknown,
  championPlayerId: string | null,
): TournamentCompletedRoomPayload["standings"] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    return null;
  }

  const standings: TournamentCompletedRoomPayload["standings"] = [];
  const playerIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const playerId = normalizeId(item.playerId);
    const rank = normalizeInteger(item.rank, 1);
    const score = normalizeInteger(item.score, 0);

    if (playerId === null || rank === null || score === null) {
      return null;
    }

    if (playerIds.has(playerId)) {
      return null;
    }

    playerIds.add(playerId);
    standings.push({
      playerId,
      rank,
      score,
    });
  }

  if (
    championPlayerId === null ||
    !standings.some(standing => standing.playerId === championPlayerId && standing.rank === 1)
  ) {
    return null;
  }

  return standings;
}

function normalizeIdList(
  value: unknown,
  options: { maxCount?: number; minCount?: number; removeDuplicates?: boolean } = {},
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    const id = normalizeId(item);

    if (id === null) {
      return null;
    }

    if (options.removeDuplicates && seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    ids.push(id);
  }

  if (
    (typeof options.minCount === "number" && ids.length < options.minCount) ||
    (typeof options.maxCount === "number" && ids.length > options.maxCount)
  ) {
    return null;
  }

  return ids;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();

  return id.length > 0 ? id : null;
}

function normalizeOptionalId(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeId(value);
}

function normalizeInteger(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(min, Math.trunc(value));
}

function normalizeMatchResultReason(
  value: unknown,
): TournamentMatchResultRoomPayload["reason"] | null {
  return value === "faint" ||
    value === "timeout" ||
    value === "forfeit" ||
    value === "run" ||
    value === "capture"
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

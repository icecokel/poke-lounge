export const ROUND_TOTAL_COUNT = 3;
export const DEFAULT_PREPARATION_DURATION_MS = 180_000;

export type RoundPhase = "waiting" | "preparation" | "tournament" | "round-result" | "game-result";

export interface GameRoundState {
  phase: RoundPhase;
  roundIndex: number;
  totalRounds: number;
  preparationDurationMs: number;
  phaseStartedAtMs: number | null;
  preparationEndsAtMs: number | null;
}

export function createDefaultRoundState(): GameRoundState {
  return {
    phase: "waiting",
    roundIndex: 0,
    totalRounds: ROUND_TOTAL_COUNT,
    preparationDurationMs: DEFAULT_PREPARATION_DURATION_MS,
    phaseStartedAtMs: null,
    preparationEndsAtMs: null,
  };
}

export function startPreparationRound(
  state: GameRoundState,
  nowMs: number,
  preparationDurationMs = state.preparationDurationMs,
): GameRoundState {
  const nextRoundIndex =
    state.phase === "waiting" ? 1 : Math.min(state.roundIndex + 1, state.totalRounds);
  const normalizedDurationMs = normalizeDurationMs(preparationDurationMs);
  const normalizedNowMs = normalizeTimestampMs(nowMs);

  return {
    ...state,
    phase: "preparation",
    roundIndex: nextRoundIndex,
    preparationDurationMs: normalizedDurationMs,
    phaseStartedAtMs: normalizedNowMs,
    preparationEndsAtMs: normalizedNowMs + normalizedDurationMs,
  };
}

export function getRoundRemainingMs(state: GameRoundState, nowMs: number): number {
  if (state.phase !== "preparation" || state.preparationEndsAtMs === null) {
    return 0;
  }

  return Math.max(0, state.preparationEndsAtMs - normalizeTimestampMs(nowMs));
}

export function transitionPreparationIfExpired(
  state: GameRoundState,
  nowMs: number,
): GameRoundState {
  if (state.phase !== "preparation" || getRoundRemainingMs(state, nowMs) > 0) {
    return state;
  }

  return {
    ...state,
    phase: "tournament",
    phaseStartedAtMs: normalizeTimestampMs(nowMs),
    preparationEndsAtMs: null,
  };
}

export function completeTournamentRound(state: GameRoundState, nowMs: number): GameRoundState {
  if (state.phase !== "tournament" && state.phase !== "round-result") {
    return state;
  }

  if (state.roundIndex >= state.totalRounds) {
    return {
      ...state,
      phase: "game-result",
      phaseStartedAtMs: normalizeTimestampMs(nowMs),
      preparationEndsAtMs: null,
    };
  }

  return startPreparationRound(
    {
      ...state,
      phase: "round-result",
      preparationEndsAtMs: null,
    },
    nowMs,
    state.preparationDurationMs,
  );
}

export function formatRoundTimer(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeDurationMs(durationMs: number): number {
  return Math.max(
    1,
    Math.trunc(Number.isFinite(durationMs) ? durationMs : DEFAULT_PREPARATION_DURATION_MS),
  );
}

function normalizeTimestampMs(nowMs: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(nowMs) ? nowMs : 0));
}

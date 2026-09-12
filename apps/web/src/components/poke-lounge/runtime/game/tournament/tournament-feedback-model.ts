import { ROUND_COUNTDOWN_URGENT_MS } from "@poke-lounge/battle/timing";
import type { GameState } from "../state/game-state-store";
import { formatRoundTimer } from "../round/round-state";

export function getRoundCountdown(state: GameState, nowMs: number) {
  const projection = state.tournament.serverProjection;
  const waitingForStart = Boolean(
    projection &&
    projection.roomStatus === "round-started" &&
    (projection.roomRound.startedAtMs === null || nowMs < projection.roomRound.startedAtMs),
  );
  const preparing =
    !waitingForStart &&
    (projection ? projection.roomStatus === "round-started" : state.round.phase === "preparation");
  const deadline = projection?.roomRound.endsAtMs ?? state.round.preparationEndsAtMs;
  const remainingMs =
    preparing && deadline !== null && Number.isFinite(deadline)
      ? Math.min(state.round.preparationDurationMs, Math.max(0, deadline - nowMs))
      : 0;
  return {
    preparing,
    waitingForStart,
    remainingMs,
    timer: formatRoundTimer(remainingMs),
    urgent: preparing && remainingMs <= ROUND_COUNTDOWN_URGENT_MS,
  };
}

/** Match results aren't tournament completion. Use the completed bracket/session, not a win message. */
export function getTournamentCelebrationKey(state: GameState): string | null {
  const projection = state.tournament.serverProjection;
  const roomId = state.session.roomId ?? projection?.roomCode ?? "local";
  const bracket = projection?.tournament.bracket;
  if (bracket?.status === "completed") return `${roomId}:${bracket.gameRoundIndex}`;
  if (projection) {
    // The server atomically settles a bracket and starts the next exploration.
    // Its next snapshot has no completed bracket. The store retains the score
    // delta only when it has actually observed that completed-round transition.
    // Use that evidence, not cumulative points (which are also sent on joining).
    const completedRound = projection.roundIndex - 1;
    if (
      (projection.roomStatus === "round-started" || projection.roomStatus === "tournament") &&
      state.round.roundIndex === projection.roundIndex &&
      Number.isSafeInteger(completedRound) &&
      completedRound >= 1 &&
      completedRound < state.round.totalRounds &&
      state.tournament.lastRoundScores.some(row => row.score > 0)
    )
      return `${roomId}:${completedRound}`;
    return null;
  }
  const session = state.tournament.session;
  if (session?.status === "completed") return `${roomId}:${session.roundIndex}`;
  // Legacy completion events clear both the session and the server projection.
  if (
    (state.round.phase === "round-result" || state.round.phase === "game-result") &&
    state.tournament.lastRoundScores.length > 0
  )
    return `${roomId}:${state.round.roundIndex}`;
  return null;
}

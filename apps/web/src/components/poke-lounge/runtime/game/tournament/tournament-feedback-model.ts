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
    urgent: preparing && remainingMs <= 10_000,
  };
}

/** Match results aren't tournament completion. Use the completed bracket/session, not a win message. */
export function getTournamentCelebrationKey(state: GameState): string | null {
  const projection = state.tournament.serverProjection;
  const roomId = state.session.roomId ?? projection?.roomCode ?? "local";
  const bracket = projection?.tournament.bracket;
  if (bracket?.status === "completed") return `${roomId}:${bracket.gameRoundIndex}`;
  if (projection) return null;
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

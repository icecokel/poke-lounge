import { isTournamentGatheringDue } from "@poke-lounge/battle/tournament-gathering";
import type { GameStateStore } from "../state/game-state-store";

/** Network rooms show a pre-match bracket; local rooms announce at preparation expiry. */
export function getTournamentGatheringContext(
  state: ReturnType<GameStateStore["getState"]>,
  nowMs: number,
) {
  const projection = state.tournament.serverProjection;
  if (projection) {
    if (!isTournamentGatheringDue(projection.roomStatus, projection.roomRound, nowMs)) return null;
    return {
      key: `${projection.roomCode}:${projection.roundIndex}`,
      ownPlayerId: projection.ownPlayerId,
      playerIds: projection.participants.map(p => p.playerId),
    };
  }
  const { round } = state;
  if (
    round.phase !== "tournament" &&
    !(
      round.phase === "preparation" &&
      round.preparationEndsAtMs !== null &&
      nowMs >= round.preparationEndsAtMs
    )
  )
    return null;
  return {
    key: `local:${round.roundIndex}`,
    ownPlayerId: state.currentPlayerId,
    playerIds: Object.keys(state.playersById),
  };
}

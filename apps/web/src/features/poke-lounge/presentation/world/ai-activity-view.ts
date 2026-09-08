import type { GameState } from "../../contracts/game-state";
import type { PokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";

type AiActivity = Exclude<keyof PokeLoungeCopy["aiActivity"], "completed">;

/** Terminal room state wins over delayed live-world activity snapshots. */
export function isChampionshipFinished(state: Pick<GameState, "round" | "tournament">): boolean {
  const status = state.tournament.serverProjection?.roomStatus;
  if (status) return status === "completed" || status === "closed";
  return state.round.phase === "game-result";
}

export function getAiActivityLabel(
  activity: AiActivity | undefined,
  completed: boolean,
  copy: Pick<PokeLoungeCopy, "aiActivity">,
): string {
  return copy.aiActivity[completed ? "completed" : (activity ?? "idle")];
}

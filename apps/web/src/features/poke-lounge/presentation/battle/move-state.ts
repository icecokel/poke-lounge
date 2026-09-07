import type { BattleDeckPhase } from "../../contracts/battle-controls";
export function isMobileBattleMoveDisabled(phase: BattleDeckPhase, pp: number): boolean {
  return phase === "move-select" && pp <= 0;
}

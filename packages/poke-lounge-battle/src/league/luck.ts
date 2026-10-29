import type { Gen4Step } from "../gen4/types";
import type { LeagueMatchMeasure } from "./contract";

export function countLuck(steps: readonly Gen4Step[]): LeagueMatchMeasure["luck"] {
  const luck = { critsFor: 0, critsAgainst: 0, missesFor: 0, missesAgainst: 0 };
  for (const step of steps) {
    if (step.text === "급소에 맞았다!") luck[step.actorSide === 1 ? "critsFor" : "critsAgainst"]++;
    if (step.text === "공격이 빗나갔다!")
      luck[step.actorSide === 0 ? "missesFor" : "missesAgainst"]++;
  }
  return luck;
}

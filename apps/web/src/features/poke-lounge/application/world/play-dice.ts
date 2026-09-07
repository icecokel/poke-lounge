import type { GameStateStore } from "../../contracts/game-state";
import {
  resolveDiceGambleRound,
  type DiceGambleNumber,
  type DiceGamblePrediction,
  type DiceGambleRound,
} from "../../domain/wallet/dice-rules";
export function playDice(
  store: Pick<GameStateStore, "settleDiceGambleResult">,
  round: DiceGambleRound,
  prediction: DiceGamblePrediction,
  rolled: DiceGambleNumber,
) {
  if (round.options[prediction].winningCaseCount <= 0)
    return { kind: "rejected", reason: "invalid-prediction" } as const;
  const outcome = resolveDiceGambleRound(round, prediction, rolled);
  const settlement = store.settleDiceGambleResult({
    stakePokeDollars: outcome.stakePokeDollars,
    rewardPokeDollars: outcome.rewardPokeDollars,
  });
  return settlement.ok
    ? ({ kind: "settled", outcome } as const)
    : ({ kind: "rejected", reason: settlement.reason } as const);
}

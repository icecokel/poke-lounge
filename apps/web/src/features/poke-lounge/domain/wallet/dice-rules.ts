export const DICE_GAMBLE_STAKE_POKE_DOLLARS = 100;
export const DICE_GAMBLE_PREDICTIONS = ["lower", "equal", "higher"] as const;

export type DiceGambleNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type DiceGamblePrediction = (typeof DICE_GAMBLE_PREDICTIONS)[number];

export interface DiceGambleOption {
  prediction: DiceGamblePrediction;
  winningCaseCount: number;
  rewardPokeDollars: number;
}

export interface DiceGambleRound {
  targetNumber: DiceGambleNumber;
  options: Record<DiceGamblePrediction, DiceGambleOption>;
}

export interface DiceGambleOutcomeInput {
  targetNumber: DiceGambleNumber;
  rolledNumber: DiceGambleNumber;
}

export interface DiceGambleResult {
  prediction: DiceGamblePrediction;
  rolledNumber: DiceGambleNumber;
  outcome: DiceGamblePrediction;
  won: boolean;
  stakePokeDollars: number;
  rewardPokeDollars: number;
  netPokeDollars: number;
}

export function createDiceGambleRound(targetNumber: DiceGambleNumber): DiceGambleRound {
  assertDiceNumber(targetNumber);

  return {
    targetNumber,
    options: {
      lower: createDiceGambleOption("lower", targetNumber - 1),
      equal: createDiceGambleOption("equal", 1),
      higher: createDiceGambleOption("higher", 6 - targetNumber),
    },
  };
}

export function getDiceGambleOutcome({
  targetNumber,
  rolledNumber,
}: DiceGambleOutcomeInput): DiceGamblePrediction {
  assertDiceNumber(targetNumber);
  assertDiceNumber(rolledNumber);

  if (rolledNumber < targetNumber) {
    return "lower";
  }

  if (rolledNumber > targetNumber) {
    return "higher";
  }

  return "equal";
}

export function resolveDiceGambleRound(
  round: DiceGambleRound,
  prediction: DiceGamblePrediction,
  rolledNumber: DiceGambleNumber,
): DiceGambleResult {
  assertDiceNumber(rolledNumber);

  const option = round.options[prediction];

  if (!option) {
    throw new Error(`Unknown dice gamble prediction: ${prediction}`);
  }

  const outcome = getDiceGambleOutcome({
    targetNumber: round.targetNumber,
    rolledNumber,
  });
  const won = outcome === prediction;
  const rewardPokeDollars = won ? option.rewardPokeDollars : 0;

  return {
    prediction,
    rolledNumber,
    outcome,
    won,
    stakePokeDollars: DICE_GAMBLE_STAKE_POKE_DOLLARS,
    rewardPokeDollars,
    netPokeDollars: rewardPokeDollars - DICE_GAMBLE_STAKE_POKE_DOLLARS,
  };
}

function createDiceGambleOption(
  prediction: DiceGamblePrediction,
  winningCaseCount: number,
): DiceGambleOption {
  return {
    prediction,
    winningCaseCount,
    rewardPokeDollars:
      winningCaseCount > 0
        ? Math.floor((DICE_GAMBLE_STAKE_POKE_DOLLARS * 6) / winningCaseCount)
        : 0,
  };
}

function assertDiceNumber(value: number): asserts value is DiceGambleNumber {
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new RangeError(`Dice gamble number must be between 1 and 6: ${value}`);
  }
}

export type Gen4MoveCategory = "physical" | "special" | "status";

export interface Gen4DamageInput {
  level: number;
  power: number;
  attack: number;
  defense: number;
  moveTypeId: number;
  attackerTypeIds: readonly number[];
  typeEffectiveness: number;
  randomFactor: number;
  critical: boolean;
  category: Gen4MoveCategory;
}

export interface Gen4AccuracyInput {
  accuracy: number;
  accuracyStage: number;
  evasionStage: number;
  roll: number;
}

const STAGE_MULTIPLIERS: Record<number, readonly [number, number]> = {
  [-6]: [3, 9],
  [-5]: [3, 8],
  [-4]: [3, 7],
  [-3]: [3, 6],
  [-2]: [3, 5],
  [-1]: [3, 4],
  0: [3, 3],
  1: [4, 3],
  2: [5, 3],
  3: [6, 3],
  4: [7, 3],
  5: [8, 3],
  6: [9, 3],
};

export function calculateGen4Damage(input: Gen4DamageInput): number {
  if (input.category === "status" || input.power <= 0 || input.typeEffectiveness <= 0) {
    return 0;
  }

  const levelFactor = Math.floor((2 * input.level) / 5 + 2);
  const base = Math.floor(
    Math.floor(Math.floor((levelFactor * input.power * input.attack) / input.defense) / 50) + 2,
  );
  const critical = input.critical ? 2 : 1;
  const random = input.randomFactor / 100;
  const stab = input.attackerTypeIds.includes(input.moveTypeId) ? 1.5 : 1;
  const modified = Math.floor(base * critical * random * stab * input.typeEffectiveness);

  return Math.max(1, modified);
}

export function checkGen4Accuracy(input: Gen4AccuracyInput): boolean {
  if (input.accuracy === 0) {
    return true;
  }

  const [accuracyNumerator, accuracyDenominator] =
    STAGE_MULTIPLIERS[clampStage(input.accuracyStage)];
  const [evasionNumerator, evasionDenominator] = STAGE_MULTIPLIERS[clampStage(input.evasionStage)];
  const threshold = Math.floor(
    (input.accuracy * accuracyNumerator * evasionDenominator) /
      (accuracyDenominator * evasionNumerator),
  );

  return input.roll <= Math.min(100, Math.max(1, threshold));
}

function clampStage(stage: number): number {
  return Math.max(-6, Math.min(6, Math.trunc(stage)));
}

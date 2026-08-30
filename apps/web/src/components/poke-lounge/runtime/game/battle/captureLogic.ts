export interface Gen4CaptureValueInput {
  maxHp: number;
  currentHp: number;
  catchRate: number;
  ballBonus?: number;
  statusBonus?: number;
}

export interface Gen4CaptureAttemptInput extends Gen4CaptureValueInput {
  random16?: () => number;
}

export interface Gen4CaptureAttemptResult {
  caught: boolean;
  shakes: number;
  captureValue: number;
  shakeThreshold: number;
}

export function calculateGen4CaptureValue(input: Gen4CaptureValueInput): number {
  const maxHp = clampInteger(input.maxHp, 1, Number.MAX_SAFE_INTEGER);
  const currentHp = clampInteger(input.currentHp, 1, maxHp);
  const catchRate = clampInteger(input.catchRate, 0, 255);
  const ballBonus = input.ballBonus ?? 1;
  const statusBonus = input.statusBonus ?? 1;

  return Math.floor(
    ((3 * maxHp - 2 * currentHp) * catchRate * ballBonus * statusBonus) / (3 * maxHp),
  );
}

export function calculateGen4ShakeThreshold(captureValue: number): number {
  if (captureValue <= 0) {
    return 0;
  }

  return Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / captureValue)));
}

export function resolveGen4CaptureAttempt(
  input: Gen4CaptureAttemptInput,
): Gen4CaptureAttemptResult {
  const captureValue = calculateGen4CaptureValue(input);

  if (captureValue >= 255) {
    return {
      caught: true,
      shakes: 4,
      captureValue,
      shakeThreshold: calculateGen4ShakeThreshold(captureValue),
    };
  }

  const shakeThreshold = calculateGen4ShakeThreshold(captureValue);

  if (captureValue <= 0) {
    return {
      caught: false,
      shakes: 0,
      captureValue,
      shakeThreshold,
    };
  }

  const random16 = input.random16 ?? (() => Math.floor(Math.random() * 65536));

  for (let rollIndex = 0; rollIndex < 4; rollIndex += 1) {
    if (random16() >= shakeThreshold) {
      return {
        caught: false,
        shakes: rollIndex,
        captureValue,
        shakeThreshold,
      };
    }
  }

  return {
    caught: true,
    shakes: 4,
    captureValue,
    shakeThreshold,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

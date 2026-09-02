export interface CaptureAttemptInput {
  maxHp: number;
  currentHp: number;
  catchRate: number;
  ballBonus?: number;
  statusBonus?: number;
  random16?: () => number;
}

export function calculateCaptureValue(input: CaptureAttemptInput): number {
  const maxHp = clampInteger(input.maxHp, 1, Number.MAX_SAFE_INTEGER);
  const currentHp = clampInteger(input.currentHp, 1, maxHp);
  return Math.floor(
    ((3 * maxHp - 2 * currentHp) *
      clampInteger(input.catchRate, 0, 255) *
      (input.ballBonus ?? 1) *
      (input.statusBonus ?? 1)) /
      (3 * maxHp),
  );
}

export function resolveCaptureAttempt(input: CaptureAttemptInput): {
  caught: boolean;
  shakes: number;
  captureValue: number;
  shakeThreshold: number;
} {
  const captureValue = calculateCaptureValue(input);
  const shakeThreshold =
    captureValue <= 0 ? 0 : Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / captureValue)));
  if (captureValue >= 255) {
    return { caught: true, shakes: 4, captureValue, shakeThreshold };
  }
  const random16 =
    input.random16 ??
    function callback() {
      return Math.floor(Math.random() * 65536);
    };
  for (let index = 0; index < 4; index += 1) {
    if (random16() >= shakeThreshold) {
      return { caught: false, shakes: index, captureValue, shakeThreshold };
    }
  }
  return {
    caught: captureValue > 0,
    shakes: captureValue > 0 ? 4 : 0,
    captureValue,
    shakeThreshold,
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.trunc(value) : minimum));
}

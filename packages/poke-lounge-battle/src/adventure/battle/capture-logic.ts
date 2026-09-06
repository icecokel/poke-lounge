import { hgssCaptureValue, hgssShakeThreshold } from "../../gen4/capture";
import { calculateCaptureValue, resolveCaptureAttempt } from "../../capture";

export interface Gen4CaptureValueInput {
  cartridgeRules?: boolean;
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
  return input.cartridgeRules ? hgssCaptureValue(input) : calculateCaptureValue(input);
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
  if (!input.cartridgeRules) return resolveCaptureAttempt(input);
  const captureValue = hgssCaptureValue(input),
    shakeThreshold = hgssShakeThreshold(captureValue);
  if (captureValue >= 255) return { caught: true, shakes: 4, captureValue, shakeThreshold };
  const random16 = input.random16 ?? (() => Math.floor(Math.random() * 65536));
  for (let shakes = 0; shakes < 4; shakes++) {
    const draw = random16();
    if (!Number.isInteger(draw) || draw < 0 || draw > 65535)
      throw Error("Capture RNG must be a 16-bit unsigned integer");
    if (draw >= shakeThreshold) return { caught: false, shakes, captureValue, shakeThreshold };
  }
  return {
    caught: captureValue > 0,
    shakes: captureValue > 0 ? 4 : 0,
    captureValue,
    shakeThreshold,
  };
}

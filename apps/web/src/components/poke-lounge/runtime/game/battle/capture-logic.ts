import { calculateCaptureValue, resolveCaptureAttempt } from "@poke-lounge/battle/capture";

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
  return calculateCaptureValue(input);
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
  return resolveCaptureAttempt(input);
}

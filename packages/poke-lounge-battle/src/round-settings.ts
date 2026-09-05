export const ROUND_DURATION_OPTIONS_MS = [90_000, 180_000, 300_000] as const;
export const DEFAULT_ROUND_DURATION_MS = ROUND_DURATION_OPTIONS_MS[0];

export function sharesPartyExperience(durationMs: number): boolean {
  return durationMs === 90_000;
}

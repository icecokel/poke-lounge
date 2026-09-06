export const ROUND_DURATION_OPTIONS_MS = [90_000, 180_000, 300_000] as const;
export const DEFAULT_ROUND_DURATION_MS = ROUND_DURATION_OPTIONS_MS[0];

export function sharesPartyExperience(durationMs: number): boolean {
  return getPartyExperienceRatio(durationMs) > 0;
}

/** The lead always keeps its full reward; sharing never divides that reward. */
export function getPartyExperienceRatio(durationMs: number): 0 | 0.5 | 1 {
  if (durationMs === 90_000) return 1;
  if (durationMs === 180_000) return 0.5;
  return 0;
}

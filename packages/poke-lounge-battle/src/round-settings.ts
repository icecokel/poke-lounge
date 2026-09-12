import { ROUND_DURATION_OPTIONS_MS } from "./timing";
export { ROUND_DURATION_OPTIONS_MS, DEFAULT_ROUND_DURATION_MS } from "./timing";

export function sharesPartyExperience(durationMs: number): boolean {
  return getPartyExperienceRatio(durationMs) > 0;
}

/** The lead keeps its full reward. Compare base presets, not a local playtest clock multiplier. */
export function getPartyExperienceRatio(durationMs: number): 0 | 0.5 | 1 {
  if (durationMs === ROUND_DURATION_OPTIONS_MS[0]) return 1;
  if (durationMs === ROUND_DURATION_OPTIONS_MS[1]) return 0.5;
  return 0;
}

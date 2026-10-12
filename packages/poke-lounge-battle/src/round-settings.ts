import { ROUND_DURATION_OPTIONS_MS } from "./timing";
export { ROUND_DURATION_OPTIONS_MS, DEFAULT_ROUND_DURATION_MS } from "./timing";

export function sharesPartyExperience(durationMs: number): boolean {
  return getPartyExperienceRatio(durationMs) > 0;
}

/** 짧은 육성 시간일수록 야생전 경험치를 더 많이 지급한다. */
export function getExperienceMultiplier(durationMs: number): 1 | 1.25 | 2 | 2.5 {
  if (durationMs === ROUND_DURATION_OPTIONS_MS[0]) return 2.5;
  if (durationMs === ROUND_DURATION_OPTIONS_MS[1]) return 2;
  if (durationMs === ROUND_DURATION_OPTIONS_MS[2]) return 1.25;
  return 1;
}

/** 대기 팀원 보상은 선두 보상의 비율이며, 기본 라운드 시간을 기준으로 계산한다. */
export function getPartyExperienceRatio(durationMs: number): 0 | 0.75 | 0.8 | 1 {
  if (durationMs === ROUND_DURATION_OPTIONS_MS[0]) return 1;
  if (durationMs === ROUND_DURATION_OPTIONS_MS[1]) return 0.75;
  if (durationMs === ROUND_DURATION_OPTIONS_MS[2]) return 0.8;
  return 0;
}

// 4세대(HGSS) 데이터 범위. 워커 입력 스키마·패키지 검증·웹 파서가 함께 쓴다.
export const GEN4_SPECIES_ID_MAX = 493;
export const GEN4_MOVE_ID_MAX = 470;
export const GEN4_ITEM_ID_MAX = 536;
export const GEN4_ABILITY_ID_MAX = 123;
export const GEN4_NATURE_ID_MAX = 24;
export const GEN4_IV_MAX = 31;
export const GEN4_EV_MAX = 255;
export const GEN4_HAPPINESS_MAX = 255;
export const GEN4_STATUS_TURNS_MAX = 7;
/** 형태 검증용 느슨한 상한. 실제 상한은 카탈로그 maxPp로 검증한다. */
export const COMPETITIVE_PP_MAX = 99;
export const COMPETITIVE_CURRENT_HP_MAX = 10_000;
export const COMPETITIVE_TERMINAL_REASONS = ["faint", "forfeit", "timeout"] as const;
export type CompetitiveTerminalReason = (typeof COMPETITIVE_TERMINAL_REASONS)[number];
export const TOURNAMENT_RESULT_REASONS = [
  ...COMPETITIVE_TERMINAL_REASONS,
  "run",
  "capture",
] as const;
export type TournamentResultReason = (typeof TOURNAMENT_RESULT_REASONS)[number];

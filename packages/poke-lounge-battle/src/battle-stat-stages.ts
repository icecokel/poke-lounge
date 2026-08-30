export const BATTLE_STAT_STAGE_MIN = -6;
export const BATTLE_STAT_STAGE_MAX = 6;

export const BATTLE_STAT_STAGE_KEYS = [
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
  "accuracy",
  "evasion",
] as const;

export type BattleStatStageKey = (typeof BATTLE_STAT_STAGE_KEYS)[number];
export type BattleStatStages = Record<BattleStatStageKey, number>;

export function createDefaultBattleStatStages(): BattleStatStages {
  return {
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

export function normalizeBattleStatStages(
  stages: Partial<BattleStatStages> = {},
): BattleStatStages {
  return Object.fromEntries(
    BATTLE_STAT_STAGE_KEYS.map(key => [key, clampBattleStatStage(stages[key] ?? 0)]),
  ) as BattleStatStages;
}

export function applyBattleStatStageDelta(
  stages: BattleStatStages,
  key: BattleStatStageKey,
  delta: number,
): BattleStatStages {
  return {
    ...stages,
    [key]: clampBattleStatStage(stages[key] + delta),
  };
}

export function calculateBattleStageModifiedStat(stat: number, stage: number): number {
  const baseStat = Math.max(1, Math.trunc(stat));
  const normalizedStage = clampBattleStatStage(stage);

  if (normalizedStage >= 0) {
    return Math.max(1, Math.floor((baseStat * (2 + normalizedStage)) / 2));
  }

  return Math.max(1, Math.floor((baseStat * 2) / (2 - normalizedStage)));
}

export function clampBattleStatStage(stage: number): number {
  return Math.max(BATTLE_STAT_STAGE_MIN, Math.min(BATTLE_STAT_STAGE_MAX, Math.trunc(stage)));
}

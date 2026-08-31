import { getRuntimeGrowthExperienceTable } from "../data/game-data-json";

export const WILD_BATTLE_EXPERIENCE_MULTIPLIER = 5;

export interface WildBattleExpGainInput {
  baseExpYield: number;
  defeatedLevel: number;
}

export interface ApplyExperienceGainInput {
  currentExperience: number;
  currentLevel: number;
  growthRate: number;
  gainedExperience: number;
}

export interface ApplyExperienceGainResult {
  experience: number;
  level: number;
  levelsGained: number;
}

export function calculateWildBattleExpGain({
  baseExpYield,
  defeatedLevel,
}: WildBattleExpGainInput): number {
  const normalizedBaseExpYield = clampInteger(baseExpYield, 0, Number.MAX_SAFE_INTEGER);
  const normalizedDefeatedLevel = clampLevel(defeatedLevel);

  if (normalizedBaseExpYield <= 0) {
    return 0;
  }

  const baseExperience = Math.max(
    1,
    Math.floor((normalizedBaseExpYield * normalizedDefeatedLevel) / 7),
  );

  return baseExperience * WILD_BATTLE_EXPERIENCE_MULTIPLIER;
}

export function getExperienceForLevel(level: number, growthRate: number): number {
  const normalizedLevel = clampLevel(level);
  const table = getRuntimeGrowthExperienceTable(normalizeGrowthRate(growthRate));

  return table[normalizedLevel] ?? 0;
}

export function applyExperienceGain(input: ApplyExperienceGainInput): ApplyExperienceGainResult {
  const startingLevel = clampLevel(input.currentLevel);
  const experience =
    clampInteger(input.currentExperience, 0, Number.MAX_SAFE_INTEGER) +
    clampInteger(input.gainedExperience, 0, Number.MAX_SAFE_INTEGER);
  let level = startingLevel;

  while (level < 100 && experience >= getExperienceForLevel(level + 1, input.growthRate)) {
    level += 1;
  }

  return {
    experience,
    level,
    levelsGained: level - startingLevel,
  };
}

function normalizeGrowthRate(growthRate: number): number {
  if (!Number.isFinite(growthRate)) {
    return 0;
  }

  const normalizedGrowthRate = Math.trunc(growthRate);

  return normalizedGrowthRate >= 0 && normalizedGrowthRate < 8 ? normalizedGrowthRate : 0;
}

function clampLevel(level: number): number {
  return clampInteger(level, 1, 100);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

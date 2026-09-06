import { getExperienceForLevel } from "./experience";

export interface BattleExperienceProgress {
  current: number;
  required: number;
  remaining: number;
  ratio: number;
  atMaxLevel: boolean;
}

/** Growth tables use total lifetime experience; the bar is local to the current level. */
export function getBattleExperienceProgress(pokemon: {
  level: number;
  experience?: number;
  growthRate?: number;
}): BattleExperienceProgress {
  const level = Math.max(1, Math.min(100, Math.trunc(pokemon.level) || 1));
  if (level === 100) return { current: 0, required: 0, remaining: 0, ratio: 1, atMaxLevel: true };
  const rate = pokemon.growthRate ?? 0;
  const floor = getExperienceForLevel(level, rate);
  const required = Math.max(1, getExperienceForLevel(level + 1, rate) - floor);
  const experience = Number.isFinite(pokemon.experience) ? pokemon.experience! : floor;
  const current = Math.max(0, Math.min(required, Math.floor(experience - floor)));
  return {
    current,
    required,
    remaining: required - current,
    ratio: current / required,
    atMaxLevel: false,
  };
}

import type { LeagueGrowthData } from "./data";

export function experienceForLevel(
  data: LeagueGrowthData,
  growthRate: number,
  level: number,
): number {
  const value = data.growthTable[growthRate]?.[level];
  if (value === undefined) throw new Error("Growth table unavailable");
  return value;
}
export function leagueTrainerExperience(
  baseExp: number,
  level: number,
  expMultiplierPermille: number,
  participants: number,
): number {
  if (participants < 1) return 0;
  const experience = Math.floor((Math.floor((baseExp * level) / 7) * 3) / 2);
  return Math.max(
    1,
    Math.floor(Math.floor((experience * expMultiplierPermille) / 1000) / participants),
  );
}
export function leagueWildExperiencePolicy(expMultiplierPermille: number) {
  return {
    experienceMultiplier: expMultiplierPermille / 1000 / 5,
    sharePartyExperience: false,
    partyExperienceRatio: 0,
  };
}

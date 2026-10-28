import type { LeagueBadgeNpc, LeagueNpcSeed, LeagueSeasonRoster } from "../contract";
import {
  DEFAULT_GYM_LEVEL_PLAN,
  GYM_LEVEL_PLANS,
  GYM_TRAINERS,
  type GymLevelPlan,
} from "./gym-level-plans";
import { LeagueRosterError, npcComposition } from "./npc-template";
import { publicPartyOf } from "./public-party";
import { ROM_TRAINERS } from "./rom-trainers";
import { ELITE_FOUR_SUPPLEMENTS } from "./supplements";

export { defenseComposition } from "./registered";
export { DEFAULT_GYM_LEVEL_PLAN } from "./gym-level-plans";

export const NPC_SEEDS = [
  { npcKey: "lance", displayName: "목호", className: "챔피언", order: 1, trainerId: 244 },
  { npcKey: "karen", displayName: "카렌", className: "사천왕", order: 2, trainerId: 246 },
  { npcKey: "bruno", displayName: "시바", className: "사천왕", order: 3, trainerId: 418 },
  { npcKey: "koga", displayName: "독수", className: "사천왕", order: 4, trainerId: 247 },
  { npcKey: "will", displayName: "일목", className: "사천왕", order: 5, trainerId: 245 },
] as const;

export const LEAGUE_ROSTER_VERSION = "roster0:000000000000";

export function npcSeedCompositions(): LeagueNpcSeed[] {
  return NPC_SEEDS.map(({ trainerId, ...meta }) => {
    const composition = npcComposition(
      ROM_TRAINERS[trainerId],
      ELITE_FOUR_SUPPLEMENTS[meta.npcKey],
    );
    return { ...meta, composition, publicParty: publicPartyOf(composition, 50) };
  });
}

export function badgeNpcCompositions(
  plan: GymLevelPlan = DEFAULT_GYM_LEVEL_PLAN,
): LeagueBadgeNpc[] {
  const levels = GYM_LEVEL_PLANS[plan];
  if (!levels) throw new LeagueRosterError(`Unknown gym level plan: ${plan}`);
  return GYM_TRAINERS.map(({ npcKey, trainerId }, badgeIndex) => {
    const trainer = ROM_TRAINERS[trainerId];
    if (levels[badgeIndex]?.length !== trainer.partyCount) {
      throw new LeagueRosterError(`Invalid gym level plan: ${plan}/${npcKey}`);
    }
    return {
      npcKey,
      displayName: trainer.displayName,
      badgeIndex,
      composition: npcComposition(trainer, [], {
        levelOf: slot => levels[badgeIndex][slot],
      }),
    };
  });
}

export function seasonRoster(): LeagueSeasonRoster {
  return {
    rosterVersion: LEAGUE_ROSTER_VERSION,
    npcSeeds: npcSeedCompositions(),
    badgeNpcs: badgeNpcCompositions(),
  };
}

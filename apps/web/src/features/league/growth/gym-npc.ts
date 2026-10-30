import type { WorldMapModel } from "@/components/poke-lounge/runtime/game/world/world-map-model";
import { badgeNpcCompositions } from "@poke-lounge/battle/league/roster/index";
import type { LeagueBadgeNpc } from "@poke-lounge/battle/league/contract";
export const GYM_NPC_POSITION = { x: 560, y: 464 };
export const GYM_SPRITES: Record<string, string> = {
  falkner: "/assets/poke-lounge/textures/a_0_8_1_0146/gsleader1_5.png",
  bugsy: "/assets/poke-lounge/textures/a_0_8_1_0147/gsleader2_5.png",
  whitney: "/assets/poke-lounge/textures/a_0_8_1_0148/gsleader3_5.png",
  morty: "/assets/poke-lounge/textures/a_0_8_1_0149/gsleader4_5.png",
  chuck: "/assets/poke-lounge/textures/a_0_8_1_0150/gsleader5_5.png",
  jasmine: "/assets/poke-lounge/textures/a_0_8_1_0151/gsleader6_5.png",
  pryce: "/assets/poke-lounge/textures/a_0_8_1_0152/gsleader7_5.png",
  clair: "/assets/poke-lounge/textures/a_0_8_1_0153/gsleader8_5.png",
};
export function nextGym(badges: number): LeagueBadgeNpc | null {
  return badgeNpcCompositions()[badges] ?? null;
}
export function withGymNpc(model: WorldMapModel, gym: LeagueBadgeNpc | null): WorldMapModel {
  return {
    ...model,
    npcs: [
      ...model.npcs,
      ...(gym
        ? [
            {
              name: "soloChallenger" as const,
              role: "gymLeader",
              displayName: gym.displayName,
              imageUrl: GYM_SPRITES[gym.npcKey]!,
              ...GYM_NPC_POSITION,
            },
          ]
        : []),
    ],
  };
}

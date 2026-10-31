import type {
  WorldMapModel,
  WorldMapNpcModel,
} from "@/components/poke-lounge/runtime/game/world/world-map-model";
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
// ROM-order preview: neutral, left step, neutral, right step in each direction.
export const GYM_WALK_FRAMES = {
  back: [1, 2, 3, 4],
  front: [5, 6, 7, 8],
  left: [9, 10, 11, 12],
  right: [13, 14, 15, 16],
} as const;
export function gymFrameUrl(npcKey: string, frame: number): string {
  return GYM_SPRITES[npcKey]!.replace("_5.png", `_${frame}.png`);
}
export function nextGym(badges: number): LeagueBadgeNpc | null {
  return badgeNpcCompositions()[badges] ?? null;
}
export function withGymNpc(model: WorldMapModel, npc: WorldMapNpcModel): WorldMapModel {
  return { ...model, npcs: [...model.npcs, npc] };
}

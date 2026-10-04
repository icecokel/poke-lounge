import {
  POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS,
  type PokeLoungeRuntimeItemId,
} from "../../runtime-item-ids";
import { getRuntimeItemDetails } from "../data/game-data-json";
export const RUNTIME_ITEM_ROM_IDS = POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS;
export type RuntimeItemId = PokeLoungeRuntimeItemId;

export function getRuntimeGameItem(itemId: string) {
  const romItemId = RUNTIME_ITEM_ROM_IDS[itemId as RuntimeItemId];
  return romItemId ? getRuntimeItemDetails(romItemId) : null;
}

export function getRuntimeItemIds(): RuntimeItemId[] {
  return Object.keys(RUNTIME_ITEM_ROM_IDS) as RuntimeItemId[];
}

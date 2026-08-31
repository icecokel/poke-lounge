import {
  POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS,
  type PokeLoungeRuntimeItemId,
} from "@poke-lounge/battle";
import {
  getRuntimeItemDetails,
  getRuntimeShopItemRomIds,
  hasRuntimeShopItemRomIds,
  type RuntimeShopKind,
} from "../data/game-data-json";
export const RUNTIME_ITEM_ROM_IDS = POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS;
export type RuntimeItemId = PokeLoungeRuntimeItemId;

const RUNTIME_ITEM_IDS_BY_ROM_ID = new Map<number, RuntimeItemId>(
  Object.entries(RUNTIME_ITEM_ROM_IDS).map(
    ([itemId, romItemId]) => [romItemId, itemId as RuntimeItemId] as const,
  ),
);

export function getRuntimeGameItem(itemId: string) {
  const romItemId = RUNTIME_ITEM_ROM_IDS[itemId as RuntimeItemId];
  return romItemId ? getRuntimeItemDetails(romItemId) : null;
}

export function getRuntimeItemIds(): RuntimeItemId[] {
  return Object.keys(RUNTIME_ITEM_ROM_IDS) as RuntimeItemId[];
}

export function getRuntimeShopItemIds(shopKind: RuntimeShopKind): RuntimeItemId[] {
  return getRuntimeShopItemRomIds(shopKind).map(romItemId => {
    const itemId = RUNTIME_ITEM_IDS_BY_ROM_ID.get(romItemId);
    if (!itemId) {
      throw new Error(`Shop catalog ${shopKind} contains unsupported ROM item ${romItemId}.`);
    }
    return itemId;
  });
}

export function hasRuntimeShopItemIds(shopKind: RuntimeShopKind): boolean {
  return hasRuntimeShopItemRomIds(shopKind);
}

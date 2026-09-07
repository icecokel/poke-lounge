import { getRuntimeGameItem } from "@poke-lounge/battle/adventure/items/runtime-items";
import type { ShopItem } from "../../contracts/game-state";
export function getShopItemById(itemId: string): ShopItem | undefined {
  const item = getRuntimeGameItem(itemId);
  return item
    ? {
        id: itemId,
        displayName: item.name,
        price: item.price,
        description: item.description,
      }
    : undefined;
}

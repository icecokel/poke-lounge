import { getRuntimeGameItem } from "@poke-lounge/battle/adventure/items/runtime-items";
import type { InventoryItemDetails } from "../../contracts/game-state";
export function getInventoryItemById(itemId: string): InventoryItemDetails | undefined {
  const item = getRuntimeGameItem(itemId);
  return item
    ? {
        id: itemId,
        displayName: item.name,
        description: item.description,
      }
    : undefined;
}

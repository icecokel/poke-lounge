import type { BuyShopItemResult, LocalPlayerState } from "../../contracts/game-state";

import type { PlayerChange } from "../player/player-change";

import { isPositiveInteger } from "../player/player-helpers";

import { getShopItemById } from "./item-catalog";

export function purchaseItem(
  localPlayer: LocalPlayerState,
  itemIds: readonly string[],
  itemId: string,
  quantity: number,
): PlayerChange<BuyShopItemResult> {
  const item = itemIds.includes(itemId) ? getShopItemById(itemId) : undefined;
  if (!item) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "unknown-item" },
    };
  }
  if (!isPositiveInteger(quantity)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-quantity" },
    };
  }
  const totalPrice = item.price * quantity;
  if (localPlayer.wallet.pokeDollars < totalPrice) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "insufficient-funds" },
    };
  }
  return {
    player: {
      ...localPlayer,
      wallet: {
        ...localPlayer.wallet,
        pokeDollars: localPlayer.wallet.pokeDollars - totalPrice,
      },
      inventory: {
        ...localPlayer.inventory,
        [item.id]: (localPlayer.inventory[item.id] ?? 0) + quantity,
      },
    },
    changed: true,
    result: { ok: true },
  };
}

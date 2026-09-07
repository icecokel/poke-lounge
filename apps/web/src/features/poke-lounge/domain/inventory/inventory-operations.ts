import { applyInventoryItemEffect } from "@poke-lounge/battle/adventure/items/inventory-item-effects";
import type {
  ConsumeInventoryItemResult,
  UseInventoryItemOnPartySlotResult,
} from "../../contracts/game-state";

import type { LocalPlayerState } from "../../contracts/game-state";

import { getShopItemById } from "../inventory/item-catalog";

import type { PlayerChange } from "../player/player-change";

import { isPositiveInteger, isValidMoveIndex } from "../player/player-helpers";

export function consumeInventoryItem(
  localPlayer: LocalPlayerState,
  itemId: string,
  quantity: number,
): PlayerChange<ConsumeInventoryItemResult> {
  if (!isPositiveInteger(quantity)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-quantity" },
    };
  }
  const currentQuantity = localPlayer.inventory[itemId] ?? 0;
  if (currentQuantity < quantity) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "insufficient-quantity" },
    };
  }
  const nextQuantity = currentQuantity - quantity;
  const nextInventory = { ...localPlayer.inventory };
  if (nextQuantity > 0) {
    nextInventory[itemId] = nextQuantity;
  } else {
    delete nextInventory[itemId];
  }
  return {
    player: {
      ...localPlayer,
      inventory: nextInventory,
    },
    changed: true,
    result: { ok: true },
  };
}

export function useInventoryItemOnPartySlot(
  localPlayer: LocalPlayerState,
  itemId: string,
  slotIndex: number,
): PlayerChange<UseInventoryItemOnPartySlotResult> {
  const item = getShopItemById(itemId);
  if (!item) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "unknown-item",
        message: "사용할 수 없는 아이템이다.",
      },
    };
  }
  const quantity = localPlayer.inventory[itemId] ?? 0;
  if (quantity <= 0) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "insufficient-quantity",
        message: `${item.displayName}이 없다!`,
      },
    };
  }
  const partySlot = localPlayer.party.find(function findItem(slot) {
    return slot.slotIndex === slotIndex;
  });
  if (!partySlot?.pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "invalid-target",
        message: "대상 포켓몬이 없다.",
      },
    };
  }
  const itemResult = applyInventoryItemEffect(itemId, partySlot.pokemon);
  if (!itemResult.ok) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: itemResult.reason,
        message: itemResult.message,
      },
    };
  }
  if (itemResult.pendingMoveReplacements.length > 0) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: true,
        itemId,
        messages: itemResult.messages,
        pokemon: itemResult.pokemon,
        pendingMoveReplacements: itemResult.pendingMoveReplacements,
      },
    };
  }
  const nextQuantity = quantity - 1;
  const nextInventory = { ...localPlayer.inventory };
  if (nextQuantity > 0) {
    nextInventory[itemId] = nextQuantity;
  } else {
    delete nextInventory[itemId];
  }
  const nextPokemon = itemResult.pokemon;
  return {
    player: {
      ...localPlayer,
      inventory: nextInventory,
      party: localPlayer.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex ? { ...slot, pokemon: nextPokemon } : slot;
      }),
    },
    changed: true,
    result: {
      ok: true,
      itemId,
      messages: itemResult.messages,
      pokemon: nextPokemon,
      pendingMoveReplacements: itemResult.pendingMoveReplacements,
    },
  };
}

export function resolveInventoryItemMoveReplacements(
  localPlayer: LocalPlayerState,
  itemId: string,
  slotIndex: number,
  decisions: ReadonlyArray<number | null>,
): PlayerChange<UseInventoryItemOnPartySlotResult> {
  const item = getShopItemById(itemId);
  if (!item) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "unknown-item",
        message: "사용할 수 없는 아이템이다.",
      },
    };
  }
  const quantity = localPlayer.inventory[itemId] ?? 0;
  if (quantity <= 0) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "insufficient-quantity",
        message: `${item.displayName}이 없다!`,
      },
    };
  }
  const partySlot = localPlayer.party.find(function findItem(slot) {
    return slot.slotIndex === slotIndex;
  });
  if (!partySlot?.pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "invalid-target",
        message: "대상 포켓몬이 없다.",
      },
    };
  }
  const itemResult = applyInventoryItemEffect(itemId, partySlot.pokemon);
  if (!itemResult.ok) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: itemResult.reason,
        message: itemResult.message,
      },
    };
  }
  if (
    itemResult.pendingMoveReplacements.length === 0 ||
    decisions.length !== itemResult.pendingMoveReplacements.length ||
    decisions.some(function testItem(decision) {
      return decision !== null && !isValidMoveIndex(decision);
    })
  ) {
    return {
      player: localPlayer,
      changed: false,
      result: {
        ok: false,
        itemId,
        reason: "invalid-move-replacements",
        message: "기술 교체 선택을 완료할 수 없다.",
      },
    };
  }
  let nextPokemon = itemResult.pokemon;
  const replacementMessages: string[] = [];
  for (const [index, pendingMove] of itemResult.pendingMoveReplacements.entries()) {
    const moveIndex = decisions[index];
    if (moveIndex === null || moveIndex === undefined) {
      replacementMessages.push(`${pendingMove.name} 습득을 취소했다.`);
      continue;
    }
    const currentMoves = nextPokemon.moves ?? [];
    const replacedMove = currentMoves[moveIndex];
    if (!replacedMove) {
      return {
        player: localPlayer,
        changed: false,
        result: {
          ok: false,
          itemId,
          reason: "invalid-move-replacements",
          message: "기술 교체 선택을 완료할 수 없다.",
        },
      };
    }
    nextPokemon = {
      ...nextPokemon,
      moves: currentMoves.map(function mapItem(move, currentIndex) {
        return currentIndex === moveIndex ? pendingMove : move;
      }),
    };
    replacementMessages.push(`기술이 ${replacedMove.name}에서 ${pendingMove.name}로 바뀌었다!`);
  }
  const nextQuantity = quantity - 1;
  const nextInventory = { ...localPlayer.inventory };
  if (nextQuantity > 0) {
    nextInventory[itemId] = nextQuantity;
  } else {
    delete nextInventory[itemId];
  }
  return {
    player: {
      ...localPlayer,
      inventory: nextInventory,
      party: localPlayer.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex ? { ...slot, pokemon: nextPokemon } : slot;
      }),
    },
    changed: true,
    result: {
      ok: true,
      itemId,
      messages: [...itemResult.messages, ...replacementMessages],
      pokemon: nextPokemon,
      pendingMoveReplacements: [],
    },
  };
}

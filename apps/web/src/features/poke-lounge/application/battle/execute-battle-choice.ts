import {
  chooseBattleBagItem,
  chooseBattleCommand,
  choosePartySlot,
  choosePlayerMove,
} from "@poke-lounge/battle/adventure/battle/battle-logic";
import type {
  BattleCommand,
  BattleScreenState,
} from "@poke-lounge/battle/adventure/battle/battle-types";
import {
  RUNTIME_ITEM_ROM_IDS,
  type RuntimeItemId,
} from "@poke-lounge/battle/adventure/items/runtime-items";
import { canUseGen4ItemOnMember } from "@poke-lounge/battle/gen4/engine";
import type { GameStateStore } from "../../contracts/game-state";
export type BattleChoice =
  | { kind: "command"; command: BattleCommand }
  | { kind: "item"; itemId: RuntimeItemId }
  | { kind: "party"; slotIndex: number }
  | { kind: "move"; moveIndex: number };
export interface BattleChoiceResult {
  state: BattleScreenState;
  selectedPartySlot?: number;
}
export function executeBattleChoice(
  state: BattleScreenState,
  choice: BattleChoice,
  inventory: Pick<GameStateStore, "getCurrentLocalPlayer" | "consumeInventoryItem">,
): BattleChoiceResult {
  let next = state;
  if (choice.kind === "command") next = chooseBattleCommand(state, choice.command);
  else if (choice.kind === "item")
    next = chooseBattleBagItem(state, choice.itemId, {
      itemCount: inventory.getCurrentLocalPlayer().inventory[choice.itemId] ?? 0,
    });
  else if (choice.kind === "party") next = choosePartySlot(state, choice.slotIndex);
  else next = choosePlayerMove(state, choice.moveIndex);
  if ((choice.kind === "item" || choice.kind === "party") && next.usedInventoryItemId)
    inventory.consumeInventoryItem(next.usedInventoryItemId, 1);
  return {
    state: next,
    ...(choice.kind === "item" && next.pendingBattleItemId
      ? {
          selectedPartySlot:
            next.player.party.find(
              slot =>
                slot.pokemon &&
                canUseGen4ItemOnMember(
                  RUNTIME_ITEM_ROM_IDS[next.pendingBattleItemId as RuntimeItemId],
                  slot.pokemon,
                ),
            )?.slotIndex ?? 0,
        }
      : {}),
  };
}

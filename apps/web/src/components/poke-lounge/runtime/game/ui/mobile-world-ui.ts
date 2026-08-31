import type { DiceGamblePrediction } from "../gamble/dice-gamble";
import { PLAYER_PARTY_SLOT_COUNT, type PlayerPokemonSlot } from "../player/player-types";
import type { PlayerPokemon } from "../state/game-state-store";
import type { ShortcutGuideInputMode } from "./shortcut-guide";

export type MobileWorldUiScreen =
  | "explore"
  | "help"
  | "inventory-items"
  | "inventory-move-replace"
  | "inventory-party"
  | "shop"
  | "pc"
  | "dice"
  | "party";

export interface MobileWorldItemOption {
  count: number;
  description: string;
  disabled: boolean;
  id: string;
  index: number;
  name: string;
  price: number | null;
  selected: boolean;
}

export interface PokeLoungePartySlotSummary {
  canSetAsLead: boolean;
  currentHp: number | null;
  isActive: boolean;
  isEmpty: boolean;
  level: number;
  maxHp: number | null;
  name: string;
  slotIndex: number;
  status: string | null;
}

export type MobileWorldPartyOption = PokeLoungePartySlotSummary;

export interface MobileWorldMoveOption {
  id: number;
  index: number;
  name: string;
  selected: boolean;
}

export interface MobileWorldMoveReplacementState {
  moves: MobileWorldMoveOption[];
  newMoveName: string;
  pokemonName: string;
}

export interface MobileWorldBoxOption {
  boxIndex: number;
  currentHp: number | null;
  level: number;
  maxHp: number | null;
  name: string;
  selected: boolean;
  status: string | null;
}

export interface MobileWorldDiceOption {
  disabled: boolean;
  label: string;
  prediction: DiceGamblePrediction;
  rewardPokeDollars: number;
  selected: boolean;
  winningCaseCount: number;
}

export interface MobileWorldDiceState {
  options: MobileWorldDiceOption[];
  stakePokeDollars: number;
  targetNumber: number;
}

export interface MobileWorldUiState {
  box: MobileWorldBoxOption[];
  items: MobileWorldItemOption[];
  inputMode: ShortcutGuideInputMode;
  message: string;
  moveReplacement: MobileWorldMoveReplacementState | null;
  party: MobileWorldPartyOption[];
  pcFocus: "party" | "box";
  screen: MobileWorldUiScreen;
  selectedItemDescription: string;
  selectedItemName: string;
  selectedPartySlotIndex: number;
  title: string;
  walletPokeDollars: number;
  dice: MobileWorldDiceState | null;
}

export type MobileWorldUiAction =
  | { type: "open-help" }
  | { type: "open-inventory" }
  | { type: "open-party" }
  | { type: "close" }
  | { type: "back" }
  | { type: "select-inventory-item"; index: number }
  | { type: "select-inventory-move"; index: number }
  | { type: "use-inventory-item" }
  | { type: "skip-inventory-move" }
  | { type: "select-inventory-party"; slotIndex: number }
  | { type: "select-shop-item"; index: number }
  | { type: "purchase-shop-item" }
  | { type: "select-pc-focus"; focus: "party" | "box" }
  | { type: "select-pc-party"; slotIndex: number }
  | { type: "select-pc-box"; boxIndex: number }
  | { type: "confirm-pc-selection" }
  | { type: "select-dice-prediction"; prediction: DiceGamblePrediction }
  | { type: "confirm-dice-selection" }
  | { type: "set-party-lead"; slotIndex: number };

export function createPokeLoungePartySlotSummaries({
  activePartySlotIndex,
  party,
}: {
  activePartySlotIndex: number;
  party: Array<PlayerPokemonSlot<PlayerPokemon>>;
}): PokeLoungePartySlotSummary[] {
  return Array.from({ length: PLAYER_PARTY_SLOT_COUNT }, function callback(_, slotIndex) {
    const pokemon =
      party.find(function findItem(slot) {
        return slot.slotIndex === slotIndex;
      })?.pokemon ?? null;

    return {
      canSetAsLead:
        pokemon !== null && pokemon.status !== "fainted" && slotIndex !== activePartySlotIndex,
      currentHp: pokemon?.currentHp ?? null,
      isActive: slotIndex === activePartySlotIndex,
      isEmpty: pokemon === null,
      level: pokemon?.level ?? 0,
      maxHp: pokemon?.maxHp ?? null,
      name: pokemon?.name ?? "-",
      slotIndex,
      status: pokemon?.status ?? null,
    };
  });
}

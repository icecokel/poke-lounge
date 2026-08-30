import type { BattleCommand, BattlePhase } from "../battle/battleTypes";

export const POKE_LOUNGE_MOBILE_BATTLE_STATE_EVENT = "poke-lounge:mobile-battle-state";
export const POKE_LOUNGE_MOBILE_BATTLE_ACTION_EVENT = "poke-lounge:mobile-battle-action";
export const POKE_LOUNGE_MOBILE_BATTLE_STATE_REQUEST_EVENT =
  "poke-lounge:mobile-battle-state-request";

export type MobileBattleDeckPhase = Extract<
  BattlePhase,
  | "intro"
  | "command"
  | "move-select"
  | "move-replace-select"
  | "party-select"
  | "bag-select"
  | "resolving"
  | "ended"
>;

export interface MobileBattleCommandOption {
  id: BattleCommand;
  selected: boolean;
}

export interface MobileBattleMoveOption {
  index: number;
  name: string;
  pp: number;
  maxPp: number;
  type: string;
  effectNotice: string | null;
  selected: boolean;
  disabled: boolean;
}

export interface MobileBattlePartyOption {
  slotIndex: number;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  status: string | null;
  selected: boolean;
  isCurrent: boolean;
  isFainted: boolean;
  isEmpty: boolean;
  canSwitch: boolean;
}

export interface MobileBattleItemOption {
  index: number;
  id: string;
  name: string;
  count: number;
  selected: boolean;
  disabled: boolean;
}

export interface MobileBattleUiState {
  phase: MobileBattleDeckPhase;
  message: string | null;
  isHelpOpen: boolean;
  isInputLocked: boolean;
  canGoBack: boolean;
  isForcedPartySwitch: boolean;
  commands: MobileBattleCommandOption[];
  moves: MobileBattleMoveOption[];
  party: MobileBattlePartyOption[];
  items: MobileBattleItemOption[];
  moveReplacement: {
    pokemonName: string;
    newMoveName: string;
    newMovePp: number;
    newMoveMaxPp: number;
    newMoveType: string;
  } | null;
}

export type MobileBattleUiAction =
  | { type: "confirm-message" }
  | { type: "go-back" }
  | { type: "toggle-help" }
  | { type: "select-command"; index: number }
  | { type: "select-move"; index: number }
  | { type: "select-party"; index: number }
  | { type: "select-item"; index: number }
  | { type: "select-move-replacement"; index: number };

export function isMobileBattleMoveDisabled(phase: MobileBattleDeckPhase, pp: number): boolean {
  return phase === "move-select" && pp <= 0;
}

export function dispatchMobileBattleUiState(document: Document, state: MobileBattleUiState): void {
  document.dispatchEvent(
    new CustomEvent<MobileBattleUiState>(POKE_LOUNGE_MOBILE_BATTLE_STATE_EVENT, {
      detail: state,
    }),
  );
}

export function dispatchMobileBattleUiAction(
  document: Document,
  action: MobileBattleUiAction,
): void {
  document.dispatchEvent(
    new CustomEvent<MobileBattleUiAction>(POKE_LOUNGE_MOBILE_BATTLE_ACTION_EVENT, {
      detail: action,
    }),
  );
}

export function requestMobileBattleUiState(document: Document): void {
  document.dispatchEvent(new CustomEvent(POKE_LOUNGE_MOBILE_BATTLE_STATE_REQUEST_EVENT));
}

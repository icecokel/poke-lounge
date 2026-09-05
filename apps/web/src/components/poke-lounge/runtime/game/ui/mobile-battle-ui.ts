import type { BattleCommand, BattlePhase, BattleSpriteRef } from "../battle/battle-types";

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
  sprite: BattleSpriteRef | null;
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
  requiresConfirmation?: boolean;
  spectating?: boolean;
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

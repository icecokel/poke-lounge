import type { MoveLearningSummary } from "@/features/poke-lounge/contracts/move-learning";
import type {
  BattleCommand,
  BattlePhase,
  BattleSpriteRef,
} from "@poke-lounge/battle/adventure/battle/battle-types";
export type BattleDeckPhase = Extract<
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

export interface BattleControls {
  /** Changes when the active battle, turn, or input phase changes. */
  selectionKey?: string;
  turnEndsAtMs?: number | null;
  canSubmitAction?: boolean;
  phase: BattleDeckPhase;
  message: string | null;
  requiresConfirmation?: boolean;
  spectating?: boolean;
  /** Server battles currently allow moves and switches, but not bag/escape actions. */
  isAuthoritative?: boolean;
  isHelpOpen: boolean;
  isInputLocked: boolean;
  canGoBack: boolean;
  isForcedPartySwitch: boolean;
  itemTargetName?: string | null;
  commands: MobileBattleCommandOption[];
  moves: MobileBattleMoveOption[];
  party: MobileBattlePartyOption[];
  items: MobileBattleItemOption[];
  learnedMove?: MoveLearningSummary | null;
  moveReplacement: {
    confirmationIndex?: number | null;
    pokemonName: string;
    newMoveName: string;
    newMovePp: number;
    newMoveMaxPp: number;
    newMoveType: string;
  } | null;
}

export type BattleUiAction =
  | { type: "confirm-message" }
  | { type: "go-back" }
  | { type: "toggle-help" }
  | { type: "select-command"; index: number }
  | { type: "select-move"; index: number }
  | { type: "select-party"; index: number }
  | { type: "select-item"; index: number }
  | { type: "select-move-replacement"; index: number }
  | { type: "confirm-move-replacement" };

export type {
  BattleDeckPhase as MobileBattleDeckPhase,
  BattleUiAction as MobileBattleUiAction,
  BattleControls as MobileBattleUiState,
};

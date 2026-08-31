import type { ShortcutGuideInputMode } from "../ui/shortcut-guide";
import type { MobileBattleUiAction, MobileBattleUiState } from "../ui/mobile-battle-ui";
import type { BattleKind, BattlePhase, BattlePokemonStatus, BattleSpriteRef } from "./battle-types";

export interface BattleSpritePresentation {
  alpha: number;
  height: number;
  sprite: BattleSpriteRef;
  tint: "white" | null;
  width: number;
  x: number;
  y: number;
}

export interface BattleCombatantPresentation {
  currentHp: number;
  displayedHp: number;
  level: number;
  maxHp: number;
  name: string;
  sprite: BattleSpritePresentation;
  status: BattlePokemonStatus;
}

export interface BattleCapturePresentation {
  ballItemId: string;
  ballRotation: number;
  ballX: number;
  ballY: number;
  caught: boolean;
  resultProgress: number | null;
  showBall: boolean;
}

export interface BattleEvolutionPresentation {
  flashAlpha: number;
  progress: number;
  silhouetteAlpha: number;
  sprite: BattleSpritePresentation;
}

export interface BattlePresentationState {
  authoritative: {
    connectionStatus: string;
    inputPending: boolean;
    spectating: boolean;
  };
  battleKind: BattleKind;
  capture: BattleCapturePresentation | null;
  entrance: { active: boolean; progress: number };
  evolution: BattleEvolutionPresentation | null;
  help: { inputMode: ShortcutGuideInputMode; open: boolean };
  message: string | null;
  opponent: BattleCombatantPresentation;
  phase: BattlePhase;
  player: BattleCombatantPresentation;
}

export interface BattleUiSnapshot {
  controls: MobileBattleUiState | null;
  presentation: BattlePresentationState | null;
}

export interface BattleUiStore {
  clear(): void;
  dispatch(action: MobileBattleUiAction): void;
  getSnapshot(): BattleUiSnapshot;
  publish(snapshot: BattleUiSnapshot): void;
  publishPresentation(presentation: BattlePresentationState): void;
  setActionHandler(handler: ((action: MobileBattleUiAction) => void) | null): void;
  subscribe(listener: () => void): () => void;
}

const emptySnapshot = (): BattleUiSnapshot => ({ controls: null, presentation: null });

export function createBattleUiStore(): BattleUiStore {
  let snapshot = emptySnapshot();
  let actionHandler: ((action: MobileBattleUiAction) => void) | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: BattleUiSnapshot) => {
    snapshot = next;
    listeners.forEach(function visitItem(listener) {
      return listener();
    });
  };

  return {
    clear() {
      actionHandler = null;
      publish(emptySnapshot());
    },
    dispatch(action) {
      actionHandler?.(action);
    },
    getSnapshot() {
      return snapshot;
    },
    publish,
    publishPresentation(presentation) {
      publish({ ...snapshot, presentation });
    },
    setActionHandler(handler) {
      actionHandler = handler;
    },
    subscribe(listener) {
      listeners.add(listener);
      return function callback() {
        return listeners.delete(listener);
      };
    },
  };
}

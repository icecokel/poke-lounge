import type { MobileWorldUiAction, MobileWorldUiState } from "../ui/mobile-world-ui";

export type WorldUiAction =
  | MobileWorldUiAction
  | { type: "open-pokemon-status"; slotIndex: number }
  | { type: "set-pokemon-status-lead"; slotIndex: number }
  | { type: "close-pokemon-status" };

export interface WorldUiSnapshot {
  areaAnnouncement: string | null;
  interactionPrompt: string | null;
  mobile: MobileWorldUiState | null;
  nurseHealing: { active: boolean; effectCount: number };
  nurseMessage: string | null;
  pokemonStatusSlotIndex: number | null;
  tournamentAnnouncement: string | null;
  tournamentResult: string | null;
}

export interface WorldUiStore {
  clear(): void;
  dispatch(action: WorldUiAction): void;
  getSnapshot(): WorldUiSnapshot;
  publishMobile(state: MobileWorldUiState): void;
  publishPresentation(presentation: Partial<Omit<WorldUiSnapshot, "mobile">>): void;
  setActionHandler(handler: ((action: WorldUiAction) => void) | null): void;
  subscribe(listener: () => void): () => void;
}

const emptySnapshot = (): WorldUiSnapshot => ({
  areaAnnouncement: null,
  interactionPrompt: null,
  mobile: null,
  nurseHealing: { active: false, effectCount: 0 },
  nurseMessage: null,
  pokemonStatusSlotIndex: null,
  tournamentAnnouncement: null,
  tournamentResult: null,
});

export function createWorldUiStore(): WorldUiStore {
  let snapshot = emptySnapshot();
  let actionHandler: ((action: WorldUiAction) => void) | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: WorldUiSnapshot) => {
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
    publishMobile(mobile) {
      publish({ ...snapshot, mobile });
    },
    publishPresentation(presentation) {
      publish({ ...snapshot, ...presentation });
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

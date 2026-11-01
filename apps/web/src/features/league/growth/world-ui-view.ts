import {
  FIELD_AREA_ANNOUNCEMENT_DURATION_MS,
  NURSE_HEAL_DURATION_MS,
} from "@poke-lounge/battle/timing";
import type {
  WorldUiSnapshot,
  WorldUiStore,
} from "@/components/poke-lounge/runtime/game/world/world-ui-store";

export const LEAGUE_NURSE_MESSAGE_MS = NURSE_HEAL_DURATION_MS + FIELD_AREA_ANNOUNCEMENT_DURATION_MS;

export function createLeagueWorldUiView(base: WorldUiStore, hideAfterMs: number): WorldUiStore {
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observedCount: number | null = null;
  let hiddenCount: number | null = null;
  let cachedSource: WorldUiSnapshot | null = null;
  let cachedHidden = false;
  let cachedView: WorldUiSnapshot;
  const notify = () => listeners.forEach(listener => listener());
  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const syncMessage = () => {
    const snapshot = base.getSnapshot();
    if (!snapshot.nurseMessage) {
      cancelTimer();
      observedCount = hiddenCount = null;
    } else if (snapshot.nurseHealing.effectCount !== observedCount) {
      cancelTimer();
      const count = snapshot.nurseHealing.effectCount;
      observedCount = count;
      hiddenCount = null;
      timer = setTimeout(() => {
        timer = null;
        hiddenCount = count;
        notify();
      }, hideAfterMs);
    }
  };
  return {
    clear: () => base.clear(),
    dispatch: action => base.dispatch(action),
    publishMobile: state => base.publishMobile(state),
    publishPresentation: presentation => base.publishPresentation(presentation),
    setActionHandler: handler => base.setActionHandler(handler),
    getSnapshot() {
      const snapshot = base.getSnapshot();
      const hidden = !!snapshot.nurseMessage && snapshot.nurseHealing.effectCount === hiddenCount;
      if (snapshot !== cachedSource || hidden !== cachedHidden) {
        cachedSource = snapshot;
        cachedHidden = hidden;
        cachedView = hidden ? { ...snapshot, nurseMessage: null } : snapshot;
      }
      return cachedView;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!unsubscribe) {
        unsubscribe = base.subscribe(() => {
          syncMessage();
          notify();
        });
        syncMessage();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        unsubscribe?.();
        unsubscribe = null;
        cancelTimer();
        observedCount = hiddenCount = null;
      };
    },
  };
}

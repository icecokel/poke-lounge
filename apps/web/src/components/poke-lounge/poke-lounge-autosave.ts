import {
  savePokeLoungeState,
  type PokeLoungeStateSaveResult,
} from "@/services/poke-lounge-state-service";
import type { GameStateStore } from "./runtime/game/state/gameStateStore";
import {
  buildPokeLoungeSaveSnapshot,
  type PokeLoungeSaveSnapshot,
} from "./runtime/game/state/poke-lounge-save-snapshot";

export const POKE_LOUNGE_AUTOSAVE_INTERVAL_MS = 30_000;
export const POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS = 2_000;

export interface PokeLoungeAutosavePayload {
  token: string;
  snapshot: PokeLoungeSaveSnapshot;
  expectedRevision: number;
  clientUpdatedAt: string;
  keepalive: boolean;
}

export interface PokeLoungeAutosaveScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface StartPokeLoungeAutosaveOptions {
  gameStateStore: Pick<GameStateStore, "getState" | "subscribe">;
  token: string;
  getToken?: () => string;
  initialRevision?: number;
  intervalMs?: number;
  debounceMs?: number;
  scheduler?: PokeLoungeAutosaveScheduler;
  getClientUpdatedAt?: () => string;
  saveState?: (payload: PokeLoungeAutosavePayload) => Promise<PokeLoungeStateSaveResult>;
  onStatusChange?: (status: PokeLoungeAutosaveStatus) => void;
  onRevisionConflict?: () => void;
}

export type PokeLoungeAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface PokeLoungeAutosaveController {
  flush(options?: { keepalive?: boolean }): Promise<void>;
  waitForIdle(): Promise<void>;
  dispose(options?: { flush?: boolean }): Promise<void>;
}

export interface PokeLoungeAutosaveLifecycle {
  disposeForRehydration(): Promise<void>;
  disposeForUnmount(): Promise<void>;
}

export interface PokeLoungeTokenLifecycle {
  registerAutosave(autosave: PokeLoungeAutosaveLifecycle): void;
  disposeForRehydration(autosave: PokeLoungeAutosaveLifecycle): void;
  disposeForUnmount(autosave: PokeLoungeAutosaveLifecycle): void;
  runHydration<T>(hydrate: () => Promise<T>): Promise<T>;
}

export function createPokeLoungeAutosaveLifecycle(
  autosave: PokeLoungeAutosaveController,
): PokeLoungeAutosaveLifecycle {
  return {
    disposeForRehydration() {
      return autosave.dispose();
    },
    disposeForUnmount() {
      return autosave.dispose();
    },
  };
}

export function createPokeLoungeTokenLifecycle(): PokeLoungeTokenLifecycle {
  let activeAutosave: PokeLoungeAutosaveLifecycle | null = null;
  let disposalBarrier = Promise.resolve();
  const queuedDisposals = new WeakSet<PokeLoungeAutosaveLifecycle>();

  const queueDisposal = (autosave: PokeLoungeAutosaveLifecycle, dispose: () => Promise<void>) => {
    if (activeAutosave === autosave) {
      activeAutosave = null;
    }
    if (queuedDisposals.has(autosave)) {
      return;
    }

    queuedDisposals.add(autosave);
    const disposal = disposalBarrier.then(dispose);
    disposalBarrier = disposal.catch(() => undefined);
  };

  return {
    registerAutosave(autosave) {
      if (activeAutosave && activeAutosave !== autosave) {
        const previousAutosave = activeAutosave;
        queueDisposal(previousAutosave, () => previousAutosave.disposeForRehydration());
      }
      activeAutosave = autosave;
    },
    disposeForRehydration(autosave) {
      queueDisposal(autosave, () => autosave.disposeForRehydration());
    },
    disposeForUnmount(autosave) {
      queueDisposal(autosave, () => autosave.disposeForUnmount());
    },
    runHydration(hydrate) {
      if (activeAutosave) {
        const autosave = activeAutosave;
        queueDisposal(autosave, () => autosave.disposeForRehydration());
      }
      return disposalBarrier.then(hydrate);
    },
  };
}

const pokeLoungeTokenLifecycle = createPokeLoungeTokenLifecycle();

export function getPokeLoungeTokenLifecycle(): PokeLoungeTokenLifecycle {
  return pokeLoungeTokenLifecycle;
}

export function startPokeLoungeAutosave({
  gameStateStore,
  token,
  getToken = () => token,
  initialRevision = 0,
  intervalMs = POKE_LOUNGE_AUTOSAVE_INTERVAL_MS,
  debounceMs = POKE_LOUNGE_AUTOSAVE_DEBOUNCE_MS,
  scheduler = createDefaultScheduler(),
  getClientUpdatedAt = () => new Date().toISOString(),
  saveState = savePokeLoungeAutosavePayload,
  onStatusChange,
  onRevisionConflict,
}: StartPokeLoungeAutosaveOptions): PokeLoungeAutosaveController {
  let dirty = true;
  let disposed = false;
  let revisionConflicted = false;
  let debounceHandle: unknown = null;
  let inFlight: Promise<void> | null = null;
  let currentRevision = initialRevision;
  onStatusChange?.("idle");

  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    throw new Error("Poke Lounge autosave initialRevision must be a non-negative safe integer");
  }

  const clearDebounce = () => {
    if (debounceHandle === null) {
      return;
    }

    scheduler.clearTimeout(debounceHandle);
    debounceHandle = null;
  };

  const createPayload = (
    snapshot = buildPokeLoungeSaveSnapshot(gameStateStore),
    clientUpdatedAt = getClientUpdatedAt(),
    keepalive = false,
  ): PokeLoungeAutosavePayload => ({
    token: getToken(),
    snapshot,
    expectedRevision: currentRevision,
    clientUpdatedAt,
    keepalive,
  });

  const stopForRevisionConflict = () => {
    if (revisionConflicted) {
      return;
    }

    revisionConflicted = true;
    dirty = false;
    clearDebounce();
    onStatusChange?.("error");
    onRevisionConflict?.();
  };

  const savePayload = async (payload: PokeLoungeAutosavePayload) => {
    onStatusChange?.("saving");
    inFlight = (async () => {
      try {
        const result = await saveState(payload);
        if (!result.success) {
          if (result.conflict) {
            stopForRevisionConflict();
            return;
          }

          dirty = true;
          onStatusChange?.("error");
          return;
        }

        if (result.revision !== payload.expectedRevision + 1) {
          stopForRevisionConflict();
          return;
        }

        currentRevision = result.revision;

        onStatusChange?.(dirty ? "pending" : "saved");
      } catch {
        dirty = true;
        onStatusChange?.("error");
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}) => {
    clearDebounce();

    if (!dirty || revisionConflicted) {
      return;
    }

    if (inFlight) {
      await inFlight;
      if (!dirty) {
        return;
      }
    }

    dirty = false;
    await savePayload(createPayload(undefined, undefined, keepalive));
  };

  const scheduleDebouncedFlush = () => {
    if (disposed) {
      return;
    }

    clearDebounce();
    debounceHandle = scheduler.setTimeout(() => {
      debounceHandle = null;
      void flush();
    }, debounceMs);
  };

  const unsubscribe = gameStateStore.subscribe(() => {
    if (revisionConflicted) {
      return;
    }

    dirty = true;
    onStatusChange?.("pending");
    scheduleDebouncedFlush();
  });

  const intervalHandle = scheduler.setInterval(() => {
    void flush();
  }, intervalMs);

  const waitForIdle = async () => {
    if (inFlight) {
      await inFlight;
    }
  };

  return {
    flush,
    waitForIdle,
    async dispose({ flush: shouldFlush = true } = {}) {
      if (disposed) {
        await waitForIdle();
        return;
      }

      const finalSnapshot = shouldFlush ? buildPokeLoungeSaveSnapshot(gameStateStore) : null;
      const finalClientUpdatedAt = shouldFlush ? getClientUpdatedAt() : null;
      disposed = true;
      clearDebounce();
      scheduler.clearInterval(intervalHandle);
      unsubscribe();

      if (finalSnapshot && finalClientUpdatedAt && !revisionConflicted) {
        await waitForIdle();
        dirty = false;
        await savePayload(createPayload(finalSnapshot, finalClientUpdatedAt));
        return;
      }

      await waitForIdle();
    },
  };
}

function savePokeLoungeAutosavePayload({
  token,
  snapshot,
  expectedRevision,
  clientUpdatedAt,
  keepalive,
}: PokeLoungeAutosavePayload): Promise<PokeLoungeStateSaveResult> {
  return savePokeLoungeState(
    {
      state: snapshot,
      expectedRevision,
      clientUpdatedAt,
    },
    token,
    {},
    { keepalive },
  );
}

function createDefaultScheduler(): PokeLoungeAutosaveScheduler {
  return {
    setTimeout(callback, delayMs) {
      return globalThis.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
    },
    setInterval(callback, delayMs) {
      return globalThis.setInterval(callback, delayMs);
    },
    clearInterval(handle) {
      globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
    },
  };
}

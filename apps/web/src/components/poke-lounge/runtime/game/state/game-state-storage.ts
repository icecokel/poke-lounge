import type { GameStateStorage, LocalPlayersSaveState } from "./game-state-store";
import { sanitizeLocalPlayersSaveState } from "./poke-lounge-save-snapshot";

export const GAME_STATE_STORAGE_VERSION = 2;
export const DEFAULT_GAME_STATE_STORAGE_KEY = "poke-lounge:game-state";
export const ANONYMOUS_GAME_STATE_STORAGE_SCOPE = "anonymous";

export interface WebStorageGameStateStorageOptions {
  storage: Storage;
  fallbackStorage?: Storage;
  key?: string;
  getScope?: () => string;
}

interface SavedGameStatePayload {
  version: typeof GAME_STATE_STORAGE_VERSION;
  ownerScope: string;
  currentPlayerId: string;
  playersById: LocalPlayersSaveState["playersById"];
  savedAtMs?: number;
}

export function createWebStorageGameStateStorage({
  key = DEFAULT_GAME_STATE_STORAGE_KEY,
  storage,
  fallbackStorage,
  getScope = function callback() {
    return ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
  },
}: WebStorageGameStateStorageOptions): GameStateStorage {
  const storageKeyForScope = (scope: string) => `${key}:${encodeURIComponent(scope)}`;

  return {
    loadLocalPlayers() {
      const scope = getScope();
      const scopedKey = storageKeyForScope(scope);
      const scopedPayload = readSavedPayload(storage, scopedKey, scope);
      const fallbackPayload = fallbackStorage
        ? readSavedPayload(fallbackStorage, scopedKey, scope)
        : null;
      if (
        fallbackPayload &&
        (!scopedPayload || (fallbackPayload.savedAtMs ?? 0) > (scopedPayload.savedAtMs ?? 0))
      ) {
        try {
          storage.setItem(scopedKey, JSON.stringify(fallbackPayload));
          fallbackStorage?.removeItem(scopedKey);
        } catch {
          // The newer session save remains available for the next reload.
        }
        return toLocalPlayers(fallbackPayload);
      }
      if (scopedPayload) {
        return toLocalPlayers(scopedPayload);
      }

      for (const source of [
        { storage, key },
        ...(fallbackStorage ? [{ storage: fallbackStorage, key }] : []),
      ]) {
        const payload = readSavedPayload(source.storage, source.key, scope);
        if (!payload) {
          continue;
        }

        try {
          storage.setItem(scopedKey, JSON.stringify(payload));
          source.storage.removeItem(source.key);
        } catch {
          // Keep the original save when local storage cannot accept the migration.
        }
        return toLocalPlayers(payload);
      }
      return null;
    },
    saveLocalPlayers({ currentPlayerId, playersById }) {
      const scope = getScope();
      const payload: SavedGameStatePayload = {
        version: GAME_STATE_STORAGE_VERSION,
        ownerScope: scope,
        currentPlayerId,
        playersById,
        savedAtMs: Date.now(),
      };

      try {
        storage.setItem(storageKeyForScope(scope), JSON.stringify(payload));
      } catch {
        try {
          fallbackStorage?.setItem(storageKeyForScope(scope), JSON.stringify(payload));
        } catch {
          // The current game state remains usable even when browser storage is full or blocked.
        }
      }
    },
    clear() {
      for (const destination of [storage, fallbackStorage]) {
        try {
          destination?.removeItem(storageKeyForScope(getScope()));
        } catch {
          // Clearing the in-memory game state must still succeed.
        }
      }
    },
  };
}

export function migrateGameStateStorageToLocalStorage(
  sessionStorage: Storage,
  localStorage: Storage,
): void {
  let keys: string[];
  try {
    keys = Array.from({ length: sessionStorage.length }, function callback(_, index) {
      return sessionStorage.key(index);
    }).filter(function filterItem(key): key is string {
      return (
        key !== null &&
        (key === DEFAULT_GAME_STATE_STORAGE_KEY ||
          key.startsWith(`${DEFAULT_GAME_STATE_STORAGE_KEY}:`))
      );
    });
  } catch {
    return;
  }

  for (const key of keys) {
    try {
      const value = sessionStorage.getItem(key);
      if (value === null) {
        continue;
      }
      const existing = localStorage.getItem(key);
      if (existing === null) {
        localStorage.setItem(key, value);
      } else if (existing !== value) {
        // Keep the session copy so a scoped read can recover it if the local copy is invalid.
        continue;
      }
      sessionStorage.removeItem(key);
    } catch {
      // A failed copy must never delete the original session save.
    }
  }
}

function readSavedPayload(
  storage: Storage,
  key: string,
  ownerScope: string,
): SavedGameStatePayload | null {
  let rawValue: string | null;
  try {
    rawValue = storage.getItem(key);
  } catch {
    return null;
  }
  if (!rawValue) {
    return null;
  }

  try {
    const payload = JSON.parse(rawValue) as Partial<SavedGameStatePayload>;
    if (
      payload.version !== GAME_STATE_STORAGE_VERSION ||
      payload.ownerScope !== ownerScope ||
      !payload.currentPlayerId ||
      !payload.playersById
    ) {
      return null;
    }

    const localPlayers = sanitizeLocalPlayersSaveState({
      currentPlayerId: payload.currentPlayerId,
      playersById: payload.playersById,
    });

    return localPlayers
      ? {
          version: GAME_STATE_STORAGE_VERSION,
          ownerScope,
          ...localPlayers,
          ...(typeof payload.savedAtMs === "number" && Number.isFinite(payload.savedAtMs)
            ? { savedAtMs: payload.savedAtMs }
            : {}),
        }
      : null;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // An invalid value may be read again, but cannot prevent startup.
    }
    return null;
  }
}

function toLocalPlayers(payload: SavedGameStatePayload): LocalPlayersSaveState {
  return {
    currentPlayerId: payload.currentPlayerId,
    playersById: payload.playersById,
  };
}

import type { GameStateStorage, LocalPlayersSaveState } from "./gameStateStore";

export const GAME_STATE_STORAGE_VERSION = 2;
export const DEFAULT_GAME_STATE_STORAGE_KEY = "poke-lounge:game-state";
export const ANONYMOUS_GAME_STATE_STORAGE_SCOPE = "anonymous";

export interface WebStorageGameStateStorageOptions {
  storage: Storage;
  key?: string;
  getScope?: () => string;
}

interface SavedGameStatePayload {
  version: typeof GAME_STATE_STORAGE_VERSION;
  ownerScope: string;
  currentPlayerId: string;
  playersById: LocalPlayersSaveState["playersById"];
}

export function createWebStorageGameStateStorage({
  key = DEFAULT_GAME_STATE_STORAGE_KEY,
  storage,
  getScope = () => ANONYMOUS_GAME_STATE_STORAGE_SCOPE,
}: WebStorageGameStateStorageOptions): GameStateStorage {
  const storageKeyForScope = (scope: string) => `${key}:${encodeURIComponent(scope)}`;

  return {
    loadLocalPlayers() {
      const scope = getScope();
      const scopedKey = storageKeyForScope(scope);
      const scopedPayload = readSavedPayload(storage, scopedKey, scope);
      if (scopedPayload) {
        return toLocalPlayers(scopedPayload);
      }

      const legacyPayload = readSavedPayload(storage, key, scope);
      if (!legacyPayload) {
        return null;
      }

      storage.setItem(scopedKey, JSON.stringify(legacyPayload));
      storage.removeItem(key);
      return toLocalPlayers(legacyPayload);
    },
    saveLocalPlayers({ currentPlayerId, playersById }) {
      const scope = getScope();
      const payload: SavedGameStatePayload = {
        version: GAME_STATE_STORAGE_VERSION,
        ownerScope: scope,
        currentPlayerId,
        playersById,
      };

      storage.setItem(storageKeyForScope(scope), JSON.stringify(payload));
    },
    clear() {
      storage.removeItem(storageKeyForScope(getScope()));
    },
  };
}

function readSavedPayload(
  storage: Storage,
  key: string,
  ownerScope: string,
): SavedGameStatePayload | null {
  const rawValue = storage.getItem(key);
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

    return payload as SavedGameStatePayload;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function toLocalPlayers(payload: SavedGameStatePayload): LocalPlayersSaveState {
  return {
    currentPlayerId: payload.currentPlayerId,
    playersById: payload.playersById,
  };
}

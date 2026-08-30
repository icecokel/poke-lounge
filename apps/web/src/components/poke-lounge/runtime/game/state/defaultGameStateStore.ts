import { createGameStateStore, type GameStateStore } from "./gameStateStore";
import {
  DEFAULT_GAME_STATE_STORAGE_KEY,
  ANONYMOUS_GAME_STATE_STORAGE_SCOPE,
  createWebStorageGameStateStorage,
} from "./gameStateStorage";

let defaultGameStateStore: GameStateStore | null = null;
let defaultGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;

export const AUTHENTICATED_GAME_STATE_STORAGE_SCOPE = "authenticated";

export function createAuthenticatedGameStateStorageScope(accountId: string): string {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new Error("Authenticated game state storage requires an account id");
  }

  return `${AUTHENTICATED_GAME_STATE_STORAGE_SCOPE}:${encodeURIComponent(normalizedAccountId)}`;
}

export function getDefaultGameStateStore(): GameStateStore {
  defaultGameStateStore ??= createGameStateStore({
    storage: createBrowserStorageAdapter(),
  });

  return defaultGameStateStore;
}

export function resetDefaultGameStateStoreForTest(): void {
  defaultGameStateStore = null;
  defaultGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
}

export function setDefaultGameStateStorageScope(scope: string): void {
  defaultGameStateStorageScope = scope;
}

function createBrowserStorageAdapter() {
  if (typeof window === "undefined") {
    return undefined;
  }

  window.localStorage?.removeItem(DEFAULT_GAME_STATE_STORAGE_KEY);

  if (!window.sessionStorage) {
    return undefined;
  }

  return createWebStorageGameStateStorage({
    storage: window.sessionStorage,
    getScope: () => defaultGameStateStorageScope,
  });
}

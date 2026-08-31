import { createGameStateStore, type GameStateStore } from "./gameStateStore";
import {
  ANONYMOUS_GAME_STATE_STORAGE_SCOPE,
  createWebStorageGameStateStorage,
  migrateGameStateStorageToLocalStorage,
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

  if (!window.localStorage) {
    return undefined;
  }

  if (window.sessionStorage) {
    migrateGameStateStorageToLocalStorage(window.sessionStorage, window.localStorage);
  }

  return createWebStorageGameStateStorage({
    storage: window.localStorage,
    getScope: () => defaultGameStateStorageScope,
  });
}

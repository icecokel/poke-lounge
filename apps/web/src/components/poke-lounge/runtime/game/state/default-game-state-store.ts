import { createGameStateStore, type GameStateStore } from "./game-state-store";
import {
  ANONYMOUS_GAME_STATE_STORAGE_SCOPE,
  createWebStorageGameStateStorage,
  migrateGameStateStorageToLocalStorage,
} from "./game-state-storage";
import { isRoomRunId } from "../room-run-id";

let defaultGameStateStore: GameStateStore | null = null;
let defaultGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
let defaultGameStateRoomRunId: string | null = null;

export const AUTHENTICATED_GAME_STATE_STORAGE_SCOPE = "authenticated";

export function createAuthenticatedGameStateStorageScope(accountId: string): string {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new Error("Authenticated game state storage requires an account id");
  }

  return `${AUTHENTICATED_GAME_STATE_STORAGE_SCOPE}:${encodeURIComponent(normalizedAccountId)}`;
}

export function createRoomGameStateStorageScope(ownerScope: string, roomRunId: string): string {
  const normalizedOwnerScope = ownerScope.trim();
  if (!normalizedOwnerScope || !isRoomRunId(roomRunId)) {
    throw new Error("Room game state storage requires an owner scope and room run UUID");
  }

  return `${normalizedOwnerScope}:room-run:${roomRunId}`;
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
  defaultGameStateRoomRunId = null;
}

export function setDefaultGameStateStorageScope(scope: string): void {
  defaultGameStateStorageScope = scope;
}

export function setDefaultGameStateRoomRunId(roomRunId: string | null): void {
  if (roomRunId !== null && !isRoomRunId(roomRunId)) {
    throw new Error("Room game state storage requires a room run UUID");
  }

  defaultGameStateRoomRunId = roomRunId;
}

function getDefaultGameStateStorageScope(): string {
  return defaultGameStateRoomRunId
    ? createRoomGameStateStorageScope(defaultGameStateStorageScope, defaultGameStateRoomRunId)
    : defaultGameStateStorageScope;
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
    getScope: getDefaultGameStateStorageScope,
  });
}

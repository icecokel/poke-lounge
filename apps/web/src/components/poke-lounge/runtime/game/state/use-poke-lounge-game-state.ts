"use client";

import { useSyncExternalStore } from "react";
import { getDefaultGameStateStore } from "./defaultGameStateStore";
import type { GameState, GameStateStore } from "./gameStateStore";

export function usePokeLoungeGameState(
  store: GameStateStore = getDefaultGameStateStore(),
): GameState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

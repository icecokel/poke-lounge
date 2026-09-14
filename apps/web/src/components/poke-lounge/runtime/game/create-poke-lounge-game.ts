import type { PokeLoungeRuntimeAssets } from "./assets/poke-lounge-runtime-assets";
import {
  registerPreloadedPokeLoungeAudio,
  stopAllPokeLoungeAudio,
} from "./audio/poke-lounge-audio";
import type { BattleUiStore } from "./battle/battle-ui-store";
import type { InitialGameScene } from "./game-startup";
import type { GameViewportDisplaySize } from "./game-viewport";
import { createLocalPreviewRoom, type MultiplayerRoom } from "./network/local-preview-room";
import { RuntimeKeyboard } from "./runtime-input";
import { BattleController } from "./scenes/battle-scene";
import { WorldController, type WorldSceneCreateData } from "./scenes/world-scene";
import { getDefaultGameStateStore } from "./state/default-game-state-store";
import type { GameStateStore } from "./state/game-state-store";
import type { RoomLobbyRuntimeState } from "./ui/room-lobby-screen";
import type { WorldFrameStore } from "./world/world-frame-store";
import type { WorldMapModel } from "./world/world-map-model";
import type { WorldRuntime } from "./world/world-runtime";
import type { WorldUiStore } from "./world/world-ui-store";

export interface PokeLoungeGameResult {
  playerId: string;
  score: number;
}

export interface PokeLoungeGameOptions {
  runtimeAssets: PokeLoungeRuntimeAssets;
  initialScene?: InitialGameScene;
  battleUiStore: BattleUiStore;
  competitiveRoundsEnabled?: boolean;
  gameStateStore?: GameStateStore;
  multiplayerRoom?: MultiplayerRoom;
  onGameResult?: (result: PokeLoungeGameResult) => void;
  onRoomLobbyStateChange?: (state: RoomLobbyRuntimeState | null) => void;
  onStarterSelectionRequested?: (onComplete: () => void) => void;
  serverAuthoritativeRounds?: boolean;
  viewportSize?: GameViewportDisplaySize;
  worldFrameStore: WorldFrameStore;
  worldModel: WorldMapModel;
  worldRuntime: WorldRuntime;
  worldUiStore: WorldUiStore;
}

export interface PokeLoungeGameRuntime {
  destroy(): void;
  resize(viewportSize: GameViewportDisplaySize): void;
}

export function createPokeLoungeGame(
  parent: HTMLElement,
  options: PokeLoungeGameOptions,
): PokeLoungeGameRuntime {
  const gameStateStore = options.gameStateStore ?? getDefaultGameStateStore();
  const multiplayerRoom = options.multiplayerRoom ?? createLocalPreviewRoom();
  const keyboard = new RuntimeKeyboard(parent);
  const ownerWindow = parent.ownerDocument.defaultView ?? window;
  let activeScene: InitialGameScene = options.initialScene ?? "world";
  let viewportSize = normalizeViewportSize(options.viewportSize);
  let destroyed = false;
  let animationFrame = 0;
  let previousFrameTime = performance.now();
  function startWorld(data: unknown = {}) {
    if (destroyed) return;
    battleController.stop();
    activeScene = "world";
    worldController.start(toWorldSceneCreateData(data));
  }
  function startBattle(data: unknown = {}) {
    if (destroyed) return;
    worldController.shutdown();
    activeScene = "battle";
    battleController.start(data);
  }

  const worldController = new WorldController(gameStateStore, multiplayerRoom, {
    competitiveRoundsEnabled: options.competitiveRoundsEnabled,
    keyboard,
    onRoomLobbyStateChange: options.onRoomLobbyStateChange,
    onStarterSelectionRequested: options.onStarterSelectionRequested,
    onStartBattle: startBattle,
    ownerDocument: parent.ownerDocument,
    runtimeAssets: options.runtimeAssets,
    serverAuthoritativeRounds: options.serverAuthoritativeRounds,
    viewportSize,
    worldFrameStore: options.worldFrameStore,
    worldModel: options.worldModel,
    worldRuntime: options.worldRuntime,
    worldUiStore: options.worldUiStore,
  });
  const battleController = new BattleController({
    battleUiStore: options.battleUiStore,
    gameStateStore,
    keyboard,
    multiplayerRoom,
    onRestart: startBattle,
    onReturnToWorld: startWorld,
    parent,
    runtimeAssets: options.runtimeAssets,
  });

  registerPreloadedPokeLoungeAudio(
    options.runtimeAssets.audioManifest,
    options.runtimeAssets.audioBuffers,
  );
  const unsubscribeGameResult = subscribeToFinalGameResult(gameStateStore, options.onGameResult);
  parent.dataset.pokeLoungeResourceStatus = "ready";

  if (activeScene === "battle") {
    battleController.start();
  } else {
    worldController.start();
  }

  const update = (now: number) => {
    if (destroyed) return;
    const elapsedMs = Math.min(100, Math.max(0, now - previousFrameTime));
    previousFrameTime = now;
    if (activeScene === "battle") battleController.update();
    else worldController.update(now, elapsedMs);
    animationFrame = ownerWindow.requestAnimationFrame(update);
  };
  animationFrame = ownerWindow.requestAnimationFrame(update);

  const runtime: PokeLoungeGameRuntime = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ownerWindow.cancelAnimationFrame(animationFrame);
      battleController.stop();
      worldController.shutdown();
      keyboard.destroy();
      stopAllPokeLoungeAudio();
      unsubscribeGameResult();
      multiplayerRoom.dispose();
      delete parent.dataset.pokeLoungeResourceStatus;
    },
    resize(nextViewportSize) {
      viewportSize = normalizeViewportSize(nextViewportSize);
      worldController.resize(viewportSize);
    },
  };

  return runtime;
}

function normalizeViewportSize(
  viewportSize: GameViewportDisplaySize = { width: 512, height: 384 },
): GameViewportDisplaySize {
  return {
    width: Math.max(1, Math.round(viewportSize.width)),
    height: Math.max(1, Math.round(viewportSize.height)),
  };
}

function toWorldSceneCreateData(value: unknown): WorldSceneCreateData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WorldSceneCreateData)
    : {};
}

function subscribeToFinalGameResult(
  gameStateStore: GameStateStore,
  onGameResult?: (result: PokeLoungeGameResult) => void,
): () => void {
  if (!onGameResult) {
    return function callback() {};
  }

  let reported = gameStateStore.getState().round.phase === "game-result";

  return gameStateStore.subscribe(function callback(state) {
    if (reported || state.round.phase !== "game-result") {
      return;
    }

    reported = true;
    const playerId = state.currentPlayerId;
    const rawScore =
      state.tournament.scoresByPlayerId[playerId] ??
      state.playersById[playerId]?.competitive.score ??
      0;
    const score = Number.isFinite(rawScore) ? Math.max(0, rawScore) : 0;

    onGameResult({ playerId, score });
  });
}

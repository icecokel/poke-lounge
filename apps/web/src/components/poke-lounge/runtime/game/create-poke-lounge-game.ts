import {
  getPokeLoungeAudioPlaybackSnapshotForTest,
  registerPreloadedPokeLoungeAudio,
  stopAllPokeLoungeAudio,
} from "./audio/poke-lounge-audio";
import type { PokeLoungeRuntimeAssets } from "./assets/poke-lounge-runtime-assets";
import type { GameViewportDisplaySize } from "./game-viewport";
import type { InitialGameScene } from "./game-startup";
import { BattleController } from "./scenes/battle-scene";
import { WorldController, type WorldSceneCreateData } from "./scenes/world-scene";
import { createLocalPreviewRoom, type MultiplayerRoom } from "./network/local-preview-room";
import { getServerRoomTransportDiagnosticsForE2e } from "./network/server-room";
import { getDefaultGameStateStore } from "./state/default-game-state-store";
import type { GameStateStore } from "./state/game-state-store";
import { isDevelopmentRuntime } from "../runtime-environment";
import { pressVirtualGamepadButton, releaseVirtualGamepadButton } from "./input/virtual-gamepad";
import type {
  BattleE2eScenario,
  BattleE2eSnapshot,
  PokeLoungeE2eController,
} from "./testing/poke-lounge-e2e-controller";
import type { RoomLobbyRuntimeState } from "./ui/room-lobby-screen";
import type { WorldFrameStore } from "./world/world-frame-store";
import type { WorldMapModel } from "./world/world-map-model";
import type { WorldRuntime } from "./world/world-runtime";
import type { WorldUiStore } from "./world/world-ui-store";
import type { BattleUiStore } from "./battle/battle-ui-store";
import { RuntimeKeyboard } from "./runtime-input";

declare global {
  interface Window {
    __POKE_LOUNGE_E2E__?: PokeLoungeE2eController;
  }
}

export interface PokeLoungeGameResult {
  playerId: string;
  score: number;
}

export interface PokeLoungeGameOptions {
  runtimeAssets: PokeLoungeRuntimeAssets;
  initialScene?: InitialGameScene;
  battleE2eScenario?: BattleE2eScenario | null;
  battleUiStore: BattleUiStore;
  competitiveRoundsEnabled?: boolean;
  gameStateStore?: GameStateStore;
  multiplayerRoom?: MultiplayerRoom;
  onGameResult?: (result: PokeLoungeGameResult) => void;
  onRoomLobbyStateChange?: (state: RoomLobbyRuntimeState | null) => void;
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
    battleController.start(
      options.battleE2eScenario ? { e2eScenario: options.battleE2eScenario } : {},
    );
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
      delete window.__POKE_LOUNGE_E2E__;
    },
    resize(nextViewportSize) {
      viewportSize = normalizeViewportSize(nextViewportSize);
      worldController.resize(viewportSize);
    },
  };

  if (shouldExposePokeLoungeE2eGlobals()) {
    window.__POKE_LOUNGE_E2E__ = createPokeLoungeE2eController(
      parent,
      function callback() {
        return activeScene;
      },
      battleController,
      worldController,
      gameStateStore,
      multiplayerRoom,
      function callback() {
        return viewportSize;
      },
    );
  }

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

function shouldExposePokeLoungeE2eGlobals(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (isDevelopmentRuntime()) {
    return true;
  }

  const { hostname, search } = window.location;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";

  return isLocalHost && new URLSearchParams(search).has("e2eBattle");
}

function hasPokeLoungeE2eQuery(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("e2e");
}

function createPokeLoungeE2eController(
  parent: HTMLElement,
  getActiveScene: () => InitialGameScene,
  battleController: BattleController,
  worldController: WorldController,
  gameStateStore: GameStateStore,
  multiplayerRoom: MultiplayerRoom,
  getViewportSize: () => GameViewportDisplaySize,
): PokeLoungeE2eController {
  const getBattleScene = () => battleController;

  const getBattleSnapshot = (): BattleE2eSnapshot | null =>
    getBattleScene()?.getE2eSnapshotForTest() ?? null;
  const getWorldScene = () => worldController;

  return {
    getActiveSceneKey() {
      return getActiveScene();
    },
    getAudioPlaybackSnapshot() {
      return getPokeLoungeAudioPlaybackSnapshotForTest();
    },
    getBattleSnapshot,
    setBattleScenario(scenario) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.setBattleScenarioForTest(scenario);
      return battleScene.getE2eSnapshotForTest();
    },
    setBattleCommand(command) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.setSelectedCommandForTest(command);
      return battleScene.getE2eSnapshotForTest();
    },
    setBattleMoveIndex(index) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.setSelectedMoveIndexForTest(index);
      return battleScene.getE2eSnapshotForTest();
    },
    setBattleBagItemIndex(index) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.setSelectedBagItemIndexForTest(index);
      return battleScene.getE2eSnapshotForTest();
    },
    setBattlePartySlotIndex(index) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.setSelectedPartySlotIndexForTest(index);
      return battleScene.getE2eSnapshotForTest();
    },
    confirmBattle() {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      battleScene.confirmSelectionForTest();
      return battleScene.getE2eSnapshotForTest();
    },
    drainBattleMessages(maxMessages = 20) {
      const battleScene = getBattleScene();

      if (!battleScene) {
        return null;
      }

      let snapshot = battleScene.getE2eSnapshotForTest();
      let remaining = Math.max(0, Math.floor(maxMessages));

      while (snapshot.message && remaining > 0) {
        battleScene.confirmSelectionForTest();
        snapshot = battleScene.getE2eSnapshotForTest();
        remaining -= 1;
      }

      return snapshot;
    },
    getWorldSnapshot() {
      return getWorldScene()?.getE2eSnapshotForTest() ?? null;
    },
    healAtNurseForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.healAtNurseForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    startWildBattleForTest(input) {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.startWildBattleForTest(input);
      return worldScene.getE2eSnapshotForTest();
    },
    startSoloChallengeForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.startSoloChallengeForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    closeWorldShortcutGuide() {
      getWorldScene()?.closeShortcutGuideForTest();
    },
    openWorldSurfaceForTest(surface) {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      if (surface === "shop") {
        worldScene.openShopForTest();
      } else if (surface === "pc") {
        worldScene.openPcBoxForTest();
      } else {
        worldScene.openDiceGambleForTest();
      }

      return worldScene.getE2eSnapshotForTest();
    },
    setWorldPlayerPositionForTest(position) {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.setPlayerPositionForTest(position);
      return worldScene.getE2eSnapshotForTest();
    },
    setCurrentLocalPlayerForTest(player) {
      gameStateStore.upsertLocalPlayer(player);
    },
    sendCurrentPlayerChangedMapForTest(overrides) {
      return getWorldScene()?.sendCurrentPlayerChangedMapForTest(overrides) ?? false;
    },
    disposeRoomForTest() {
      getWorldScene()?.disposeRoomForTest();
    },
    reconnectRoomForTest() {
      return getWorldScene()?.reconnectRoomForTest() ?? false;
    },
    beginWorldBattleLaunchTracking() {
      getWorldScene()?.beginBattleLaunchTrackingForTest();
    },
    getWorldBattleLaunches() {
      return getWorldScene()?.getBattleLaunchesForTest() ?? [];
    },
    openPcBoxForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.openPcBoxForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    movePcBoxSelectionForTest(delta) {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.movePcBoxSelectionForTest(delta);
      return worldScene.getE2eSnapshotForTest();
    },
    togglePcBoxFocusForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.togglePcBoxFocusForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    confirmPcBoxSelectionForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.confirmPcBoxSelectionForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    closePcBoxForTest() {
      const worldScene = getWorldScene();

      if (!worldScene) {
        return null;
      }

      worldScene.closePcBoxForTest();
      return worldScene.getE2eSnapshotForTest();
    },
    pressVirtualGamepad(button) {
      pressVirtualGamepadButton(button);
    },
    releaseVirtualGamepad(button) {
      releaseVirtualGamepadButton(button);
    },
    getGameSurfaceSnapshot() {
      if (parent.dataset.pokeLoungeResourceStatus !== "ready") {
        return null;
      }
      const viewport = getViewportSize();
      const bounds = parent.getBoundingClientRect();
      return {
        width: viewport.width,
        height: viewport.height,
        clientWidth: Math.round(bounds.width),
        clientHeight: Math.round(bounds.height),
      };
    },
    getGameStateSnapshot() {
      return structuredClone(gameStateStore.getState());
    },
    getRoomSnapshot() {
      return {
        roomId: multiplayerRoom?.roomId ?? gameStateStore.getState().session.roomId,
        sessionId: multiplayerRoom?.sessionId ?? gameStateStore.getState().session.sessionId,
      };
    },
    ...(hasPokeLoungeE2eQuery()
      ? {
          getRoomTransportDiagnostics() {
            return getServerRoomTransportDiagnosticsForE2e(multiplayerRoom);
          },
        }
      : {}),
    completeTournamentForTest() {
      const state = gameStateStore.getState();
      const playerId = state.currentPlayerId;

      gameStateStore.applyTournamentCompletedFromRoom(
        {
          roundIndex: state.round.totalRounds,
          championPlayerId: playerId,
          standings: [
            { playerId, rank: 1, score: 300 },
            { playerId: "player-2", rank: 2, score: 0 },
          ],
        },
        Date.now(),
      );
    },
  };
}

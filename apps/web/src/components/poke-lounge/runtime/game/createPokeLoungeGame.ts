import * as Phaser from "phaser";
import {
  getPokeLoungeAudioPlaybackSnapshotForTest,
  stopAllPokeLoungeAudio,
  type PokeLoungeAudioPlaybackSnapshot,
} from "./audio/poke-lounge-audio";
import { resolveGameCanvasSize, type GameViewportDisplaySize } from "./gameViewport";
import type { InitialGameScene } from "./gameStartup";
import { BootScene } from "./scenes/BootScene";
import { BattleScene, type BattleE2eScenario, type BattleE2eSnapshot } from "./scenes/BattleScene";
import { WorldScene, type WorldE2eSnapshot } from "./scenes/WorldScene";
import type { WildBattleStartInput } from "./scenes/world-scene-encounters";
import type { MultiplayerRoom } from "./network/localPreviewRoom";
import {
  getServerRoomTransportDiagnosticsForE2e,
  type ServerRoomTransportDiagnostics,
} from "./network/serverRoom";
import { getDefaultGameStateStore } from "./state/defaultGameStateStore";
import type { GameState, GameStateStore, LocalPlayerState } from "./state/gameStateStore";
import { isDevelopmentRuntime } from "../runtimeEnvironment";
import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  type VirtualGamepadButton,
} from "./input/virtualGamepad";

declare global {
  interface Window {
    __POKE_LOUNGE_GAME__?: Phaser.Game;
    __POKE_LOUNGE_E2E__?: PokeLoungeE2eController;
  }
}

export interface PokeLoungeE2eController {
  getActiveSceneKey(): string | null;
  getAudioPlaybackSnapshot(): PokeLoungeAudioPlaybackSnapshot;
  getBattleSnapshot(): BattleE2eSnapshot | null;
  setBattleScenario(scenario: BattleE2eScenario): BattleE2eSnapshot | null;
  setBattleCommand(command: BattleE2eSnapshot["selectedCommand"]): BattleE2eSnapshot | null;
  setBattleMoveIndex(index: number): BattleE2eSnapshot | null;
  setBattleBagItemIndex(index: number): BattleE2eSnapshot | null;
  confirmBattle(): BattleE2eSnapshot | null;
  drainBattleMessages(maxMessages?: number): BattleE2eSnapshot | null;
  getWorldSnapshot(): WorldE2eSnapshot | null;
  healAtNurseForTest(): WorldE2eSnapshot | null;
  startWildBattleForTest(input: WildBattleStartInput): WorldE2eSnapshot | null;
  startSoloChallengeForTest(): WorldE2eSnapshot | null;
  closeWorldShortcutGuide(): void;
  setCurrentLocalPlayerForTest(player: LocalPlayerState): void;
  openPcBoxForTest(): WorldE2eSnapshot | null;
  movePcBoxSelectionForTest(delta: number): WorldE2eSnapshot | null;
  togglePcBoxFocusForTest(): WorldE2eSnapshot | null;
  confirmPcBoxSelectionForTest(): WorldE2eSnapshot | null;
  closePcBoxForTest(): WorldE2eSnapshot | null;
  pressVirtualGamepad(button: VirtualGamepadButton): void;
  releaseVirtualGamepad(button: VirtualGamepadButton): void;
  getCanvasSnapshot(): {
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  } | null;
  getGameStateSnapshot(): GameState;
  getRoomSnapshot(): {
    roomId: string | null;
    sessionId: string | null;
  };
  getRoomTransportDiagnostics?(): ServerRoomTransportDiagnostics | null;
  completeTournamentForTest(): void;
}

export interface PokeLoungeGameResult {
  playerId: string;
  score: number;
}

export interface PokeLoungeGameOptions {
  initialScene?: InitialGameScene;
  battleE2eScenario?: BattleE2eScenario | null;
  competitiveRoundsEnabled?: boolean;
  gameStateStore?: GameStateStore;
  multiplayerRoom?: MultiplayerRoom;
  onGameResult?: (result: PokeLoungeGameResult) => void;
  serverAuthoritativeRounds?: boolean;
  viewportSize?: GameViewportDisplaySize;
}

export function createPokeLoungeGame(
  parent: HTMLElement,
  options: PokeLoungeGameOptions = {},
): Phaser.Game {
  const gameStateStore = options.gameStateStore ?? getDefaultGameStateStore();
  const canvasSize = resolveGameCanvasSize(options.viewportSize);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: canvasSize.width,
    height: canvasSize.height,
    backgroundColor: "#4A4242",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
      },
    },
    scene: [
      new BootScene(options.initialScene ?? "world", options.battleE2eScenario ?? null),
      new WorldScene(gameStateStore, options.multiplayerRoom, {
        competitiveRoundsEnabled: options.competitiveRoundsEnabled,
        serverAuthoritativeRounds: options.serverAuthoritativeRounds,
      }),
      new BattleScene(gameStateStore, options.multiplayerRoom),
    ],
  });
  const unsubscribeGameResult = subscribeToFinalGameResult(gameStateStore, options.onGameResult);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    stopAllPokeLoungeAudio();
    unsubscribeGameResult();
    options.multiplayerRoom?.dispose();
  });

  if (shouldExposePokeLoungeE2eGlobals()) {
    window.__POKE_LOUNGE_GAME__ = game;
    window.__POKE_LOUNGE_E2E__ = createPokeLoungeE2eController(
      game,
      gameStateStore,
      options.multiplayerRoom,
    );
  }

  return game;
}

function subscribeToFinalGameResult(
  gameStateStore: GameStateStore,
  onGameResult?: (result: PokeLoungeGameResult) => void,
): () => void {
  if (!onGameResult) {
    return () => {};
  }

  let reported = gameStateStore.getState().round.phase === "game-result";

  return gameStateStore.subscribe(state => {
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
  game: Phaser.Game,
  gameStateStore: GameStateStore,
  multiplayerRoom?: MultiplayerRoom,
): PokeLoungeE2eController {
  const getBattleScene = (): BattleScene | null => {
    const sceneManager = getSceneManager(game);
    const scene = sceneManager?.getScene("battle");

    return scene instanceof BattleScene ? scene : null;
  };

  const getBattleSnapshot = (): BattleE2eSnapshot | null =>
    getBattleScene()?.getE2eSnapshotForTest() ?? null;
  const getWorldScene = (): WorldScene | null => {
    const sceneManager = getSceneManager(game);
    const scene = sceneManager?.getScene("world");

    return scene instanceof WorldScene ? scene : null;
  };

  return {
    getActiveSceneKey() {
      const sceneManager = getSceneManager(game);
      const activeScene = sceneManager?.getScenes(true)[0];

      return activeScene?.scene.key ?? null;
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
    setCurrentLocalPlayerForTest(player) {
      gameStateStore.upsertLocalPlayer(player);
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
    getCanvasSnapshot() {
      const canvas = (game as Phaser.Game & { canvas?: HTMLCanvasElement }).canvas;

      if (!canvas) {
        return null;
      }

      return {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
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

function getSceneManager(game: Phaser.Game): Phaser.Scenes.SceneManager | null {
  const sceneManager = (
    game as Phaser.Game & {
      scene?: Phaser.Scenes.SceneManager;
    }
  ).scene;

  return sceneManager && typeof sceneManager.getScene === "function" ? sceneManager : null;
}

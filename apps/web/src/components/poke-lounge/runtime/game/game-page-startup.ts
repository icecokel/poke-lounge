import { createStarterPlayerPokemon } from "@/features/poke-lounge/domain/player/create-starter-pokemon";
import { reportClientDiagnostic } from "@/lib/client-diagnostics";
import { getPokeLoungeCopyForUrl } from "../../poke-lounge-copy";
import {
  ASSET_ERROR_CODES,
  ROOM_ERROR_CODES,
  STARTUP_ERROR_CODES,
  type PokeLoungeErrorCode,
} from "../../poke-lounge-error-codes";
import { loadBootstrapData } from "../bootstrap";
import { RequiredGameAssetError } from "../required-game-asset-error";
import type { GameBootstrapData } from "../types";
import {
  loadPokeLoungeRuntimeAssets,
  type PokeLoungeRuntimeAssets,
} from "./assets/poke-lounge-runtime-assets";
import {
  bindPokeLoungeAudioPrimeListeners,
  stopAllPokeLoungeAudio,
} from "./audio/poke-lounge-audio";
import { createBattleUiStore } from "./battle/battle-ui-store";
import { createPokeLoungeGame, type PokeLoungeGameResult } from "./create-poke-lounge-game";
import { loadRuntimeGameDataJson, type RuntimeGameDataJson } from "./data/game-data-json";
import type { PokeLoungeGameplayRuntimeState, PokeLoungeRuntimeState } from "./game-page-state";
import { readInitialGameScene } from "./game-startup";
import type { GameViewportDisplaySize } from "./game-viewport";
import { virtualGamepadController } from "./input/virtual-gamepad";
import {
  LOCAL_TEST_MODE_START_QUERY_PARAM,
  activateLocalTestMode,
  createLocalTestModeSoloUrl,
  createLocalTestModeStartUrl,
  deactivateLocalTestMode,
  loadLocalTestModeState,
  resolveLocalTestModeState,
  type LocalTestModeState,
} from "./local-test-mode";
import { createMultiplayerRoom } from "./network/multiplayer-room-factory";
import {
  applyRoomRoundDurationSearchParam,
  isSupportedRoomEntryQueryVersion,
  readRoomEntryFromLocation,
  readRoomRoundDurationMs,
  ROOM_ENTRY_QUERY_VERSION,
  ROOM_ENTRY_QUERY_VERSION_PARAM,
  type RoomEntryMode,
} from "./network/room-entry";
import { shouldResetRoomEntrySession, type RoomEntrySelection } from "./network/room-entry-screen";
import {
  POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT,
  POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT,
  clearStoredServerRoomResume,
  consumeLegacyServerRoomIdentity,
  readStoredServerRoomResume,
  type PokeLoungeServerRoomErrorDetail,
  type PokeLoungeFreshSessionRequiredDetail,
} from "./network/server-room";
import { createWebRtcRoom, isWebRtcRoom } from "./network/web-rtc-room";
import { createRoomRunId } from "./room-run-id";
import { getServerRoomErrorMessage } from "./server-room-error-copy";
import {
  getDefaultGameStateStore,
  setDefaultGameStateRoomRunId,
} from "./state/default-game-state-store";
import type { GameStateStore } from "./state/game-state-store";
import { setBattleSceneMarker } from "./ui/active-game-scene-marker";
import {
  dispatchPokeLoungeNotice,
  type PokeLoungeRoomLeaveRequestDetail,
} from "./ui/poke-lounge-ui-events";
import { createWorldFrameStore } from "./world/world-frame-store";
import { createWorldMapModel, createWorldPlayerAtlasModel } from "./world/world-map-model";
import { createWorldRuntime } from "./world/world-runtime";
import { createWorldUiStore } from "./world/world-ui-store";
export { createStarterPlayerPokemon } from "@/features/poke-lounge/domain/player/create-starter-pokemon";

type GamePageLocation = URL;
type PokeLoungeGameInstance = ReturnType<typeof createPokeLoungeGame>;

export interface GamePageHandle {
  destroy(): void;
  requestRoomLeave(): boolean;
  setViewportSize(viewportSize: GameViewportDisplaySize): void;
}

export interface StartGamePageDependencies {
  accountId?: string;
  activateLocalTestMode?: typeof activateLocalTestMode;
  createMultiplayerRoom?: typeof createMultiplayerRoom;
  createPokeLoungeGame?: typeof createPokeLoungeGame;
  deactivateLocalTestMode?: typeof deactivateLocalTestMode;
  gameStateStore?: GameStateStore;
  idToken?: string;
  localTestModeActive?: boolean;
  getIdToken?: () => string | undefined;
  loadBootstrapData?: () => Promise<GameBootstrapData>;
  loadPokeLoungeRuntimeAssets?: typeof loadPokeLoungeRuntimeAssets;
  loadLocalTestModeState?: typeof loadLocalTestModeState;
  onGameResult?: (result: PokeLoungeGameResult) => void;
  onRoomLeaveRequest?: (request: PokeLoungeRoomLeaveRequestDetail) => void;
  onRuntimeStateChange?: (state: PokeLoungeRuntimeState) => void;
  viewportSize?: GameViewportDisplaySize;
}

function reportGameStartupFailure(
  error: unknown,
  stage: "GAME_START_FAILED" | "STARTER_DATA_FAILED",
): PokeLoungeErrorCode {
  const originalError = error instanceof GameStartupStepError ? error.originalError : error;
  const assetError = originalError instanceof RequiredGameAssetError ? originalError : null;
  const userCode = assetError
    ? ASSET_ERROR_CODES[assetError.reason]
    : stage === "STARTER_DATA_FAILED"
      ? STARTUP_ERROR_CODES.STARTER_DATA
      : STARTUP_ERROR_CODES.GAME_START;
  reportClientDiagnostic({
    kind: "runtime",
    code: assetError
      ? `GAME_ASSET_${assetError.reason}${assetError.status ? `_${assetError.status}` : ""}`
      : stage,
    errorName: originalError instanceof Error ? originalError.name : "UnknownError",
    error: originalError,
    startupStep: error instanceof GameStartupStepError ? error.step : undefined,
    resourcePath: assetError?.resourcePath,
    userCode,
  });
  return userCode;
}

type GameStartupStep =
  | "runtime_data"
  | "runtime_assets"
  | "room_creation"
  | "world_model"
  | "player_atlas"
  | "game_construction";

class GameStartupStepError extends Error {
  constructor(
    readonly step: GameStartupStep,
    readonly originalError: unknown,
  ) {
    super(`Game startup failed during ${step}`);
    this.name = "GameStartupStepError";
  }
}

function withStartupStep<T>(step: GameStartupStep, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw new GameStartupStepError(step, error);
  }
}

export async function startGamePage(
  mount: HTMLElement,
  location: GamePageLocation,
  dependencies: StartGamePageDependencies = {},
): Promise<GamePageHandle> {
  const usesDefaultGameStateStore = dependencies.gameStateStore === undefined;
  const gameStateStore = dependencies.gameStateStore ?? getDefaultGameStateStore();
  const initialScene = readInitialGameScene();
  const currentUrl = new URL(location.href);
  const copy = getPokeLoungeCopyForUrl(currentUrl);
  const activateTestMode = dependencies.activateLocalTestMode ?? activateLocalTestMode;
  const deactivateTestMode = dependencies.deactivateLocalTestMode ?? deactivateLocalTestMode;
  const loadTestModeState = dependencies.loadLocalTestModeState ?? loadLocalTestModeState;
  const emitRuntimeState = dependencies.onRuntimeStateChange ?? function callback() {};
  let runtimeGameDataPromise: Promise<RuntimeGameDataJson> | null = null;
  let runtimeAssetsPromise: Promise<PokeLoungeRuntimeAssets> | null = null;
  let runtimeAssetsAbortController: AbortController | null = null;
  let runtimeAssetsLoadRequestId = 0;
  let activeGame: PokeLoungeGameInstance | null = null;
  let activeMultiplayerRoom: ReturnType<typeof createMultiplayerRoom> | null = null;
  let requestRoomLeaveAction: (() => void) | null = null;
  let temporaryRoomCode: string | undefined;
  let activeRoomRunId: string | null = null;
  let resumingStoredRoom = false;
  let activeViewportSize = dependencies.viewportSize;
  let localTestModeState: LocalTestModeState = { available: false, active: false };
  let destroyed = false;
  let roomEntrySelectionPending = false;
  let starterSelectionRequestId = 0;
  let removeFreshSessionListener: (() => void) | null = null;
  let removeServerRoomErrorListener: (() => void) | null = null;
  let removeServerRoomStatusListener: (() => void) | null = null;
  let removeAudioPrimeListeners: (() => void) | null = bindPokeLoungeAudioPrimeListeners(mount);

  const loadRuntimeGameData = async () => {
    runtimeGameDataPromise ??= loadRuntimeGameDataJson();

    try {
      return await runtimeGameDataPromise;
    } catch (error) {
      runtimeGameDataPromise = null;
      throw new GameStartupStepError("runtime_data", error);
    }
  };

  const loadRuntimeAssets = async () => {
    if (!runtimeAssetsPromise) {
      const runtimeGameData = await loadRuntimeGameData();
      const requestId = (runtimeAssetsLoadRequestId += 1);
      runtimeAssetsAbortController = new AbortController();
      runtimeAssetsPromise = (
        dependencies.loadPokeLoungeRuntimeAssets ?? loadPokeLoungeRuntimeAssets
      )({
        runtimeGameData,
        onProgress: progress => {
          if (!destroyed && requestId === runtimeAssetsLoadRequestId) {
            emitRuntimeState({ phase: "loading", progress });
          }
        },
        signal: runtimeAssetsAbortController.signal,
      });
    }

    try {
      return await runtimeAssetsPromise;
    } catch (error) {
      runtimeAssetsLoadRequestId += 1;
      runtimeAssetsAbortController?.abort();
      runtimeAssetsPromise = null;
      runtimeAssetsAbortController = null;
      throw new GameStartupStepError("runtime_assets", error);
    }
  };

  const activateRoomRun = (roomRunId: string) => {
    activeRoomRunId = roomRunId;
    if (!usesDefaultGameStateStore) {
      return;
    }

    setDefaultGameStateRoomRunId(roomRunId);
    gameStateStore.reloadLocalPlayersFromStorage();
  };
  const restoreOwnerGameState = (clearRoomRun: boolean) => {
    if (!activeRoomRunId) {
      return;
    }

    if (usesDefaultGameStateStore) {
      if (clearRoomRun) {
        gameStateStore.reset();
      }
      setDefaultGameStateRoomRunId(null);
      gameStateStore.reloadLocalPlayersFromStorage();
    }
    activeRoomRunId = null;
  };

  const handle: GamePageHandle = {
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      runtimeAssetsAbortController?.abort();
      runtimeAssetsAbortController = null;
      stopAllPokeLoungeAudio();
      removeAudioPrimeListeners?.();
      removeAudioPrimeListeners = null;
      removeFreshSessionListener?.();
      removeFreshSessionListener = null;
      removeServerRoomErrorListener?.();
      removeServerRoomErrorListener = null;
      removeServerRoomStatusListener?.();
      removeServerRoomStatusListener = null;
      if (activeGame) {
        activeGame.destroy();
      } else {
        activeMultiplayerRoom?.dispose();
      }
      activeGame = null;
      activeMultiplayerRoom = null;
      requestRoomLeaveAction = null;
      gameStateStore.setSession({
        sessionId: null,
        roomId: null,
        connectionStatus: "offline",
      });
      delete mount.dataset.pokeLoungeResourceStatus;
    },
    requestRoomLeave() {
      if (!requestRoomLeaveAction) {
        return false;
      }

      requestRoomLeaveAction();
      return true;
    },
    setViewportSize(nextViewportSize: GameViewportDisplaySize) {
      activeViewportSize = nextViewportSize;
      if (!activeGame) {
        return;
      }

      activeGame.resize(activeViewportSize);
    },
  };

  const startGame = async (gameUrl: URL) => {
    mount.dataset.pokeLoungeResourceStatus = "loading";
    emitRuntimeState({ phase: "loading", progress: { loaded: 0, total: 1, ratio: 0 } });
    const runtimeAssets = await loadRuntimeAssets();
    if (destroyed) {
      return;
    }

    const roomEntry = readRoomEntryFromLocation(gameUrl);
    const multiplayerRoom = withStartupStep("room_creation", () =>
      (dependencies.createMultiplayerRoom ?? createMultiplayerRoom)({
        accountId: resumingStoredRoom || !temporaryRoomCode ? dependencies.accountId : undefined,
        createWebRtcRoom,
        idToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.idToken : undefined,
        getIdToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.getIdToken : undefined,
        roomId: temporaryRoomCode,
        roomRunId: activeRoomRunId ?? undefined,
        persistRoomCodeInUrl: temporaryRoomCode ? false : undefined,
        resumeRoom: resumingStoredRoom,
        sharedWorldOnly: Boolean(temporaryRoomCode),
        competitiveRoundsEnabled: isCompetitiveRoomEntryMode(roomEntry.mode),
        searchParams: gameUrl.searchParams,
      }),
    );
    const competitiveRoundsEnabled = isCompetitiveRoomEntryMode(roomEntry.mode);
    const worldFrameStore = createWorldFrameStore();
    const worldModel = withStartupStep("world_model", () =>
      createWorldMapModel(runtimeAssets.tilemap),
    );
    const worldRuntime = createWorldRuntime(worldModel, worldFrameStore);
    const worldUiStore = createWorldUiStore();
    const battleUiStore = createBattleUiStore();
    const battle = { uiStore: battleUiStore };
    const world = {
      atlas: withStartupStep("player_atlas", () =>
        createWorldPlayerAtlasModel(runtimeAssets.playerAtlas.data),
      ),
      competitiveRoundsEnabled,
      ...(multiplayerRoom.setPreparationReady
        ? {
            onPreparationReady: (roundIndex: number) =>
              multiplayerRoom.setPreparationReady!(roundIndex),
          }
        : {}),
      frameStore: worldFrameStore,
      gameStateStore,
      input: virtualGamepadController,
      model: worldModel,
      uiStore: worldUiStore,
    };
    activeMultiplayerRoom = multiplayerRoom;
    setBattleSceneMarker(mount, false);
    mount.dataset.pokeLoungeResourceStatus = "loading";
    let gameplayState: PokeLoungeGameplayRuntimeState = { battle, phase: initialScene, world };
    let starterState: PokeLoungeRuntimeState | null = null;
    function emitCurrentGameplayState(): void {
      if (!destroyed && activeMultiplayerRoom === multiplayerRoom) {
        emitRuntimeState(starterState ?? gameplayState);
      }
    }
    function requestInGameStarterSelection(onComplete: () => void): void {
      void showStarterSelection(
        function finishInGameStarterSelection() {
          if (destroyed || activeMultiplayerRoom !== multiplayerRoom) return;
          starterState = null;
          onComplete();
          emitCurrentGameplayState();
        },
        function publishInGameStarterSelection(state) {
          if (destroyed || activeMultiplayerRoom !== multiplayerRoom) return;
          starterState = state;
          emitCurrentGameplayState();
        },
      ).catch(function handleStarterLoadError(error) {
        if (destroyed || activeMultiplayerRoom !== multiplayerRoom) return;
        const errorCode = reportGameStartupFailure(error, "STARTER_DATA_FAILED");
        starterState = {
          phase: "error",
          description: copy.startup.description,
          errorCode,
          onRetry: function retryStarterSelection() {
            requestInGameStarterSelection(onComplete);
          },
          onReturnToEntry: function leaveAfterStarterError() {
            leaveAndReturnToRoomEntry();
          },
        };
        emitCurrentGameplayState();
      });
    }
    const game = withStartupStep("game_construction", () =>
      (dependencies.createPokeLoungeGame ?? createPokeLoungeGame)(mount, {
        competitiveRoundsEnabled,
        gameStateStore,
        initialScene,
        multiplayerRoom,
        onGameResult: roomEntry.mode === "server-room" ? undefined : dependencies.onGameResult,
        onStarterSelectionRequested: requestInGameStarterSelection,
        onRoomLobbyStateChange: lobby => {
          if (destroyed) {
            return;
          }
          const controls = {
            battle,
            ...(gameplayState.roomLeave ? { roomLeave: gameplayState.roomLeave } : {}),
            ...(gameplayState.webRtc ? { webRtc: gameplayState.webRtc } : {}),
            world,
          };
          gameplayState = lobby
            ? { ...controls, ...lobby, phase: "lobby" }
            : { ...controls, phase: "world" };
          emitCurrentGameplayState();
        },
        serverAuthoritativeRounds: roomEntry.mode === "server-room",
        battleUiStore,
        runtimeAssets,
        viewportSize: activeViewportSize,
        worldFrameStore,
        worldModel,
        worldRuntime,
        worldUiStore,
      }),
    );
    activeGame = game;
    const returnToRoomEntry = (preserveDisplayName?: string) => {
      starterSelectionRequestId += 1;
      starterState = null;
      removeFreshSessionListener?.();
      removeFreshSessionListener = null;
      removeServerRoomErrorListener?.();
      removeServerRoomErrorListener = null;
      removeServerRoomStatusListener?.();
      removeServerRoomStatusListener = null;
      multiplayerRoom.dispose();
      gameStateStore.setSession({
        sessionId: null,
        roomId: null,
        connectionStatus: "offline",
      });
      temporaryRoomCode = undefined;
      resumingStoredRoom = false;
      restoreOwnerGameState(true);
      if (preserveDisplayName) {
        const localPlayer = gameStateStore.getCurrentLocalPlayer();
        gameStateStore.upsertLocalPlayer({
          ...localPlayer,
          displayName: preserveDisplayName,
        });
      }
      clearRoomEntrySearchParams(currentUrl);
      replaceBrowserUrl(currentUrl);
      game?.destroy();
      if (activeGame === game) {
        activeGame = null;
      }
      if (activeMultiplayerRoom === multiplayerRoom) {
        activeMultiplayerRoom = null;
      }
      requestRoomLeaveAction = null;
      showRoomEntry();
    };
    const leaveAndReturnToRoomEntry = () => {
      void (async function callback() {
        try {
          await multiplayerRoom.leave?.();
        } catch {
          dispatchPokeLoungeNotice(mount.ownerDocument, {
            message: copy.lobby.mutationFailed,
            tone: "error",
          });
          return;
        }

        returnToRoomEntry();
      })();
    };
    const handleFreshSessionRequired = (event: Event) => {
      const detail = (event as CustomEvent<PokeLoungeFreshSessionRequiredDetail>).detail;
      dispatchPokeLoungeNotice(mount.ownerDocument, {
        message:
          detail?.reason === "room-expired"
            ? getServerRoomErrorMessage(copy.locale, "ROOM_EXPIRED")
            : copy.roomEntry.freshSession,
        tone: "warning",
      });
      returnToRoomEntry();
    };
    window.addEventListener(POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT, handleFreshSessionRequired);
    removeFreshSessionListener = function callback() {
      window.removeEventListener(
        POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT,
        handleFreshSessionRequired,
      );
    };
    const handleServerRoomError = (event: Event) => {
      const detail = (event as CustomEvent<PokeLoungeServerRoomErrorDetail>).detail;
      const activeRoomEntry = readRoomEntryFromLocation(gameUrl);

      if (!detail || activeRoomEntry.mode !== "server-room") {
        return;
      }

      const shouldReturnPublicDirectory =
        activeRoomEntry.visibility === "public" &&
        activeRoomEntry.createRoom !== true &&
        !detail.recoverable &&
        (detail.code === "ROOM_FULL" || detail.code === "ROOM_JOIN_FAILED");

      if (shouldReturnPublicDirectory) {
        dispatchPokeLoungeNotice(mount.ownerDocument, {
          message: getServerRoomErrorMessage(copy.locale, detail.code),
          tone: "warning",
        });
        const displayName = gameStateStore.getCurrentLocalPlayer().displayName;
        clearStoredServerRoomResume(dependencies.accountId);
        returnToRoomEntry(displayName);
        return;
      }

      emitRuntimeState({
        phase: "error",
        description: getServerRoomErrorMessage(copy.locale, detail.code),
        errorCode: ROOM_ERROR_CODES[detail.code],
        ...(detail.recoverable && detail.retry
          ? {
              onRetry: () => {
                emitCurrentGameplayState();
                detail.retry?.();
              },
            }
          : {}),
        onReturnToEntry: detail.cancel,
      });
    };
    window.addEventListener(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, handleServerRoomError);
    removeServerRoomErrorListener = function callback() {
      window.removeEventListener(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, handleServerRoomError);
    };
    removeServerRoomStatusListener = multiplayerRoom.on(
      "CONNECTION_STATUS",
      function handleEvent({ connectionStatus }) {
        if (connectionStatus === "online") {
          emitCurrentGameplayState();
        }
      },
    );

    if (competitiveRoundsEnabled || temporaryRoomCode) {
      requestRoomLeaveAction = function callback() {
        const phase = gameStateStore.getState().round.phase;
        const request: PokeLoungeRoomLeaveRequestDetail = {
          ...(competitiveRoundsEnabled && phase === "tournament"
            ? {
                title: copy.roomEntry.leaveTournamentTitle,
                description: copy.roomEntry.leaveTournamentDescription,
              }
            : {
                title: copy.roomEntry.leaveRoomTitle,
                description: copy.roomEntry.leaveRoomDescription,
              }),
          confirm: leaveAndReturnToRoomEntry,
        };

        if (dependencies.onRoomLeaveRequest) {
          dependencies.onRoomLeaveRequest(request);
        } else {
          leaveAndReturnToRoomEntry();
        }
      };
      gameplayState = {
        ...gameplayState,
        roomLeave: {
          label: copy.roomEntry.leaveRoom,
          onRequest: requestRoomLeaveAction,
        },
      };
    }

    if (isWebRtcRoom(multiplayerRoom)) {
      gameplayState = {
        ...gameplayState,
        webRtc: {
          room: multiplayerRoom,
          onLeave: leaveAndReturnToRoomEntry,
        },
      };
    }
    emitCurrentGameplayState();
  };
  const showStartupError = (
    retry: () => void,
    error: unknown,
    stage: "GAME_START_FAILED" | "STARTER_DATA_FAILED",
  ) => {
    if (destroyed) {
      return;
    }

    const errorCode = reportGameStartupFailure(error, stage);

    roomEntrySelectionPending = false;
    if (activeGame) {
      activeGame.destroy();
    } else {
      activeMultiplayerRoom?.dispose();
    }
    activeGame = null;
    activeMultiplayerRoom = null;
    mount.dataset.pokeLoungeResourceStatus = "error";
    gameStateStore.setSession({
      sessionId: null,
      roomId: null,
      connectionStatus: "offline",
    });
    emitRuntimeState({
      phase: "error",
      description: copy.startup.description,
      errorCode,
      onRetry: retry,
      onReturnToEntry: () => {
        restoreOwnerGameState(true);
        clearRoomEntrySearchParams(currentUrl);
        replaceBrowserUrl(currentUrl);
        showRoomEntry();
      },
    });
  };
  const showStarterSelection = async (
    afterSelection: () => void,
    publish: (state: PokeLoungeRuntimeState) => void = emitRuntimeState,
  ) => {
    const requestId = (starterSelectionRequestId += 1);
    publish({ phase: "loading", progress: { loaded: 0, total: 1, ratio: 0 } });
    const [bootstrap] = await Promise.all([
      (dependencies.loadBootstrapData ?? loadBootstrapData)(),
      loadRuntimeGameData(),
    ]);
    if (destroyed || requestId !== starterSelectionRequestId) {
      return;
    }

    let completed = false;
    publish({
      phase: "starter",
      bootstrap,
      onSelect: starter => {
        if (destroyed || completed || requestId !== starterSelectionRequestId) {
          return;
        }

        completed = true;
        starterSelectionRequestId += 1;
        gameStateStore.setStarterPokemon(createStarterPlayerPokemon(starter));
        afterSelection();
      },
    });
  };
  const startGameAfterStarterSelection = (gameUrl: URL) => {
    // Joining a server room never requires choosing a starter. The authoritative
    // room-start projection opens the selection on the existing connection.
    if (
      readRoomEntryFromLocation(gameUrl).mode === "server-room" ||
      !gameStateStore.canChooseStarter()
    ) {
      void startGame(gameUrl).catch(function handleRejected(error) {
        showStartupError(
          function callback() {
            return startGameAfterStarterSelection(gameUrl);
          },
          error,
          "GAME_START_FAILED",
        );
      });
      return;
    }

    void showStarterSelection(function callback() {
      void startGame(gameUrl).catch(function handleRejected(error) {
        showStartupError(
          function callback() {
            return startGameAfterStarterSelection(gameUrl);
          },
          error,
          "GAME_START_FAILED",
        );
      });
    }).catch(function handleRejected(error) {
      showStartupError(
        function callback() {
          return startGameAfterStarterSelection(gameUrl);
        },
        error,
        "STARTER_DATA_FAILED",
      );
    });
  };
  const selectRoomEntry = (selection: RoomEntrySelection) => {
    if (destroyed || roomEntrySelectionPending) {
      return;
    }

    roomEntrySelectionPending = true;

    if (isCompetitiveRoomEntryMode(selection.mode)) {
      activateRoomRun(createRoomRunId());
    } else {
      restoreOwnerGameState(true);
    }

    if (selection.displayName) {
      const localPlayer = gameStateStore.getCurrentLocalPlayer();
      gameStateStore.upsertLocalPlayer({
        ...localPlayer,
        displayName: selection.displayName,
      });
    }

    temporaryRoomCode =
      selection.mode === "server-room" && selection.createRoom
        ? (selection.roomCode ?? undefined)
        : undefined;
    resumingStoredRoom = false;

    applyRoomEntrySelection(currentUrl, selection);
    replaceBrowserUrl(currentUrl);

    if (shouldResetRoomEntrySession(selection)) {
      gameStateStore.reset();
    }

    startGameAfterStarterSelection(currentUrl);
  };
  const showRoomEntry = () => {
    if (destroyed) {
      return;
    }

    roomEntrySelectionPending = false;
    emitRuntimeState({
      phase: "entry",
      screen: "room",
      currentUrl: new URL(currentUrl.href),
      localTestMode: localTestModeState.available
        ? {
            active: localTestModeState.active,
            onStart: () => {
              if (localTestModeState.active) {
                selectRoomEntry({
                  mode: "solo",
                  roomCode: null,
                  inviteUrl: null,
                });
                return;
              }

              if (destroyed || roomEntrySelectionPending) {
                return;
              }

              roomEntrySelectionPending = true;
              void activateTestMode(currentUrl)
                .then(function handleResolved() {
                  if (destroyed || typeof window === "undefined") {
                    return;
                  }

                  window.location.assign(createLocalTestModeStartUrl(currentUrl).href);
                })
                .catch(function handleRejected() {
                  if (destroyed) {
                    return;
                  }

                  showRoomEntry();
                  dispatchPokeLoungeNotice(mount.ownerDocument, {
                    message: copy.roomEntry.localTestRequestFailed,
                    tone: "warning",
                  });
                });
            },
            onExit: () => {
              if (destroyed || roomEntrySelectionPending) {
                return;
              }

              roomEntrySelectionPending = true;
              void deactivateTestMode(currentUrl)
                .then(function handleResolved() {
                  if (destroyed || typeof window === "undefined") {
                    return;
                  }

                  const exitUrl = new URL(currentUrl.href);
                  clearRoomEntrySearchParams(exitUrl);
                  exitUrl.searchParams.delete(LOCAL_TEST_MODE_START_QUERY_PARAM);
                  window.location.assign(exitUrl.href);
                })
                .catch(function handleRejected() {
                  if (destroyed) {
                    return;
                  }

                  showRoomEntry();
                  dispatchPokeLoungeNotice(mount.ownerDocument, {
                    message: copy.roomEntry.localTestRequestFailed,
                    tone: "warning",
                  });
                });
            },
          }
        : undefined,
      initialDisplayName: gameStateStore.getCurrentLocalPlayer().displayName,
      onSelect: selectRoomEntry,
    });
  };
  const continueToSelectedRoomOrEntry = () => {
    const localTestModeStartRequested =
      currentUrl.searchParams.get(LOCAL_TEST_MODE_START_QUERY_PARAM) === "1";
    if (localTestModeStartRequested) {
      const soloUrl = createLocalTestModeSoloUrl(currentUrl);
      currentUrl.search = soloUrl.search;
      replaceBrowserUrl(currentUrl);

      if (localTestModeState.active) {
        startGameAfterStarterSelection(currentUrl);
      } else {
        showRoomEntry();
      }
      return;
    }

    if (currentUrl.searchParams.has(LOCAL_TEST_MODE_START_QUERY_PARAM)) {
      currentUrl.searchParams.delete(LOCAL_TEST_MODE_START_QUERY_PARAM);
      replaceBrowserUrl(currentUrl);
    }

    if (consumeLegacyServerRoomIdentity(dependencies.accountId)) {
      dispatchPokeLoungeNotice(mount.ownerDocument, {
        message: copy.roomEntry.legacySessionExpired,
        tone: "warning",
      });
    }

    if (!isSupportedRoomEntryQueryVersion(currentUrl.searchParams)) {
      clearRoomEntrySearchParams(currentUrl);
      applyRoomRoundDurationSearchParam(currentUrl);
      replaceBrowserUrl(currentUrl);
    }

    const roomEntry = readRoomEntryFromLocation(currentUrl);
    const storedResume = readStoredServerRoomResume(dependencies.accountId);
    const canResumeStoredRoom =
      !localTestModeState.active &&
      storedResume !== null &&
      (roomEntry.mode === "unset" ||
        (roomEntry.mode === "server-room" &&
          roomEntry.createRoom !== true &&
          roomEntry.quickPlay !== true &&
          roomEntry.roomCode === storedResume.roomCode));

    if (canResumeStoredRoom && storedResume) {
      activateRoomRun(storedResume.runId);
      temporaryRoomCode = storedResume.roomCode;
      resumingStoredRoom = true;
      currentUrl.searchParams.set("network", "server");
      currentUrl.searchParams.set(ROOM_ENTRY_QUERY_VERSION_PARAM, ROOM_ENTRY_QUERY_VERSION);
      currentUrl.searchParams.delete("create");
      currentUrl.searchParams.delete("quick");
      currentUrl.searchParams.set("room", storedResume.roomCode);
      if (storedResume.roomInstanceId) {
        currentUrl.searchParams.set("roomInstance", storedResume.roomInstanceId);
      } else {
        currentUrl.searchParams.delete("roomInstance");
      }
      roomEntrySelectionPending = true;
      startGameAfterStarterSelection(currentUrl);
      return;
    }

    if (localTestModeState.active && isCompetitiveRoomEntryMode(roomEntry.mode)) {
      clearRoomEntrySearchParams(currentUrl);
      applyRoomRoundDurationSearchParam(currentUrl);
      replaceBrowserUrl(currentUrl);
      showRoomEntry();
      return;
    }

    if (roomEntry.mode === "server-room" && roomEntry.roomCode) {
      emitRuntimeState({
        phase: "entry",
        screen: "direct-multiplayer",
        currentUrl: new URL(currentUrl.href),
        initialDisplayName: gameStateStore.getCurrentLocalPlayer().displayName,
        onSubmit: displayName =>
          selectRoomEntry({
            mode: "server-room",
            roomCode: roomEntry.roomCode,
            inviteUrl: currentUrl.href,
            displayName,
            ...(roomEntry.roomInstanceId ? { roomInstanceId: roomEntry.roomInstanceId } : {}),
            ...(roomEntry.visibility ? { visibility: roomEntry.visibility } : {}),
            roundDurationMs: readRoomRoundDurationMs(currentUrl.searchParams) ?? undefined,
          }),
      });
      return;
    }

    if (roomEntry.mode === "server-room") {
      clearRoomEntrySearchParams(currentUrl);
      replaceBrowserUrl(currentUrl);
      showRoomEntry();
      return;
    }

    if (isCompetitiveRoomEntryMode(roomEntry.mode)) {
      activateRoomRun(createRoomRunId());
      startGameAfterStarterSelection(currentUrl);
      return;
    }

    showRoomEntry();
  };

  localTestModeState = resolveLocalTestModeState(
    await loadTestModeState(currentUrl),
    dependencies.localTestModeActive === true,
  );
  if (!destroyed) {
    continueToSelectedRoomOrEntry();
  }
  return handle;
}

function isCompetitiveRoomEntryMode(mode: RoomEntryMode): boolean {
  return mode === "local-room" || mode === "server-room" || mode === "webrtc";
}

function applyRoomEntrySelection(url: URL, selection: RoomEntrySelection): void {
  if (selection.mode === "solo") {
    url.searchParams.delete(ROOM_ENTRY_QUERY_VERSION_PARAM);
    url.searchParams.delete("create");
    url.searchParams.delete("quick");
    url.searchParams.delete("network");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "webrtc") {
    url.searchParams.set(ROOM_ENTRY_QUERY_VERSION_PARAM, ROOM_ENTRY_QUERY_VERSION);
    url.searchParams.delete("create");
    url.searchParams.delete("quick");
    url.searchParams.set("network", "webrtc");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "server-room") {
    url.searchParams.set(ROOM_ENTRY_QUERY_VERSION_PARAM, ROOM_ENTRY_QUERY_VERSION);
    url.searchParams.set("network", "server");
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);

    if (selection.quickPlay) {
      url.searchParams.set("quick", "1");
      url.searchParams.delete("create");
      url.searchParams.delete("room");
      url.searchParams.delete("visibility");
      url.searchParams.delete("roomInstance");
      return;
    }

    url.searchParams.delete("quick");

    if (selection.createRoom) {
      url.searchParams.set("create", "1");
      url.searchParams.delete("room");
      url.searchParams.delete("roomInstance");
      if (selection.visibility === "public") {
        url.searchParams.set("visibility", "public");
      } else {
        url.searchParams.delete("visibility");
      }
      return;
    }

    url.searchParams.delete("create");
    if (selection.visibility === "public") {
      url.searchParams.set("visibility", "public");
    } else {
      url.searchParams.delete("visibility");
    }

    if (selection.roomCode) {
      url.searchParams.set("room", selection.roomCode);
      if (selection.roomInstanceId) {
        url.searchParams.set("roomInstance", selection.roomInstanceId);
      } else {
        url.searchParams.delete("roomInstance");
      }
    }

    return;
  }

  if (selection.roomCode) {
    url.searchParams.set(ROOM_ENTRY_QUERY_VERSION_PARAM, ROOM_ENTRY_QUERY_VERSION);
    url.searchParams.delete("create");
    url.searchParams.delete("quick");
    url.searchParams.set("network", "local");
    url.searchParams.set("room", selection.roomCode);
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);
  }
}

function clearRoomEntrySearchParams(url: URL): void {
  url.searchParams.delete(ROOM_ENTRY_QUERY_VERSION_PARAM);
  url.searchParams.delete("create");
  url.searchParams.delete("quick");
  url.searchParams.delete("visibility");
  url.searchParams.delete("roomInstance");
  url.searchParams.delete("network");
  url.searchParams.delete("room");
  url.searchParams.delete("serverPlayerId");
  url.searchParams.delete("serverSessionId");
}

function replaceBrowserUrl(url: URL): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

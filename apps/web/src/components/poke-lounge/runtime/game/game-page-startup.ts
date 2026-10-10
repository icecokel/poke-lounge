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
  consumeLocalTestModeStart,
  requestLocalTestModeStart,
  deactivateLocalTestMode,
  loadLocalTestModeState,
  resolveLocalTestModeState,
  type LocalTestModeState,
} from "./local-test-mode";
import type { MultiplayerRoom } from "./network/local-preview-room";
import { createMultiplayerRoom } from "./network/multiplayer-room-factory";
import {
  clearPendingRoomEntry,
  readPendingRoomEntry,
  writePendingRoomEntry,
  type PendingRoomEntry,
} from "./network/room-entry-cookie";
import {
  clearRoomEntrySearchParams,
  createRoomShareUrl,
  readRoomEntryFromLocation,
  type RoomEntryIntent,
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
  isMultiplayer(): boolean;
  leaveRoomForResult(openCreateRoom?: boolean): Promise<boolean>;
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
  room?: MultiplayerRoom | null,
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
    roomCode: room?.roomId,
    sessionId: room?.sessionId,
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
  const initialRoomEntry = readRoomEntryFromLocation(currentUrl);
  const legacyLocalTestStartRequested =
    currentUrl.searchParams.get(LOCAL_TEST_MODE_START_QUERY_PARAM) === "1";
  let selectedRoomEntry: RoomEntryIntent = { mode: "unset", roomCode: null };
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
  let leaveRoomForResultAction: ((openCreateRoom?: boolean) => Promise<boolean>) | null = null;
  let openCreateRoomOnEntry = false;
  let temporaryRoomCode: string | undefined;
  let privateRoomAccess: { roomCode: string; code: string } | undefined;
  let activeRoomRunId: string | null = null;
  let resumingStoredRoom = false;
  let initialOpenCommandId: string | undefined;
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
    isMultiplayer() {
      return isCompetitiveRoomEntryMode(selectedRoomEntry.mode);
    },
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
      leaveRoomForResultAction = null;
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
    leaveRoomForResult(openCreateRoom = false) {
      return leaveRoomForResultAction?.(openCreateRoom) ?? Promise.resolve(false);
    },
    setViewportSize(nextViewportSize: GameViewportDisplaySize) {
      activeViewportSize = nextViewportSize;
      if (!activeGame) {
        return;
      }

      activeGame.resize(activeViewportSize);
    },
  };

  const startGame = async (roomEntry: RoomEntryIntent) => {
    mount.dataset.pokeLoungeResourceStatus = "loading";
    emitRuntimeState({ phase: "loading", progress: { loaded: 0, total: 1, ratio: 0 } });
    const runtimeAssets = await loadRuntimeAssets();
    if (destroyed) {
      return;
    }

    const multiplayerRoom = withStartupStep("room_creation", () =>
      (dependencies.createMultiplayerRoom ?? createMultiplayerRoom)({
        accountId: resumingStoredRoom || !temporaryRoomCode ? dependencies.accountId : undefined,
        createWebRtcRoom,
        idToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.idToken : undefined,
        getIdToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.getIdToken : undefined,
        roomId: temporaryRoomCode,
        roomRunId: activeRoomRunId ?? undefined,
        resumeRoom: resumingStoredRoom,
        initialOpenCommandId,
        sharedWorldOnly: Boolean(temporaryRoomCode),
        competitiveRoundsEnabled: isCompetitiveRoomEntryMode(roomEntry.mode),
        roomEntry,
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
      roomEntry,
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
        emitRuntimeState(
          starterState ?? {
            ...gameplayState,
            world: {
              ...world,
              roomEntry: {
                ...roomEntry,
                roomCode: multiplayerRoom.roomId,
                roomInstanceId: multiplayerRoom.roomInstanceId,
              },
            },
          },
        );
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
        const errorCode = reportGameStartupFailure(error, "STARTER_DATA_FAILED", multiplayerRoom);
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
        roundDurationMs: roomEntry.roundDurationMs,
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
            ? {
                ...controls,
                ...lobby,
                ...(privateRoomAccess?.roomCode === lobby.projection.roomCode
                  ? { privateRoomAccessCode: privateRoomAccess.code }
                  : {}),
                phase: "lobby",
              }
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
      privateRoomAccess = undefined;
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
      leaveRoomForResultAction = null;
      showRoomEntry();
    };
    let leavingRoom = false;
    const leaveAndReturnToRoomEntry = async (openCreateRoom = false): Promise<boolean> => {
      if (leavingRoom) return false;
      leavingRoom = true;
      try {
        await multiplayerRoom.leave?.();
      } catch {
        leavingRoom = false;
        dispatchPokeLoungeNotice(mount.ownerDocument, {
          message: copy.lobby.mutationFailed,
          tone: "error",
        });
        return false;
      }

      openCreateRoomOnEntry = openCreateRoom;
      returnToRoomEntry(gameStateStore.getCurrentLocalPlayer().displayName);
      return true;
    };
    leaveRoomForResultAction = leaveAndReturnToRoomEntry;
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

      if (!detail || roomEntry.mode !== "server-room") {
        return;
      }

      const shouldReturnPublicDirectory =
        roomEntry.visibility === "public" &&
        roomEntry.createRoom !== true &&
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
          confirm: () => void leaveAndReturnToRoomEntry(),
        };

        if (dependencies.onRoomLeaveRequest) {
          dependencies.onRoomLeaveRequest(request);
        } else {
          void leaveAndReturnToRoomEntry();
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
          onLeave: () => void leaveAndReturnToRoomEntry(),
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

    const errorCode = reportGameStartupFailure(error, stage, activeMultiplayerRoom);

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
  const startGameAfterStarterSelection = (roomEntry: RoomEntryIntent) => {
    // Joining a server room never requires choosing a starter. The authoritative
    // room-start projection opens the selection on the existing connection.
    if (roomEntry.mode === "server-room" || !gameStateStore.canChooseStarter()) {
      void startGame(roomEntry).catch(function handleRejected(error) {
        showStartupError(
          function callback() {
            return startGameAfterStarterSelection(roomEntry);
          },
          error,
          "GAME_START_FAILED",
        );
      });
      return;
    }

    void showStarterSelection(function callback() {
      void startGame(roomEntry).catch(function handleRejected(error) {
        showStartupError(
          function callback() {
            return startGameAfterStarterSelection(roomEntry);
          },
          error,
          "GAME_START_FAILED",
        );
      });
    }).catch(function handleRejected(error) {
      showStartupError(
        function callback() {
          return startGameAfterStarterSelection(roomEntry);
        },
        error,
        "STARTER_DATA_FAILED",
      );
    });
  };
  const selectRoomEntry = (selection: RoomEntrySelection, restored?: PendingRoomEntry) => {
    if (destroyed || roomEntrySelectionPending) {
      return;
    }

    roomEntrySelectionPending = true;

    if (isCompetitiveRoomEntryMode(selection.mode)) {
      activateRoomRun(restored?.runId ?? createRoomRunId());
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
    privateRoomAccess =
      selection.mode === "server-room" && selection.roomCode && selection.privateRoomAccessCode
        ? { roomCode: selection.roomCode, code: selection.privateRoomAccessCode }
        : undefined;
    resumingStoredRoom = false;
    initialOpenCommandId =
      selection.mode === "server-room" ? (restored?.commandId ?? createRoomRunId()) : undefined;
    if (selection.mode === "server-room" && !restored && activeRoomRunId && initialOpenCommandId) {
      writePendingRoomEntry({
        selection: {
          ...selection,
          displayName: gameStateStore.getCurrentLocalPlayer().displayName,
        },
        runId: activeRoomRunId,
        commandId: initialOpenCommandId,
        accountId: dependencies.accountId,
      });
    }

    selectedRoomEntry = selection;
    clearRoomEntrySearchParams(currentUrl);
    // Local rooms have no stored server identity; retain their invite for reloads.
    if (selection.mode === "local-room") {
      const shareUrl = createRoomShareUrl(currentUrl, selection);
      if (shareUrl) currentUrl.search = new URL(shareUrl).search;
    }
    replaceBrowserUrl(currentUrl);

    if (shouldResetRoomEntrySession(selection)) {
      gameStateStore.reset();
    }

    startGameAfterStarterSelection(selectedRoomEntry);
  };
  const showRoomEntry = () => {
    if (destroyed) {
      return;
    }

    roomEntrySelectionPending = false;
    clearPendingRoomEntry();
    initialOpenCommandId = undefined;
    selectedRoomEntry = { mode: "unset", roomCode: null };
    const openCreateRoom = openCreateRoomOnEntry;
    openCreateRoomOnEntry = false;
    emitRuntimeState({
      phase: "entry",
      screen: "room",
      currentUrl: new URL(currentUrl.href),
      openCreateRoom,
      localTestMode: localTestModeState.available
        ? {
            active: localTestModeState.active,
            onStart: () => {
              if (localTestModeState.active) {
                selectRoomEntry({
                  mode: "solo",
                  roomCode: null,
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

                  requestLocalTestModeStart(currentUrl);
                  window.location.assign(createLocalTestModeSoloUrl(currentUrl).href);
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
    const storedLocalTestStartRequested = consumeLocalTestModeStart(currentUrl);
    clearRoomEntrySearchParams(currentUrl);
    replaceBrowserUrl(currentUrl);
    if (legacyLocalTestStartRequested || storedLocalTestStartRequested) {
      if (localTestModeState.active) {
        selectRoomEntry({ mode: "solo", roomCode: null });
      } else {
        showRoomEntry();
      }
      return;
    }

    if (consumeLegacyServerRoomIdentity(dependencies.accountId)) {
      dispatchPokeLoungeNotice(mount.ownerDocument, {
        message: copy.roomEntry.legacySessionExpired,
        tone: "warning",
      });
    }

    const roomEntry = initialRoomEntry;
    const pending = readPendingRoomEntry(dependencies.accountId);
    if (
      pending &&
      !localTestModeState.active &&
      (roomEntry.mode === "unset" ||
        (roomEntry.mode === "server-room" &&
          roomEntry.roomCode === pending.selection.roomCode &&
          (!roomEntry.roomInstanceId ||
            roomEntry.roomInstanceId === pending.selection.roomInstanceId)))
    ) {
      selectRoomEntry(pending.selection, pending);
      return;
    }
    clearPendingRoomEntry();
    const storedResume = readStoredServerRoomResume(dependencies.accountId);
    const canResumeStoredRoom =
      !localTestModeState.active &&
      storedResume !== null &&
      (roomEntry.mode === "unset" ||
        (roomEntry.mode === "server-room" &&
          roomEntry.createRoom !== true &&
          roomEntry.quickPlay !== true &&
          roomEntry.roomCode === storedResume.roomCode &&
          (!roomEntry.roomInstanceId || roomEntry.roomInstanceId === storedResume.roomInstanceId)));

    if (canResumeStoredRoom && storedResume) {
      activateRoomRun(storedResume.runId);
      temporaryRoomCode = storedResume.roomCode;
      resumingStoredRoom = true;
      selectedRoomEntry = {
        mode: "server-room",
        roomCode: storedResume.roomCode,
        roomInstanceId: storedResume.roomInstanceId,
      };
      roomEntrySelectionPending = true;
      startGameAfterStarterSelection(selectedRoomEntry);
      return;
    }

    if (localTestModeState.active && isCompetitiveRoomEntryMode(roomEntry.mode)) {
      clearRoomEntrySearchParams(currentUrl);
      replaceBrowserUrl(currentUrl);
      showRoomEntry();
      return;
    }

    if (roomEntry.mode === "server-room" && roomEntry.roomCode) {
      // Keep the pending invite until submission so reloading the name form is safe.
      const inviteUrl = createRoomShareUrl(currentUrl, roomEntry);
      if (inviteUrl) currentUrl.search = new URL(inviteUrl).search;
      replaceBrowserUrl(currentUrl);
      emitRuntimeState({
        phase: "entry",
        screen: "direct-multiplayer",
        roomCode: roomEntry.roomCode,
        currentUrl: new URL(currentUrl.href),
        initialDisplayName: gameStateStore.getCurrentLocalPlayer().displayName,
        onSubmit: displayName =>
          selectRoomEntry({
            mode: "server-room",
            roomCode: roomEntry.roomCode,
            displayName,
            ...(roomEntry.roomInstanceId ? { roomInstanceId: roomEntry.roomInstanceId } : {}),
            ...(roomEntry.visibility ? { visibility: roomEntry.visibility } : {}),
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

    if (roomEntry.mode === "local-room" || roomEntry.mode === "webrtc") {
      selectRoomEntry({ ...roomEntry, mode: roomEntry.mode });
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

function replaceBrowserUrl(url: URL): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

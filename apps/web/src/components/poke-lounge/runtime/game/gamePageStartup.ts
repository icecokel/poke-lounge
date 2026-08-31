import { loadBootstrapData } from "../bootstrap";
import type { GameBootstrapData, StarterPokemon } from "../types";
import { calculateGen4BattleStats } from "@poke-lounge/battle";
import {
  bindPokeLoungeAudioPrimeListeners,
  stopAllPokeLoungeAudio,
} from "./audio/poke-lounge-audio";
import {
  loadPokeLoungeRuntimeAssets,
  type PokeLoungeRuntimeAssets,
} from "./assets/poke-lounge-runtime-assets";
import { createPokemonGenderFromRatio } from "./battle/pokemon-gender";
import { getExperienceForLevel } from "./battle/experience";
import { createPlayerPokemonMovesForLevel } from "./battle/levelUpMoves";
import { createPokeLoungeGame, type PokeLoungeGameResult } from "./createPokeLoungeGame";
import {
  getRuntimePokemonSpeciesGenderRatio,
  getRuntimePokemonSpeciesSummary,
  loadRuntimeGameDataJson,
  type RuntimeGameDataJson,
} from "./data/game-data-json";
import { readInitialBattleE2eScenario, readInitialGameScene } from "./gameStartup";
import type { PokeLoungeGameplayRuntimeState, PokeLoungeRuntimeState } from "./game-page-state";
import { createRandomIndividualValues } from "./battle/individual-values";
import type { GameViewportDisplaySize } from "./gameViewport";
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
import { createMultiplayerRoom } from "./network/multiplayerRoomFactory";
import {
  POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT,
  POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT,
  readStoredServerRoomResume,
  type PokeLoungeServerRoomErrorDetail,
} from "./network/serverRoom";
import {
  applyRoomRoundDurationSearchParam,
  readRoomEntryFromLocation,
  readRoomRoundDurationMs,
  type RoomEntryIntent,
  type RoomEntryMode,
} from "./network/roomEntry";
import { shouldResetRoomEntrySession, type RoomEntrySelection } from "./network/roomEntryScreen";
import { createWebRtcRoom, isWebRtcRoom } from "./network/webRtcRoom";
import { getDefaultGameStateStore } from "./state/defaultGameStateStore";
import type { GameStateStore, PlayerPokemon } from "./state/gameStateStore";
import {
  dispatchPokeLoungeNotice,
  type PokeLoungeRoomLeaveRequestDetail,
} from "./ui/poke-lounge-ui-events";
import { setBattleSceneMarker } from "./ui/active-game-scene-marker";
import { getPokeLoungeCopyForUrl } from "../../poke-lounge-copy";
import { getServerRoomErrorMessage } from "./server-room-error-copy";
import { createWorldFrameStore } from "./world/world-frame-store";
import { createWorldMapModel, createWorldPlayerAtlasModel } from "./world/world-map-model";
import { createWorldRuntime } from "./world/world-runtime";
import { createWorldUiStore } from "./world/world-ui-store";
import { createBattleUiStore } from "./battle/battle-ui-store";
import { virtualGamepadController } from "./input/virtualGamepad";

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

export async function startGamePage(
  mount: HTMLElement,
  location: GamePageLocation,
  dependencies: StartGamePageDependencies = {},
): Promise<GamePageHandle> {
  const gameStateStore = dependencies.gameStateStore ?? getDefaultGameStateStore();
  const initialScene = readInitialGameScene(location);
  const battleE2eScenario = readInitialBattleE2eScenario(location);
  const currentUrl = new URL(location.href);
  const copy = getPokeLoungeCopyForUrl(currentUrl);
  const activateTestMode = dependencies.activateLocalTestMode ?? activateLocalTestMode;
  const deactivateTestMode = dependencies.deactivateLocalTestMode ?? deactivateLocalTestMode;
  const loadTestModeState = dependencies.loadLocalTestModeState ?? loadLocalTestModeState;
  const emitRuntimeState = dependencies.onRuntimeStateChange ?? (() => {});
  let runtimeGameDataPromise: Promise<RuntimeGameDataJson> | null = null;
  let runtimeAssetsPromise: Promise<PokeLoungeRuntimeAssets> | null = null;
  let runtimeAssetsAbortController: AbortController | null = null;
  let runtimeAssetsLoadRequestId = 0;
  let activeGame: PokeLoungeGameInstance | null = null;
  let activeMultiplayerRoom: ReturnType<typeof createMultiplayerRoom> | null = null;
  let requestRoomLeaveAction: (() => void) | null = null;
  let temporaryRoomCode: string | undefined;
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
      throw error;
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
      throw error;
    }
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
    const multiplayerRoom = (dependencies.createMultiplayerRoom ?? createMultiplayerRoom)({
      accountId: resumingStoredRoom || !temporaryRoomCode ? dependencies.accountId : undefined,
      createWebRtcRoom,
      idToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.idToken : undefined,
      getIdToken: resumingStoredRoom || !temporaryRoomCode ? dependencies.getIdToken : undefined,
      roomId: temporaryRoomCode,
      persistRoomCodeInUrl: temporaryRoomCode ? false : undefined,
      resumeRoom: resumingStoredRoom,
      sharedWorldOnly: Boolean(temporaryRoomCode),
      competitiveRoundsEnabled: isCompetitiveRoomEntryMode(roomEntry.mode),
      searchParams: gameUrl.searchParams,
    });
    const competitiveRoundsEnabled = isCompetitiveRoomEntryMode(roomEntry.mode);
    const worldFrameStore = createWorldFrameStore();
    const worldModel = createWorldMapModel(runtimeAssets.tilemap);
    const worldRuntime = createWorldRuntime(worldModel, worldFrameStore);
    const worldUiStore = createWorldUiStore();
    const battleUiStore = createBattleUiStore();
    const battle = { uiStore: battleUiStore };
    const world = {
      atlas: createWorldPlayerAtlasModel(runtimeAssets.playerAtlas.data),
      competitiveRoundsEnabled,
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
    const game = (dependencies.createPokeLoungeGame ?? createPokeLoungeGame)(mount, {
      ...(battleE2eScenario ? { battleE2eScenario } : {}),
      competitiveRoundsEnabled,
      gameStateStore,
      initialScene,
      multiplayerRoom,
      onGameResult: roomEntry.mode === "server-room" ? undefined : dependencies.onGameResult,
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
        emitRuntimeState(gameplayState);
      },
      serverAuthoritativeRounds: roomEntry.mode === "server-room",
      battleUiStore,
      runtimeAssets,
      viewportSize: activeViewportSize,
      worldFrameStore,
      worldModel,
      worldRuntime,
      worldUiStore,
    });
    activeGame = game;
    const returnToRoomEntry = () => {
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
      void (async () => {
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
    const handleFreshSessionRequired = () => {
      dispatchPokeLoungeNotice(mount.ownerDocument, {
        message: copy.roomEntry.freshSession,
        tone: "warning",
      });
      returnToRoomEntry();
    };
    window.addEventListener(POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT, handleFreshSessionRequired);
    removeFreshSessionListener = () => {
      window.removeEventListener(
        POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT,
        handleFreshSessionRequired,
      );
    };
    const handleServerRoomError = (event: Event) => {
      const detail = (event as CustomEvent<PokeLoungeServerRoomErrorDetail>).detail;

      if (!detail || readRoomEntryFromLocation(gameUrl).mode !== "server-room") {
        return;
      }

      emitRuntimeState({
        phase: "error",
        description: getServerRoomErrorMessage(copy.locale, detail.code),
        ...(detail.recoverable && detail.retry
          ? {
              onRetry: () => {
                emitRuntimeState(gameplayState);
                detail.retry?.();
              },
            }
          : {}),
        onReturnToEntry: detail.cancel,
      });
    };
    window.addEventListener(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, handleServerRoomError);
    removeServerRoomErrorListener = () => {
      window.removeEventListener(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, handleServerRoomError);
    };
    removeServerRoomStatusListener = multiplayerRoom.on(
      "CONNECTION_STATUS",
      ({ connectionStatus }) => {
        if (connectionStatus === "online") {
          emitRuntimeState(gameplayState);
        }
      },
    );

    if (competitiveRoundsEnabled || temporaryRoomCode) {
      requestRoomLeaveAction = () => {
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
    emitRuntimeState(gameplayState);
  };
  const showStartupError = (retry: () => void) => {
    if (destroyed) {
      return;
    }

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
      onRetry: retry,
      onReturnToEntry: () => {
        clearRoomEntrySearchParams(currentUrl);
        replaceBrowserUrl(currentUrl);
        showRoomEntry();
      },
    });
  };
  const showStarterSelection = async (afterSelection: () => void) => {
    const requestId = (starterSelectionRequestId += 1);
    emitRuntimeState({ phase: "loading", progress: { loaded: 0, total: 1, ratio: 0 } });
    const [bootstrap] = await Promise.all([
      (dependencies.loadBootstrapData ?? loadBootstrapData)(),
      loadRuntimeGameData(),
    ]);
    if (destroyed || requestId !== starterSelectionRequestId) {
      return;
    }

    let completed = false;
    emitRuntimeState({
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
    if (!gameStateStore.canChooseStarter()) {
      void startGame(gameUrl).catch(() => {
        showStartupError(() => startGameAfterStarterSelection(gameUrl));
      });
      return;
    }

    void showStarterSelection(() => {
      void startGame(gameUrl).catch(() => {
        showStartupError(() => startGameAfterStarterSelection(gameUrl));
      });
    }).catch(() => {
      showStartupError(() => startGameAfterStarterSelection(gameUrl));
    });
  };
  const selectRoomEntry = (selection: RoomEntrySelection) => {
    if (destroyed || roomEntrySelectionPending) {
      return;
    }

    roomEntrySelectionPending = true;

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
                .then(() => {
                  if (destroyed || typeof window === "undefined") {
                    return;
                  }

                  window.location.assign(createLocalTestModeStartUrl(currentUrl).href);
                })
                .catch(() => {
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
                .then(() => {
                  if (destroyed || typeof window === "undefined") {
                    return;
                  }

                  const exitUrl = new URL(currentUrl.href);
                  clearRoomEntrySearchParams(exitUrl);
                  exitUrl.searchParams.delete(LOCAL_TEST_MODE_START_QUERY_PARAM);
                  window.location.assign(exitUrl.href);
                })
                .catch(() => {
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
  const showDirectMultiplayerEntry = (roomEntry: RoomEntryIntent) => {
    if (destroyed) {
      return;
    }

    roomEntrySelectionPending = false;
    const roundDurationMs = readRoomRoundDurationMs(currentUrl.searchParams);
    emitRuntimeState({
      phase: "entry",
      screen: "direct-multiplayer",
      currentUrl: new URL(currentUrl.href),
      initialDisplayName: gameStateStore.getCurrentLocalPlayer().displayName,
      onSubmit: displayName => {
        selectRoomEntry({
          mode: "server-room",
          roomCode: roomEntry.roomCode,
          inviteUrl: null,
          displayName,
          ...(roomEntry.createRoom ? { createRoom: true } : {}),
          ...(roundDurationMs !== null ? { roundDurationMs } : {}),
        });
      },
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

    const roomEntry = readRoomEntryFromLocation(currentUrl);
    const storedResume = readStoredServerRoomResume(dependencies.accountId);
    const canResumeStoredRoom =
      !localTestModeState.active &&
      !gameStateStore.canChooseStarter() &&
      storedResume !== null &&
      (roomEntry.mode === "unset" ||
        (roomEntry.mode === "server-room" &&
          (roomEntry.createRoom === true || roomEntry.roomCode === storedResume.roomCode)));

    if (canResumeStoredRoom) {
      temporaryRoomCode = storedResume.roomCode;
      resumingStoredRoom = true;
      currentUrl.searchParams.set("network", "server");
      currentUrl.searchParams.set("create", "1");
      currentUrl.searchParams.delete("room");
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

    if (roomEntry.mode === "server-room" && !isLocalE2eUrl(currentUrl)) {
      currentUrl.searchParams.delete("create");
      currentUrl.searchParams.delete("network");
      currentUrl.searchParams.delete("room");
      replaceBrowserUrl(currentUrl);
      showRoomEntry();
      return;
    }

    if (roomEntry.mode === "server-room") {
      showDirectMultiplayerEntry(roomEntry);
      return;
    }

    if (isCompetitiveRoomEntryMode(roomEntry.mode)) {
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

function isLocalE2eUrl(url: URL): boolean {
  return (
    url.searchParams.has("e2e") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
  );
}

function isCompetitiveRoomEntryMode(mode: RoomEntryMode): boolean {
  return mode === "local-room" || mode === "server-room" || mode === "webrtc";
}

function applyRoomEntrySelection(url: URL, selection: RoomEntrySelection): void {
  if (selection.mode === "solo") {
    url.searchParams.delete("create");
    url.searchParams.delete("network");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "webrtc") {
    url.searchParams.delete("create");
    url.searchParams.set("network", "webrtc");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "server-room") {
    url.searchParams.set("network", "server");
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);

    if (selection.createRoom) {
      url.searchParams.set("create", "1");
      url.searchParams.delete("room");
      return;
    }

    url.searchParams.delete("create");

    if (selection.roomCode) {
      url.searchParams.set("room", selection.roomCode);
    }

    return;
  }

  if (selection.roomCode) {
    url.searchParams.delete("create");
    url.searchParams.set("network", "local");
    url.searchParams.set("room", selection.roomCode);
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);
  }
}

function clearRoomEntrySearchParams(url: URL): void {
  url.searchParams.delete("create");
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

export function createStarterPlayerPokemon(
  starter: StarterPokemon,
  level = 10,
  random: () => number = Math.random,
): PlayerPokemon {
  const gender = createPokemonGenderFromRatio(
    getRuntimePokemonSpeciesGenderRatio(starter.speciesId),
    random,
  );

  const individualValues = createRandomIndividualValues();
  const species = getRuntimePokemonSpeciesSummary(starter.speciesId);
  if (!species) {
    throw new Error(`Starter species ${starter.speciesId} is missing from runtime game data`);
  }
  const stats = calculateGen4BattleStats(species.baseStats, level, individualValues);

  return {
    speciesId: starter.speciesId,
    name: species.name,
    level,
    growthRate: species.growthRate,
    experience: getExperienceForLevel(level, species.growthRate),
    ...(gender ? { gender } : {}),
    individualValues,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    status: "normal",
    moves: createPlayerPokemonMovesForLevel(starter.speciesId, level),
  };
}

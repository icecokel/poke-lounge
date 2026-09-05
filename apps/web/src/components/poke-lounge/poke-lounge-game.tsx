"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { useGame } from "@/contexts/game-context";
import { useRouter } from "@/i18n/navigation";
import {
  getSessionApiAccountId,
  getSessionApiIdToken,
  isAuthSessionError,
  type ApiTokenSession,
} from "@/lib/auth-token";
import { loadPokeLoungeState } from "@/services/poke-lounge-state-service";
import {
  createPokeLoungeAutosaveLifecycle,
  getPokeLoungeTokenLifecycle,
  startPokeLoungeAutosave,
  type PokeLoungeAutosaveStatus,
} from "./poke-lounge-autosave";
import { usePokeLoungeAccessibleStatus } from "./use-poke-lounge-accessible-status";
import { setPokeLoungeMasterVolume } from "./runtime/game/audio/poke-lounge-audio";
import {
  createAuthenticatedGameStateStorageScope,
  getDefaultGameStateStore,
  setDefaultGameStateStorageScope,
} from "./runtime/game/state/default-game-state-store";
import { ANONYMOUS_GAME_STATE_STORAGE_SCOPE } from "./runtime/game/state/game-state-storage";
import {
  buildPokeLoungeSaveSnapshot,
  type PokeLoungeSaveSnapshot,
} from "./runtime/game/state/poke-lounge-save-snapshot";
import { hasSamePokeLoungeLocalProgress } from "./runtime/game/state/poke-lounge-save-conflict";
import { detectTouchGameDevice } from "./runtime/game/input/mobile-touch-controls";
import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  resetVirtualGamepad,
} from "./runtime/game/input/virtual-gamepad";
import {
  GAME_VIEWPORT_SIZE_PRESETS,
  MOBILE_GAME_VIEWPORT_SIZE,
  type GameViewportDisplaySize,
  type GameViewportSizePreset,
} from "./runtime/game/game-viewport";
import {
  GAME_FULLSCREEN_STATE_EVENT,
  isGameFullscreenActive,
  toggleGameFullscreen,
} from "./runtime/web-fullscreen";
import {
  POKE_LOUNGE_NOTICE_EVENT,
  type PokeLoungeNoticeDetail,
  type PokeLoungeRoomLeaveRequestDetail,
} from "./runtime/game/ui/poke-lounge-ui-events";
import {
  createPokeLoungePartySlotSummaries,
  type PokeLoungePartySlotSummary,
} from "./runtime/game/ui/mobile-world-ui";
import { hasPokeLoungeMobileFullscreenScene } from "./runtime/game/ui/mobile-ui-capability";
import { createRoomShareUrl } from "./runtime/game/network/room-entry";
import { getPokeLoungeCopy } from "./poke-lounge-copy";
import {
  createPokeLoungeRoomEntryUrl,
  isPokeLoungeMultiplayerResultUrl,
} from "./poke-lounge-result-navigation";
import { MobileGameShell } from "./mobile/mobile-game-shell";
import type { PokeLoungeRuntimeState } from "./runtime/game/game-page-state";
import { PokeLoungeGameFrame } from "./poke-lounge-game-frame";
import { PokeLoungeSettingsDialog } from "./poke-lounge-settings-dialog";
import {
  PokeLoungeDecisionDialogs,
  PokeLoungeHydrationScreens,
  PokeLoungeNoticeBanner,
  PokeLoungeResultPanel,
  PokeLoungeStatusRail,
  PokeLoungeStartupErrorScreen,
  type PokeLoungeStateHydrationStatus,
} from "./poke-lounge-game-overlays";
import styles from "./poke-lounge.module.css";
import themeStyles from "./poke-lounge-theme.module.css";

type PokeLoungeWindow = Window & {
  __POKE_LOUNGE_CLEANUP_FOR_TEST__?: () => void;
  __POKE_LOUNGE_E2E__?: unknown;
};

interface FinalResultState {
  score: number;
  playTime: number;
}

interface PendingHydrationResolution {
  accountId: string;
  revision: number;
  snapshot: PokeLoungeSaveSnapshot;
}

const POKE_LOUNGE_DEFAULT_VOLUME = 0.2;
const POKE_LOUNGE_VOLUME_STEPS = [0, POKE_LOUNGE_DEFAULT_VOLUME, 0.4, 0.6, 0.8, 1] as const;
const POKE_LOUNGE_DEFAULT_VOLUME_LEVEL_INDEX = POKE_LOUNGE_VOLUME_STEPS.indexOf(
  POKE_LOUNGE_DEFAULT_VOLUME,
);
const POKE_LOUNGE_CONTAINER_WIDTH_VAR = "--poke-lounge-container-width";
const POKE_LOUNGE_CONTAINER_HEIGHT_VAR = "--poke-lounge-container-height";
const POKE_LOUNGE_VOLUME_STORAGE_KEY = "poke-lounge:volume-level";
const POKE_LOUNGE_UI_SIZE_STORAGE_KEY = "poke-lounge:ui-size";
let activeGameStateStorageScope: string = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
const OPEN_MODAL_DIALOG_SELECTOR = [
  "dialog[open]",
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
].join(",");

type PokeLoungeUiSize = GameViewportSizePreset;
type PokeLoungeGamePageHandle = {
  destroy(): void;
  requestRoomLeave(): boolean;
  setViewportSize(viewportSize: GameViewportDisplaySize): void;
};
type PokeLoungeRoomShareStatus = "idle" | "success" | "error";
type PokeLoungeConnectionSummary = {
  connectionStatus: "offline" | "connecting" | "online";
  roomId: string | null;
};

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function hasOpenModalDialog(ownerDocument: Document): boolean {
  return ownerDocument.querySelector(OPEN_MODAL_DIALOG_SELECTOR) !== null;
}

function isShortcutGuideOpen(ownerDocument: Document): boolean {
  return ownerDocument.body.classList.contains("is-shortcut-guide-open");
}

function createPokeLoungeRoomShareUrlFromLocation(roomCode?: string | null): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return createRoomShareUrl(new URL(window.location.href), roomCode);
}

function readStoredVolumeLevelIndex(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const parsed = Number.parseInt(
    window.localStorage.getItem(POKE_LOUNGE_VOLUME_STORAGE_KEY) ?? "",
    10,
  );

  return Number.isInteger(parsed) && parsed >= 0 && parsed < POKE_LOUNGE_VOLUME_STEPS.length
    ? parsed
    : null;
}

function readStoredUiSize(): PokeLoungeUiSize | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(POKE_LOUNGE_UI_SIZE_STORAGE_KEY);
  return stored === "normal" || stored === "large" ? stored : null;
}

export function PokeLoungeGame() {
  const { setGamePlaying } = useGame();
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  const apiSession = session as ApiTokenSession | null;
  const localTestModeActive = apiSession?.localTestMode === true;
  const sessionToken = getSessionApiIdToken(apiSession, Date.now(), {
    allowLocalTestMode: true,
  });
  const accountId = sessionToken
    ? (getSessionApiAccountId(apiSession, sessionToken) ?? null)
    : null;
  const copy = getPokeLoungeCopy(locale);
  const sentenceEnd = copy.locale === "ja-JP" ? "。" : ".";
  const accessibleGameStatus = usePokeLoungeAccessibleStatus(locale);
  const pageRef = useRef<HTMLElement>(null);
  const gamePageHandleRef = useRef<PokeLoungeGamePageHandle | null>(null);
  const gameStateStorageScopeRef = useRef(activeGameStateStorageScope);
  const accountTokensRef = useRef(new Map<string, string>());
  const latestAccountIdRef = useRef(accountId);
  const flushRecoveredLocalStateRef = useRef(false);
  latestAccountIdRef.current = accountId;
  if (accountId && sessionToken) {
    accountTokensRef.current.set(accountId, sessionToken);
  }
  const startedAtMsRef = useRef(Date.now());
  const isUnmountingRef = useRef(false);
  const tokenLifecycle = getPokeLoungeTokenLifecycle();
  const [finalResult, setFinalResult] = useState<FinalResultState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [touchGameDevice, setTouchGameDevice] = useState(false);
  const [touchGameDeviceResolved, setTouchGameDeviceResolved] = useState(false);
  const [gameRuntimeMounted, setGameRuntimeMounted] = useState(false);
  const [activeGameScene, setActiveGameScene] = useState<"battle" | "world" | null>(null);
  const [settingsPartySlots, setSettingsPartySlots] = useState<PokeLoungePartySlotSummary[]>([]);
  const [volumeLevelIndex, setVolumeLevelIndex] = useState(POKE_LOUNGE_DEFAULT_VOLUME_LEVEL_INDEX);
  const [uiSize, setUiSize] = useState<PokeLoungeUiSize>("large");
  const [roomShareStatus, setRoomShareStatus] = useState<PokeLoungeRoomShareStatus>("idle");
  const [stateHydrationStatus, setStateHydrationStatus] =
    useState<PokeLoungeStateHydrationStatus>("pending");
  const [stateHydrationMessage, setStateHydrationMessage] = useState("");
  const [stateHydrationAttempt, setStateHydrationAttempt] = useState(0);
  const [stateHydrationRetrying, setStateHydrationRetrying] = useState(false);
  const [pendingHydrationResolution, setPendingHydrationResolution] =
    useState<PendingHydrationResolution | null>(null);
  const [hydratedAccountId, setHydratedAccountId] = useState<string | null>(null);
  const [hydratedRevision, setHydratedRevision] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<PokeLoungeAutosaveStatus>("idle");
  const [connectionSummary, setConnectionSummary] = useState<PokeLoungeConnectionSummary>({
    connectionStatus: "offline",
    roomId: null,
  });
  const [leaveRequest, setLeaveRequest] = useState<PokeLoungeRoomLeaveRequestDetail | null>(null);
  const [notice, setNotice] = useState<PokeLoungeNoticeDetail | null>(null);
  const [gameStartupAttempt, setGameStartupAttempt] = useState(0);
  const [gameStartupError, setGameStartupError] = useState(false);
  const [runtimeState, setRuntimeState] = useState<PokeLoungeRuntimeState>({
    phase: "hydrating",
  });
  const worldUiStore =
    runtimeState.phase === "world" || runtimeState.phase === "lobby"
      ? runtimeState.world?.uiStore
      : undefined;
  const battleUiStore =
    runtimeState.phase === "world" ||
    runtimeState.phase === "battle" ||
    runtimeState.phase === "lobby"
      ? runtimeState.battle.uiStore
      : undefined;
  const roomLeaveLabel =
    runtimeState.phase === "world" ||
    runtimeState.phase === "battle" ||
    runtimeState.phase === "lobby"
      ? (runtimeState.roomLeave?.label ?? null)
      : null;
  const volumeValue = POKE_LOUNGE_VOLUME_STEPS[volumeLevelIndex];
  const volumePercent = Math.round(volumeValue * 100);
  const volumeLabel = volumePercent === 0 ? copy.volumeMuted : copy.volumeLabel(volumePercent);
  const volumeAriaLabel = copy.volumeAriaLabel(volumePercent);
  const uiSizeLabel = uiSize === "large" ? copy.uiLarge : copy.uiNormal;
  const multiplayerRoomId =
    connectionSummary.roomId && connectionSummary.roomId !== "local-preview"
      ? connectionSummary.roomId
      : null;
  const roomShareUrl = createPokeLoungeRoomShareUrlFromLocation(
    runtimeState.phase === "lobby" ? runtimeState.projection.roomCode : multiplayerRoomId,
  );
  const localRoomShare =
    Boolean(roomShareUrl) &&
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("network") === "local";
  const connectionLabel =
    connectionSummary.connectionStatus === "online"
      ? copy.connectionConnected
      : connectionSummary.connectionStatus === "connecting"
        ? copy.connectionConnecting
        : copy.connectionDisconnected;
  const usingLocalHydrationFallback =
    stateHydrationStatus === "local-ready" || stateHydrationStatus === "conflict";
  const expectedGameStateStorageScope = accountId
    ? createAuthenticatedGameStateStorageScope(accountId)
    : ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
  const gameHydrationReady =
    (stateHydrationStatus === "ready" || stateHydrationStatus === "local-ready") &&
    gameStateStorageScopeRef.current === expectedGameStateStorageScope;
  const autosaveLabel = usingLocalHydrationFallback
    ? copy.autosaveLocalFallback
    : status !== "authenticated"
      ? copy.autosaveLocal
      : autosaveStatus === "saving"
        ? copy.autosaveSaving
        : autosaveStatus === "error"
          ? copy.autosaveError
          : autosaveStatus === "pending"
            ? copy.autosavePending
            : autosaveStatus === "saved"
              ? copy.autosaveSaved
              : copy.autosaveReady;
  const hydrationRetryDisabled = stateHydrationRetrying || Boolean(multiplayerRoomId);
  const hydrationRetryLabel = multiplayerRoomId
    ? copy.hydrationRetryAfterRoom
    : stateHydrationRetrying
      ? copy.hydrationRetrying
      : copy.hydrationRetry;
  const resultReturnsToRoomEntry =
    Boolean(finalResult) &&
    typeof window !== "undefined" &&
    isPokeLoungeMultiplayerResultUrl(new URL(window.location.href));

  const syncFullscreenState = useCallback(function memoizedCallback() {
    const page = pageRef.current;
    setFullscreenActive(page ? isGameFullscreenActive(page) : false);
  }, []);

  const handleFullscreenToggle = useCallback(
    function memoizedCallback() {
      const page = pageRef.current;
      if (!page) {
        return;
      }

      void toggleGameFullscreen(page).finally(syncFullscreenState);
    },
    [syncFullscreenState],
  );

  const handleMobileSettingsOpen = useCallback(function memoizedCallback() {
    resetVirtualGamepad();
    setSettingsOpen(true);
  }, []);

  const handleMobileSettingsClose = useCallback(function memoizedCallback() {
    resetVirtualGamepad();
    setSettingsOpen(false);
  }, []);

  const handleGameExitRequest = useCallback(function memoizedCallback() {
    resetVirtualGamepad();
    setSettingsOpen(false);

    if (gamePageHandleRef.current?.requestRoomLeave()) {
      return;
    }

    setExitConfirmationOpen(true);
  }, []);

  const handleVolumeCycle = useCallback(function memoizedCallback() {
    setVolumeLevelIndex(function callback(currentIndex) {
      return (currentIndex + 1) % POKE_LOUNGE_VOLUME_STEPS.length;
    });
  }, []);

  const handleUiSizeToggle = useCallback(function memoizedCallback() {
    setUiSize(function callback(currentSize) {
      return currentSize === "large" ? "normal" : "large";
    });
  }, []);

  const handleStateHydrationRetry = useCallback(
    function memoizedCallback() {
      if (stateHydrationStatus !== "local-ready") {
        setStateHydrationAttempt(function callback(attempt) {
          return attempt + 1;
        });
        return;
      }

      if (multiplayerRoomId) {
        return;
      }

      const retryAccountId = accountId;
      const token = retryAccountId ? accountTokensRef.current.get(retryAccountId) : undefined;
      if (
        status !== "authenticated" ||
        !retryAccountId ||
        !token ||
        isAuthSessionError(apiSession?.error)
      ) {
        setStateHydrationAttempt(function callback(attempt) {
          return attempt + 1;
        });
        return;
      }

      const retryStorageScope = createAuthenticatedGameStateStorageScope(retryAccountId);
      setStateHydrationRetrying(true);
      void tokenLifecycle
        .runHydration(function callback() {
          return loadPokeLoungeState(token);
        })
        .then(function handleResolved(result) {
          if (
            latestAccountIdRef.current !== retryAccountId ||
            gameStateStorageScopeRef.current !== retryStorageScope
          ) {
            return;
          }

          if (!result.success) {
            setStateHydrationMessage(copy.hydrationLocalFallback);
            return;
          }

          const localSnapshot = buildPokeLoungeSaveSnapshot(getDefaultGameStateStore());
          if (result.snapshot && !hasSamePokeLoungeLocalProgress(localSnapshot, result.snapshot)) {
            setPendingHydrationResolution({
              accountId: retryAccountId,
              revision: result.revision,
              snapshot: result.snapshot,
            });
            return;
          }

          flushRecoveredLocalStateRef.current = true;
          setHydratedAccountId(retryAccountId);
          setHydratedRevision(result.revision);
          setStateHydrationMessage("");
          setStateHydrationStatus("ready");
        })
        .finally(function handleSettled() {
          if (latestAccountIdRef.current === retryAccountId) {
            setStateHydrationRetrying(false);
          }
        });
    },
    [
      accountId,
      apiSession?.error,
      copy.hydrationLocalFallback,
      multiplayerRoomId,
      stateHydrationStatus,
      status,
      tokenLifecycle,
    ],
  );

  const handleUseServerHydration = useCallback(
    function memoizedCallback() {
      if (
        !pendingHydrationResolution ||
        latestAccountIdRef.current !== pendingHydrationResolution.accountId
      ) {
        setPendingHydrationResolution(null);
        return;
      }

      getDefaultGameStateStore().hydrateLocalPlayers(pendingHydrationResolution.snapshot.state);
      flushRecoveredLocalStateRef.current = false;
      setHydratedAccountId(pendingHydrationResolution.accountId);
      setHydratedRevision(pendingHydrationResolution.revision);
      setStateHydrationMessage("");
      setStateHydrationStatus("ready");
      setPendingHydrationResolution(null);
    },
    [pendingHydrationResolution],
  );

  const handleUseLocalHydration = useCallback(
    function memoizedCallback() {
      if (
        !pendingHydrationResolution ||
        latestAccountIdRef.current !== pendingHydrationResolution.accountId
      ) {
        setPendingHydrationResolution(null);
        return;
      }

      flushRecoveredLocalStateRef.current = true;
      setHydratedAccountId(pendingHydrationResolution.accountId);
      setHydratedRevision(pendingHydrationResolution.revision);
      setStateHydrationMessage("");
      setStateHydrationStatus("ready");
      setPendingHydrationResolution(null);
    },
    [pendingHydrationResolution],
  );

  const handleDeferHydrationResolution = useCallback(
    function memoizedCallback() {
      setPendingHydrationResolution(null);
      setStateHydrationMessage(copy.hydrationLocalFallback);
      setStateHydrationStatus("local-ready");
    },
    [copy.hydrationLocalFallback],
  );

  const handleRoomShare = useCallback(
    async function memoizedCallback() {
      if (!roomShareUrl || !navigator.clipboard?.writeText) {
        setRoomShareStatus("error");
        return;
      }

      try {
        await navigator.clipboard.writeText(roomShareUrl);
        setRoomShareStatus("success");
      } catch {
        setRoomShareStatus("error");
      }
    },
    [roomShareUrl],
  );

  useEffect(
    function runEffect() {
      setRoomShareStatus("idle");
    },
    [roomShareUrl],
  );

  useEffect(
    function runEffect() {
      if (!settingsOpen) {
        setRoomShareStatus("idle");
      }
    },
    [settingsOpen],
  );

  useEffect(function runEffect() {
    const storedVolumeLevelIndex = readStoredVolumeLevelIndex();
    const storedUiSize = readStoredUiSize();

    if (storedVolumeLevelIndex !== null) {
      setVolumeLevelIndex(storedVolumeLevelIndex);
    }
    if (storedUiSize) {
      setUiSize(storedUiSize);
    }
  }, []);

  useEffect(
    function runEffect() {
      setPokeLoungeMasterVolume(POKE_LOUNGE_VOLUME_STEPS[volumeLevelIndex]);
      window.localStorage.setItem(POKE_LOUNGE_VOLUME_STORAGE_KEY, String(volumeLevelIndex));
    },
    [volumeLevelIndex],
  );

  useEffect(function runEffect() {
    return function callback() {
      setPokeLoungeMasterVolume(1);
    };
  }, []);

  const gameViewportSize = touchGameDevice
    ? MOBILE_GAME_VIEWPORT_SIZE
    : GAME_VIEWPORT_SIZE_PRESETS[uiSize];

  useEffect(
    function runEffect() {
      if (touchGameDeviceResolved) {
        gamePageHandleRef.current?.setViewportSize(gameViewportSize);
      }
      window.sessionStorage.setItem(POKE_LOUNGE_UI_SIZE_STORAGE_KEY, uiSize);
    },
    [gameViewportSize, touchGameDeviceResolved, uiSize],
  );

  useEffect(function runEffect() {
    const store = getDefaultGameStateStore();
    const syncConnectionSummary = () => {
      const sessionState = store.getState().session;
      setConnectionSummary(function callback(current) {
        if (
          current.connectionStatus === sessionState.connectionStatus &&
          current.roomId === sessionState.roomId
        ) {
          return current;
        }

        return {
          connectionStatus: sessionState.connectionStatus,
          roomId: sessionState.roomId,
        };
      });
    };

    syncConnectionSummary();
    return store.subscribe(syncConnectionSummary);
  }, []);

  useEffect(
    function runEffect() {
      if (!settingsOpen) {
        return;
      }

      const store = getDefaultGameStateStore();
      const syncSettingsPartySlots = () => {
        const localPlayer = store.getCurrentLocalPlayer();
        setSettingsPartySlots(createPokeLoungePartySlotSummaries(localPlayer));
      };

      syncSettingsPartySlots();
      return store.subscribe(syncSettingsPartySlots);
    },
    [settingsOpen],
  );

  useEffect(function runEffect() {
    const handleNotice = (event: Event) => {
      setNotice((event as CustomEvent<PokeLoungeNoticeDetail>).detail);
    };

    document.addEventListener(POKE_LOUNGE_NOTICE_EVENT, handleNotice);

    return function callback() {
      document.removeEventListener(POKE_LOUNGE_NOTICE_EVENT, handleNotice);
    };
  }, []);

  useEffect(function runEffect() {
    setTouchGameDevice(
      detectTouchGameDevice({
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
        platform: navigator.platform ?? "",
        userAgent: navigator.userAgent ?? "",
      }),
    );
    setTouchGameDeviceResolved(true);
  }, []);

  useEffect(
    function runEffect() {
      const gameRoot = pageRef.current?.querySelector<HTMLElement>("#game-root");

      if (!gameRoot) {
        return;
      }

      const syncGameRuntimeState = () => {
        const resourceStatus = gameRoot.dataset.pokeLoungeResourceStatus;
        const isGameReady = resourceStatus === "ready";
        const nextActiveScene = isGameReady
          ? gameRoot.dataset.pokeLoungeActiveScene === "battle"
            ? "battle"
            : "world"
          : null;
        setGameRuntimeMounted(isGameReady);
        setActiveGameScene(nextActiveScene);
        if (nextActiveScene) {
          setRuntimeState(function callback(current) {
            return current.phase === "world" || current.phase === "battle"
              ? { ...current, phase: nextActiveScene }
              : current;
          });
        }

        if (resourceStatus === "error") {
          setGamePlaying(false);
        }
      };

      syncGameRuntimeState();

      const observer = new MutationObserver(syncGameRuntimeState);
      observer.observe(gameRoot, {
        attributes: true,
        attributeFilter: ["data-poke-lounge-active-scene", "data-poke-lounge-resource-status"],
      });

      return function callback() {
        observer.disconnect();
      };
    },
    [setGamePlaying],
  );

  useEffect(function runEffect() {
    const page = pageRef.current;

    if (!page) {
      return;
    }

    const updateContainerSize = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const focusedInput = page.querySelector<HTMLElement>(
        '.room-entry-screen input[type="text"]:focus',
      );
      const keyboardOpen = Boolean(
        focusedInput ||
        (page.hasAttribute("data-poke-lounge-keyboard-open") &&
          viewport &&
          viewport.height < window.innerHeight),
      );

      page.toggleAttribute("data-poke-lounge-keyboard-open", keyboardOpen);

      page.style.setProperty(POKE_LOUNGE_CONTAINER_WIDTH_VAR, `${Math.floor(width)}px`);
      page.style.setProperty(POKE_LOUNGE_CONTAINER_HEIGHT_VAR, `${Math.floor(height)}px`);

      if (viewport && viewport.height < window.innerHeight) {
        focusedInput?.scrollIntoView({ block: "center" });
      }
    };

    updateContainerSize();

    page.addEventListener("focusin", updateContainerSize);
    page.addEventListener("focusout", updateContainerSize);
    window.addEventListener("resize", updateContainerSize);
    window.visualViewport?.addEventListener("resize", updateContainerSize);
    document.addEventListener("fullscreenchange", updateContainerSize);
    document.addEventListener(GAME_FULLSCREEN_STATE_EVENT, updateContainerSize);

    return function callback() {
      page.removeEventListener("focusin", updateContainerSize);
      page.removeEventListener("focusout", updateContainerSize);
      window.removeEventListener("resize", updateContainerSize);
      window.visualViewport?.removeEventListener("resize", updateContainerSize);
      document.removeEventListener("fullscreenchange", updateContainerSize);
      document.removeEventListener(GAME_FULLSCREEN_STATE_EVENT, updateContainerSize);
      page.style.removeProperty(POKE_LOUNGE_CONTAINER_WIDTH_VAR);
      page.style.removeProperty(POKE_LOUNGE_CONTAINER_HEIGHT_VAR);
      page.removeAttribute("data-poke-lounge-keyboard-open");
    };
  }, []);

  useEffect(
    function runEffect() {
      const handleFullscreenStateChange = () => syncFullscreenState();

      document.addEventListener("fullscreenchange", handleFullscreenStateChange);
      document.addEventListener(GAME_FULLSCREEN_STATE_EVENT, handleFullscreenStateChange);
      syncFullscreenState();

      return function callback() {
        document.removeEventListener("fullscreenchange", handleFullscreenStateChange);
        document.removeEventListener(GAME_FULLSCREEN_STATE_EVENT, handleFullscreenStateChange);
      };
    },
    [syncFullscreenState],
  );

  useEffect(
    function runEffect() {
      let pendingSettingsOpen: number | null = null;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && touchGameDevice && settingsOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          handleMobileSettingsClose();
          return;
        }

        if (
          event.key === "Escape" &&
          touchGameDevice &&
          hasPokeLoungeMobileFullscreenScene(document)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          resetVirtualGamepad();
          worldUiStore?.dispatch({ type: "close" });
          return;
        }

        if (event.key === "Escape" && isShortcutGuideOpen(document)) {
          pressVirtualGamepadButton("back");
          releaseVirtualGamepadButton("back");
          return;
        }

        if (
          event.key !== "Escape" ||
          isEditableEventTarget(event.target) ||
          hasOpenModalDialog(document) ||
          pageRef.current?.querySelector<HTMLElement>("#game-root")?.dataset
            .pokeLoungeResourceStatus !== "ready"
        ) {
          return;
        }

        // Radix dialogs also handle Escape during this event's bubble phase.
        // Mounting the settings dialog synchronously here would let the same
        // keydown immediately close the newly mounted dialog.
        if (pendingSettingsOpen !== null) {
          window.clearTimeout(pendingSettingsOpen);
        }
        pendingSettingsOpen = window.setTimeout(function handleTimeout() {
          pendingSettingsOpen = null;
          if (
            !hasOpenModalDialog(document) &&
            pageRef.current?.querySelector<HTMLElement>("#game-root")?.dataset
              .pokeLoungeResourceStatus === "ready"
          ) {
            setSettingsOpen(true);
          }
        }, 0);
      };

      window.addEventListener("keydown", handleKeyDown, true);

      return function callback() {
        window.removeEventListener("keydown", handleKeyDown, true);
        if (pendingSettingsOpen !== null) {
          window.clearTimeout(pendingSettingsOpen);
        }
      };
    },
    [handleMobileSettingsClose, settingsOpen, touchGameDevice, worldUiStore],
  );

  useEffect(
    function runEffect() {
      if (status === "loading") {
        setStateHydrationStatus("pending");
        setStateHydrationRetrying(false);
        setHydratedAccountId(null);
        setHydratedRevision(0);
        return;
      }

      let cancelled = false;
      setStateHydrationStatus("pending");
      setStateHydrationMessage("");
      setStateHydrationRetrying(false);
      setPendingHydrationResolution(null);
      setHydratedAccountId(null);
      setHydratedRevision(0);

      void tokenLifecycle.runHydration(async function callback() {
        if (cancelled) {
          return;
        }

        const authenticatedSession =
          status === "authenticated" && !isAuthSessionError(apiSession?.error);
        if (!authenticatedSession) {
          setDefaultGameStateStorageScope(ANONYMOUS_GAME_STATE_STORAGE_SCOPE);
          if (gameStateStorageScopeRef.current !== ANONYMOUS_GAME_STATE_STORAGE_SCOPE) {
            getDefaultGameStateStore().reloadLocalPlayersFromStorage();
          }
          gameStateStorageScopeRef.current = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
          activeGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
          setStateHydrationStatus("ready");
          return;
        }

        const token = accountId ? accountTokensRef.current.get(accountId) : undefined;
        if (!accountId || !token) {
          setDefaultGameStateStorageScope(ANONYMOUS_GAME_STATE_STORAGE_SCOPE);
          if (gameStateStorageScopeRef.current !== ANONYMOUS_GAME_STATE_STORAGE_SCOPE) {
            getDefaultGameStateStore().reloadLocalPlayersFromStorage();
          }
          gameStateStorageScopeRef.current = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
          activeGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
          setStateHydrationStatus("unavailable");
          setStateHydrationMessage(copy.hydrationIdentityError);
          return;
        }

        const authenticatedStorageScope = createAuthenticatedGameStateStorageScope(accountId);
        const alreadyUsingAuthenticatedScope =
          gameStateStorageScopeRef.current === authenticatedStorageScope;
        setDefaultGameStateStorageScope(authenticatedStorageScope);
        const store = getDefaultGameStateStore();
        const restoredLocalProgress = alreadyUsingAuthenticatedScope
          ? true
          : store.reloadLocalPlayersFromStorage();
        gameStateStorageScopeRef.current = authenticatedStorageScope;
        activeGameStateStorageScope = authenticatedStorageScope;

        const result = await loadPokeLoungeState(token);
        if (cancelled) {
          return;
        }

        if (!result.success) {
          setStateHydrationStatus("local-ready");
          setStateHydrationMessage(copy.hydrationLocalFallback);
          setHydratedAccountId(null);
          setHydratedRevision(0);
          return;
        }

        if (result.snapshot) {
          const localSnapshot = buildPokeLoungeSaveSnapshot(store);
          if (
            restoredLocalProgress &&
            !hasSamePokeLoungeLocalProgress(localSnapshot, result.snapshot)
          ) {
            setPendingHydrationResolution({
              accountId,
              revision: result.revision,
              snapshot: result.snapshot,
            });
            setStateHydrationStatus("conflict");
            setStateHydrationMessage(copy.hydrationConflictDescription);
            return;
          }

          store.hydrateLocalPlayers(result.snapshot.state);
        } else if (restoredLocalProgress) {
          flushRecoveredLocalStateRef.current = true;
        }

        setStateHydrationStatus("ready");
        setHydratedAccountId(accountId);
        setHydratedRevision(result.revision);
      });

      return function callback() {
        cancelled = true;
      };
    },
    [
      accountId,
      apiSession?.error,
      copy.hydrationIdentityError,
      copy.hydrationConflictDescription,
      copy.hydrationLocalFallback,
      stateHydrationAttempt,
      status,
      tokenLifecycle,
    ],
  );

  useEffect(function runEffect() {
    isUnmountingRef.current = false;

    return function callback() {
      isUnmountingRef.current = true;
    };
  }, []);

  useEffect(
    function runEffect() {
      if (
        stateHydrationStatus !== "ready" ||
        hydratedAccountId !== accountId ||
        status !== "authenticated" ||
        !accountId ||
        isAuthSessionError(apiSession?.error)
      ) {
        return;
      }

      const token = accountTokensRef.current.get(accountId);
      if (!token) {
        return;
      }

      const autosave = startPokeLoungeAutosave({
        gameStateStore: getDefaultGameStateStore(),
        token,
        getToken: () => accountTokensRef.current.get(accountId) ?? token,
        initialRevision: hydratedRevision,
        onStatusChange: setAutosaveStatus,
        onRevisionConflict: () => {
          setHydratedAccountId(null);
          setHydratedRevision(0);
          setStateHydrationMessage(copy.hydrationLocalFallback);
          setStateHydrationStatus("local-ready");
        },
      });
      const autosaveLifecycle = createPokeLoungeAutosaveLifecycle(autosave);
      tokenLifecycle.registerAutosave(autosaveLifecycle);
      if (flushRecoveredLocalStateRef.current) {
        flushRecoveredLocalStateRef.current = false;
        void autosave.flush();
      }
      const flushForPageExit = () => {
        void autosave.flush({ keepalive: true });
      };
      const flushWhenHidden = () => {
        if (document.visibilityState === "hidden") {
          flushForPageExit();
        }
      };
      window.addEventListener("pagehide", flushForPageExit);
      document.addEventListener("visibilitychange", flushWhenHidden);

      return function callback() {
        window.removeEventListener("pagehide", flushForPageExit);
        document.removeEventListener("visibilitychange", flushWhenHidden);
        if (isUnmountingRef.current) {
          tokenLifecycle.disposeForUnmount(autosaveLifecycle);
        } else {
          tokenLifecycle.disposeForRehydration(autosaveLifecycle);
        }
      };
    },
    [
      accountId,
      apiSession?.error,
      copy.hydrationLocalFallback,
      hydratedAccountId,
      hydratedRevision,
      stateHydrationStatus,
      status,
      tokenLifecycle,
    ],
  );

  useEffect(
    function runEffect() {
      if (!gameHydrationReady || !touchGameDeviceResolved) {
        return;
      }

      let cancelled = false;
      let cleanedUp = false;
      let destroyGamePage: (() => void) | null = null;
      const idToken = accountId ? accountTokensRef.current.get(accountId) : undefined;
      setGameStartupError(false);
      setGamePlaying(true);
      startedAtMsRef.current = Date.now();
      const pokeWindow = window as PokeLoungeWindow;
      const cleanupGamePage = () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        cancelled = true;
        setGamePlaying(false);

        destroyGamePage?.();
        gamePageHandleRef.current = null;
        delete pokeWindow.__POKE_LOUNGE_CLEANUP_FOR_TEST__;
        delete pokeWindow.__POKE_LOUNGE_E2E__;
        delete document.documentElement.dataset.pokeLoungeE2eBattle;
        setGameRuntimeMounted(false);
        pageRef.current?.classList.remove("is-game-fullscreen-fallback");
        document.body.classList.remove("is-game-fullscreen-fallback-active");
      };

      if (new URLSearchParams(window.location.search).has("e2e")) {
        pokeWindow.__POKE_LOUNGE_CLEANUP_FOR_TEST__ = cleanupGamePage;
      }

      void (async function callback() {
        try {
          const { startGamePageFromDocument } = await import("./runtime/game-page");
          if (cancelled) {
            return;
          }

          const gamePage = await startGamePageFromDocument(
            document,
            new URL(window.location.href),
            {
              accountId: accountId ?? undefined,
              idToken,
              localTestModeActive,
              getIdToken: () =>
                accountId ? (accountTokensRef.current.get(accountId) ?? idToken) : undefined,
              onGameResult: result => {
                setRuntimeState({ phase: "result" });
                setFinalResult({
                  score: result.score,
                  playTime: Math.max(1, Math.floor((Date.now() - startedAtMsRef.current) / 1000)),
                });
              },
              onRoomLeaveRequest: setLeaveRequest,
              onRuntimeStateChange: setRuntimeState,
              viewportSize: touchGameDevice
                ? MOBILE_GAME_VIEWPORT_SIZE
                : GAME_VIEWPORT_SIZE_PRESETS.large,
            },
          );

          if (cancelled) {
            gamePage.destroy();
            return;
          }

          gamePageHandleRef.current = gamePage;
          destroyGamePage = function callback() {
            if (gamePageHandleRef.current === gamePage) {
              gamePageHandleRef.current = null;
            }
            gamePage.destroy();
          };
        } catch {
          if (!cancelled) {
            setGameStartupError(true);
            setGamePlaying(false);
          }
        }
      })();

      return cleanupGamePage;
    },
    [
      accountId,
      gameHydrationReady,
      gameStartupAttempt,
      localTestModeActive,
      setGamePlaying,
      touchGameDevice,
      touchGameDeviceResolved,
    ],
  );

  const handleResultRetry = useCallback(function memoizedCallback() {
    const currentUrl = new URL(window.location.href);
    const returnsToRoomEntry = isPokeLoungeMultiplayerResultUrl(currentUrl);

    if (returnsToRoomEntry) {
      const roomEntryUrl = createPokeLoungeRoomEntryUrl(currentUrl);
      window.history.replaceState(
        null,
        "",
        `${roomEntryUrl.pathname}${roomEntryUrl.search}${roomEntryUrl.hash}`,
      );
      gamePageHandleRef.current?.destroy();
      gamePageHandleRef.current = null;
    }

    getDefaultGameStateStore().resetCompetitiveSession();
    setFinalResult(null);
    if (returnsToRoomEntry) {
      setGameStartupAttempt(function callback(attempt) {
        return attempt + 1;
      });
    }
  }, []);

  const handleResultLobby = useCallback(
    function memoizedCallback() {
      router.push("/game");
    },
    [router],
  );

  const handleGameExitConfirm = useCallback(
    function memoizedCallback() {
      resetVirtualGamepad();
      setExitConfirmationOpen(false);
      handleResultLobby();
    },
    [handleResultLobby],
  );

  return (
    <main
      ref={pageRef}
      className={`${styles.page} ${themeStyles.theme} ${touchGameDevice ? styles.touchGameDevice : ""}`}
      data-testid="poke-lounge-page"
      data-poke-lounge-ui-size={uiSize}
      data-poke-lounge-mobile-shell={touchGameDevice ? "true" : undefined}
      data-poke-lounge-room-lobby-open={runtimeState.phase === "lobby" ? "true" : undefined}
    >
      <PokeLoungeGameFrame
        copy={copy}
        gameRuntimeMounted={gameRuntimeMounted}
        roomShareAvailable={Boolean(roomShareUrl)}
        roomShareStatus={roomShareStatus}
        runtimeState={runtimeState}
        touchGameDevice={touchGameDevice}
        onOpenSettings={function handleOpenSettings() {
          return setSettingsOpen(true);
        }}
        onRoomShare={handleRoomShare}
      />
      {touchGameDevice && gameRuntimeMounted ? (
        <MobileGameShell
          activeScene={activeGameScene}
          battleUiStore={battleUiStore}
          copy={copy}
          onOpenSettings={handleMobileSettingsOpen}
          worldInput={
            runtimeState.phase === "world" || runtimeState.phase === "lobby"
              ? runtimeState.world?.input
              : undefined
          }
          worldUiStore={worldUiStore}
          settings={{
            autosaveLabel,
            connectionLabel,
            hydrationFallbackMessage: usingLocalHydrationFallback ? stateHydrationMessage : null,
            hydrationRetryDisabled,
            hydrationRetryLabel,
            localRoomShare,
            onClose: handleMobileSettingsClose,
            onExit: handleGameExitRequest,
            onRetryHydration: handleStateHydrationRetry,
            onRoomShare: handleRoomShare,
            onVolumeCycle: handleVolumeCycle,
            open: settingsOpen,
            partySlots: settingsPartySlots,
            roomShareAvailable: Boolean(roomShareUrl),
            roomShareStatus,
            roomLeaveLabel,
            volumeAriaLabel,
            volumeLabel,
          }}
        />
      ) : null}
      <PokeLoungeHydrationScreens
        copy={copy}
        message={stateHydrationMessage}
        status={stateHydrationStatus}
        touchGameDevice={touchGameDevice}
        onRetry={handleStateHydrationRetry}
      />
      {gameStartupError ? (
        <PokeLoungeStartupErrorScreen
          copy={copy}
          touchGameDevice={touchGameDevice}
          onRetry={function handleRetry() {
            return setGameStartupAttempt(function callback(attempt) {
              return attempt + 1;
            });
          }}
          onLobby={handleResultLobby}
        />
      ) : null}
      {gameRuntimeMounted && !touchGameDevice ? (
        <PokeLoungeStatusRail
          authenticated={status === "authenticated"}
          autosaveLabel={autosaveLabel}
          autosaveStatus={autosaveStatus}
          connectionLabel={connectionLabel}
          connectionStatus={connectionSummary.connectionStatus}
          copy={copy}
          hydrationMessage={stateHydrationMessage}
          hydrationRetryDisabled={hydrationRetryDisabled}
          hydrationRetryLabel={hydrationRetryLabel}
          multiplayer={Boolean(multiplayerRoomId)}
          usingLocalHydrationFallback={usingLocalHydrationFallback}
          onRetryHydration={handleStateHydrationRetry}
        />
      ) : null}
      {notice ? (
        <PokeLoungeNoticeBanner
          copy={copy}
          message={notice.message}
          tone={notice.tone}
          onClose={function handleClose() {
            return setNotice(null);
          }}
        />
      ) : null}
      {!touchGameDevice ? (
        <PokeLoungeSettingsDialog
          autosaveLabel={autosaveLabel}
          connectionLabel={connectionLabel}
          copy={copy}
          fullscreenActive={fullscreenActive}
          localRoomShare={localRoomShare}
          multiplayer={Boolean(multiplayerRoomId)}
          open={settingsOpen}
          party={settingsPartySlots}
          roomShareAvailable={Boolean(roomShareUrl)}
          roomShareStatus={roomShareStatus}
          roomLeaveLabel={roomLeaveLabel}
          uiSize={uiSize}
          uiSizeLabel={uiSizeLabel}
          volumeAriaLabel={volumeAriaLabel}
          volumeLabel={volumeLabel}
          volumeLevelIndex={volumeLevelIndex}
          onExit={handleGameExitRequest}
          onFullscreenToggle={handleFullscreenToggle}
          onOpenChange={setSettingsOpen}
          onRoomShare={handleRoomShare}
          onUiSizeToggle={handleUiSizeToggle}
          onVolumeCycle={handleVolumeCycle}
        />
      ) : null}
      <PokeLoungeDecisionDialogs
        copy={copy}
        exitOpen={exitConfirmationOpen}
        hydrationConflictOpen={Boolean(pendingHydrationResolution)}
        leaveRequest={leaveRequest}
        touchGameDevice={touchGameDevice}
        onDeferHydration={handleDeferHydrationResolution}
        onExitConfirm={handleGameExitConfirm}
        onExitOpenChange={setExitConfirmationOpen}
        onHydrationOpenChange={function handleHydrationOpenChange(open) {
          if (!open) {
            handleDeferHydrationResolution();
          }
        }}
        onLeaveOpenChange={function handleLeaveOpenChange(open) {
          if (!open) {
            setLeaveRequest(null);
          }
        }}
        onUseLocalHydration={handleUseLocalHydration}
        onUseServerHydration={handleUseServerHydration}
      />
      {finalResult ? (
        <PokeLoungeResultPanel
          copy={copy}
          playTime={finalResult.playTime}
          returnsToRoomEntry={resultReturnsToRoomEntry}
          score={finalResult.score}
          touchGameDevice={touchGameDevice}
          onLobby={handleResultLobby}
          onRetry={handleResultRetry}
        />
      ) : null}
      <div
        id="poke-lounge-accessible-status"
        className={styles.srOnly}
        role="status"
        aria-live="polite"
      >
        {accessibleGameStatus} {multiplayerRoomId ? `${connectionLabel}${sentenceEnd} ` : ""}
        {autosaveLabel}
        {sentenceEnd} {copy.accessibleHelp}
      </div>
    </main>
  );
}

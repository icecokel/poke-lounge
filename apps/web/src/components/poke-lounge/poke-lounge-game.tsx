"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGame } from "@/contexts/game-context";
import { useRouter } from "@/i18n/navigation";
import {
  getSessionApiAccountId,
  getSessionApiIdToken,
  isAuthSessionError,
  type ApiTokenSession,
} from "@/lib/auth-token";
import { getGameRanking, submitScore, type GameHistory } from "@/services/score-service";
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
} from "./runtime/game/state/defaultGameStateStore";
import { ANONYMOUS_GAME_STATE_STORAGE_SCOPE } from "./runtime/game/state/gameStateStorage";
import {
  buildPokeLoungeSaveSnapshot,
  type PokeLoungeSaveSnapshot,
} from "./runtime/game/state/poke-lounge-save-snapshot";
import { hasSamePokeLoungeLocalProgress } from "./runtime/game/state/poke-lounge-save-conflict";
import { detectTouchGameDevice } from "./runtime/game/input/mobileTouchControls";
import { GAME_SETTINGS_OPEN_EVENT } from "./runtime/game/input/settings-toggle";
import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  resetVirtualGamepad,
} from "./runtime/game/input/virtualGamepad";
import {
  GAME_VIEWPORT_SIZE_PRESETS,
  MOBILE_GAME_VIEWPORT_SIZE,
  type GameViewportDisplaySize,
  type GameViewportSizePreset,
} from "./runtime/game/gameViewport";
import {
  GAME_FULLSCREEN_STATE_EVENT,
  isGameFullscreenActive,
  toggleGameFullscreen,
} from "./runtime/web-fullscreen";
import {
  POKE_LOUNGE_NOTICE_EVENT,
  POKE_LOUNGE_ROOM_LEAVE_REQUEST_EVENT,
  type PokeLoungeNoticeDetail,
  type PokeLoungeRoomLeaveRequestDetail,
} from "./runtime/game/ui/poke-lounge-ui-events";
import {
  createPokeLoungePartySlotSummaries,
  dispatchMobileWorldUiAction,
  type PokeLoungePartySlotSummary,
} from "./runtime/game/ui/mobile-world-ui";
import { hasPokeLoungeMobileFullscreenScene } from "./runtime/game/ui/mobile-ui-capability";
import { getPokeLoungeCopy } from "./poke-lounge-copy";
import { PokeLoungePartySlotMenu } from "./party-slot-menu";
import {
  createPokeLoungeRoomEntryUrl,
  isPokeLoungeMultiplayerResultUrl,
} from "./poke-lounge-result-navigation";
import { MobileGameShell } from "./mobile/mobile-game-shell";
import styles from "./poke-lounge.module.css";

type PokeLoungeWindow = Window & {
  __POKE_LOUNGE_GAME__?: { destroy: (removeCanvas?: boolean) => void };
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

const POKE_LOUNGE_DEFAULT_VOLUME = 0.3;
const POKE_LOUNGE_VOLUME_STEPS = [0, 0.25, POKE_LOUNGE_DEFAULT_VOLUME, 0.75, 0.8, 1] as const;
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
type PokeLoungeStateHydrationStatus =
  "pending" | "ready" | "local-ready" | "conflict" | "unavailable";
type PokeLoungeRankingStatus = "idle" | "loading" | "ready" | "error";
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

function createPokeLoungeRoomShareUrlFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return createPokeLoungeRoomShareUrl(new URL(window.location.href));
}

function createPokeLoungeRoomShareUrl(currentUrl: URL): string | null {
  const network = currentUrl.searchParams.get("network");
  const roomCode = currentUrl.searchParams.get("room");

  if ((network !== "local" && network !== "server") || !roomCode) {
    return null;
  }

  const shareUrl = new URL(currentUrl.href);
  shareUrl.searchParams.set("network", network);
  shareUrl.searchParams.set("room", roomCode);
  shareUrl.searchParams.delete("create");
  shareUrl.searchParams.delete("e2e");
  shareUrl.searchParams.delete("e2eBattle");
  shareUrl.searchParams.delete("scene");

  return shareUrl.href;
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

function getRankingDisplayName(entry: GameHistory, fallbackName: string): string {
  return entry.user.displayName.trim() || fallbackName;
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
  const [gameCanvasMounted, setGameCanvasMounted] = useState(false);
  const [activeGameScene, setActiveGameScene] = useState<"battle" | "world" | null>(null);
  const [settingsPartySlots, setSettingsPartySlots] = useState<PokeLoungePartySlotSummary[]>([]);
  const [volumeLevelIndex, setVolumeLevelIndex] = useState(POKE_LOUNGE_DEFAULT_VOLUME_LEVEL_INDEX);
  const [uiSize, setUiSize] = useState<PokeLoungeUiSize>("large");
  const [roomShareStatus, setRoomShareStatus] = useState<PokeLoungeRoomShareStatus>("idle");
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "auth" | "error"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState<string>("");
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
  const [rankingStatus, setRankingStatus] = useState<PokeLoungeRankingStatus>("idle");
  const [rankingAttempt, setRankingAttempt] = useState(0);
  const [ranking, setRanking] = useState<GameHistory[]>([]);
  const [gameStartupAttempt, setGameStartupAttempt] = useState(0);
  const [gameStartupError, setGameStartupError] = useState(false);
  const volumeValue = POKE_LOUNGE_VOLUME_STEPS[volumeLevelIndex];
  const volumePercent = Math.round(volumeValue * 100);
  const volumeLabel = volumePercent === 0 ? copy.volumeMuted : copy.volumeLabel(volumePercent);
  const volumeAriaLabel = copy.volumeAriaLabel(volumePercent);
  const uiSizeLabel = uiSize === "large" ? copy.uiLarge : copy.uiNormal;
  const roomShareUrl = settingsOpen ? createPokeLoungeRoomShareUrlFromLocation() : null;
  const localRoomShare =
    Boolean(roomShareUrl) &&
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("network") === "local";
  const multiplayerRoomId =
    connectionSummary.roomId && connectionSummary.roomId !== "local-preview"
      ? connectionSummary.roomId
      : null;
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
  const resultRequiresAuthentication =
    status !== "authenticated" || !sessionToken || isAuthSessionError(apiSession?.error);
  const resultReturnsToRoomEntry =
    Boolean(finalResult) &&
    typeof window !== "undefined" &&
    isPokeLoungeMultiplayerResultUrl(new URL(window.location.href));

  const syncFullscreenState = useCallback(() => {
    const page = pageRef.current;
    setFullscreenActive(page ? isGameFullscreenActive(page) : false);
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    const page = pageRef.current;
    if (!page) {
      return;
    }

    void toggleGameFullscreen(page).finally(syncFullscreenState);
  }, [syncFullscreenState]);

  const handleMobileSettingsOpen = useCallback(() => {
    resetVirtualGamepad();
    setSettingsOpen(true);
  }, []);

  const handleMobileSettingsClose = useCallback(() => {
    resetVirtualGamepad();
    setSettingsOpen(false);
  }, []);

  const handleGameExitRequest = useCallback(() => {
    resetVirtualGamepad();
    setSettingsOpen(false);

    if (gamePageHandleRef.current?.requestRoomLeave()) {
      return;
    }

    setExitConfirmationOpen(true);
  }, []);

  const handleVolumeCycle = useCallback(() => {
    setVolumeLevelIndex(currentIndex => (currentIndex + 1) % POKE_LOUNGE_VOLUME_STEPS.length);
  }, []);

  const handleUiSizeToggle = useCallback(() => {
    setUiSize(currentSize => (currentSize === "large" ? "normal" : "large"));
  }, []);

  const handleStateHydrationRetry = useCallback(() => {
    if (stateHydrationStatus !== "local-ready") {
      setStateHydrationAttempt(attempt => attempt + 1);
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
      setStateHydrationAttempt(attempt => attempt + 1);
      return;
    }

    const retryStorageScope = createAuthenticatedGameStateStorageScope(retryAccountId);
    setStateHydrationRetrying(true);
    void tokenLifecycle
      .runHydration(() => loadPokeLoungeState(token))
      .then(result => {
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
      .finally(() => {
        if (latestAccountIdRef.current === retryAccountId) {
          setStateHydrationRetrying(false);
        }
      });
  }, [
    accountId,
    apiSession?.error,
    copy.hydrationLocalFallback,
    multiplayerRoomId,
    stateHydrationStatus,
    status,
    tokenLifecycle,
  ]);

  const handleUseServerHydration = useCallback(() => {
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
  }, [pendingHydrationResolution]);

  const handleUseLocalHydration = useCallback(() => {
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
  }, [pendingHydrationResolution]);

  const handleDeferHydrationResolution = useCallback(() => {
    setPendingHydrationResolution(null);
    setStateHydrationMessage(copy.hydrationLocalFallback);
    setStateHydrationStatus("local-ready");
  }, [copy.hydrationLocalFallback]);

  const handleRoomShare = useCallback(async () => {
    const shareUrl = createPokeLoungeRoomShareUrlFromLocation();

    if (!shareUrl || !navigator.clipboard?.writeText) {
      setRoomShareStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setRoomShareStatus("success");
    } catch {
      setRoomShareStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      setRoomShareStatus("idle");
    }
  }, [settingsOpen]);

  useEffect(() => {
    const storedVolumeLevelIndex = readStoredVolumeLevelIndex();
    const storedUiSize = readStoredUiSize();

    if (storedVolumeLevelIndex !== null) {
      setVolumeLevelIndex(storedVolumeLevelIndex);
    }
    if (storedUiSize) {
      setUiSize(storedUiSize);
    }
  }, []);

  useEffect(() => {
    setPokeLoungeMasterVolume(POKE_LOUNGE_VOLUME_STEPS[volumeLevelIndex]);
    window.localStorage.setItem(POKE_LOUNGE_VOLUME_STORAGE_KEY, String(volumeLevelIndex));
  }, [volumeLevelIndex]);

  useEffect(() => {
    return () => {
      setPokeLoungeMasterVolume(1);
    };
  }, []);

  const gameViewportSize = touchGameDevice
    ? MOBILE_GAME_VIEWPORT_SIZE
    : GAME_VIEWPORT_SIZE_PRESETS[uiSize];

  useEffect(() => {
    if (touchGameDeviceResolved) {
      gamePageHandleRef.current?.setViewportSize(gameViewportSize);
    }
    window.sessionStorage.setItem(POKE_LOUNGE_UI_SIZE_STORAGE_KEY, uiSize);
  }, [gameViewportSize, touchGameDeviceResolved, uiSize]);

  useEffect(() => {
    const store = getDefaultGameStateStore();
    const syncConnectionSummary = () => {
      const sessionState = store.getState().session;
      setConnectionSummary(current => {
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

  useEffect(() => {
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
  }, [settingsOpen]);

  useEffect(() => {
    const handleLeaveRequest = (event: Event) => {
      const requestEvent = event as CustomEvent<PokeLoungeRoomLeaveRequestDetail>;
      requestEvent.preventDefault();
      setLeaveRequest(requestEvent.detail);
    };
    const handleNotice = (event: Event) => {
      setNotice((event as CustomEvent<PokeLoungeNoticeDetail>).detail);
    };

    document.addEventListener(POKE_LOUNGE_ROOM_LEAVE_REQUEST_EVENT, handleLeaveRequest);
    document.addEventListener(POKE_LOUNGE_NOTICE_EVENT, handleNotice);

    return () => {
      document.removeEventListener(POKE_LOUNGE_ROOM_LEAVE_REQUEST_EVENT, handleLeaveRequest);
      document.removeEventListener(POKE_LOUNGE_NOTICE_EVENT, handleNotice);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    let cancelled = false;
    setRankingStatus("loading");
    void getGameRanking("POKE_LOUNGE")
      .then(rows => {
        if (cancelled) {
          return;
        }

        setRanking(rows.slice(0, 5));
        setRankingStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setRanking([]);
          setRankingStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rankingAttempt, settingsOpen]);

  useEffect(() => {
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

  useEffect(() => {
    const gameRoot = pageRef.current?.querySelector<HTMLElement>("#game-root");

    if (!gameRoot) {
      return;
    }

    const syncGameCanvasState = () => {
      const canvas = gameRoot.querySelector("canvas");
      const resourceStatus = gameRoot.dataset.pokeLoungeResourceStatus;
      const isGameReady = Boolean(canvas) && resourceStatus === "ready";
      setGameCanvasMounted(isGameReady);
      setActiveGameScene(
        isGameReady
          ? gameRoot.dataset.pokeLoungeActiveScene === "battle"
            ? "battle"
            : "world"
          : null,
      );

      if (!canvas) {
        return;
      }

      if (resourceStatus === "error") {
        setGameStartupError(true);
        setGamePlaying(false);
      }

      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", copy.gameCanvasLabel);
      canvas.setAttribute("aria-describedby", "poke-lounge-accessible-status");
      canvas.setAttribute(
        "aria-keyshortcuts",
        "ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space H Escape",
      );
      canvas.tabIndex = 0;
      if (canvas.textContent !== copy.gameCanvasFallback) {
        canvas.textContent = copy.gameCanvasFallback;
      }
    };

    syncGameCanvasState();

    const observer = new MutationObserver(syncGameCanvasState);
    observer.observe(gameRoot, {
      attributes: true,
      attributeFilter: ["data-poke-lounge-active-scene", "data-poke-lounge-resource-status"],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [copy, setGamePlaying]);

  useEffect(() => {
    const page = pageRef.current;
    const parent = page?.parentElement;

    if (!page || !parent) {
      return;
    }

    const updateContainerSize = () => {
      if (
        document.fullscreenElement === page ||
        page.classList.contains("is-game-fullscreen-fallback")
      ) {
        page.style.setProperty(POKE_LOUNGE_CONTAINER_WIDTH_VAR, `${window.innerWidth}px`);
        page.style.setProperty(POKE_LOUNGE_CONTAINER_HEIGHT_VAR, `${window.innerHeight}px`);
        return;
      }

      const parentRect = parent.getBoundingClientRect();
      const parentStyle = window.getComputedStyle(parent);
      const paddingLeft = Number.parseFloat(parentStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(parentStyle.paddingRight) || 0;
      const paddingTop = Number.parseFloat(parentStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(parentStyle.paddingBottom) || 0;
      const visibleLeft = Math.max(parentRect.left + paddingLeft, 0);
      const visibleRight = Math.min(parentRect.right - paddingRight, window.innerWidth);
      const visibleTop = Math.max(parentRect.top + paddingTop, 0);
      const visibleBottom = Math.min(parentRect.bottom - paddingBottom, window.innerHeight);
      const width = Math.max(0, visibleRight - visibleLeft);
      const height = Math.max(0, visibleBottom - visibleTop);

      page.style.setProperty(POKE_LOUNGE_CONTAINER_WIDTH_VAR, `${Math.floor(width)}px`);
      page.style.setProperty(POKE_LOUNGE_CONTAINER_HEIGHT_VAR, `${Math.floor(height)}px`);
    };

    updateContainerSize();

    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(parent);
    window.addEventListener("resize", updateContainerSize);
    window.visualViewport?.addEventListener("resize", updateContainerSize);
    document.addEventListener("fullscreenchange", updateContainerSize);
    document.addEventListener(GAME_FULLSCREEN_STATE_EVENT, updateContainerSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateContainerSize);
      window.visualViewport?.removeEventListener("resize", updateContainerSize);
      document.removeEventListener("fullscreenchange", updateContainerSize);
      document.removeEventListener(GAME_FULLSCREEN_STATE_EVENT, updateContainerSize);
      page.style.removeProperty(POKE_LOUNGE_CONTAINER_WIDTH_VAR);
      page.style.removeProperty(POKE_LOUNGE_CONTAINER_HEIGHT_VAR);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenStateChange = () => syncFullscreenState();

    document.addEventListener("fullscreenchange", handleFullscreenStateChange);
    document.addEventListener(GAME_FULLSCREEN_STATE_EVENT, handleFullscreenStateChange);
    syncFullscreenState();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenStateChange);
      document.removeEventListener(GAME_FULLSCREEN_STATE_EVENT, handleFullscreenStateChange);
    };
  }, [syncFullscreenState]);

  useEffect(() => {
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
        dispatchMobileWorldUiAction(document, { type: "close" });
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
        !pageRef.current?.querySelector("canvas")
      ) {
        return;
      }

      // Radix dialogs also handle Escape during this event's bubble phase.
      // Mounting the settings dialog synchronously here would let the same
      // keydown immediately close the newly mounted dialog.
      if (pendingSettingsOpen !== null) {
        window.clearTimeout(pendingSettingsOpen);
      }
      pendingSettingsOpen = window.setTimeout(() => {
        pendingSettingsOpen = null;
        if (!hasOpenModalDialog(document) && pageRef.current?.querySelector("canvas")) {
          setSettingsOpen(true);
        }
      }, 0);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (pendingSettingsOpen !== null) {
        window.clearTimeout(pendingSettingsOpen);
      }
    };
  }, [handleMobileSettingsClose, settingsOpen, touchGameDevice]);

  useEffect(() => {
    const handleSettingsOpen = () => {
      resetVirtualGamepad();
      setSettingsOpen(true);
    };

    document.addEventListener(GAME_SETTINGS_OPEN_EVENT, handleSettingsOpen);

    return () => {
      document.removeEventListener(GAME_SETTINGS_OPEN_EVENT, handleSettingsOpen);
    };
  }, []);

  useEffect(() => {
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

    void tokenLifecycle.runHydration(async () => {
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

    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    apiSession?.error,
    copy.hydrationIdentityError,
    copy.hydrationConflictDescription,
    copy.hydrationLocalFallback,
    stateHydrationAttempt,
    status,
    tokenLifecycle,
  ]);

  useEffect(() => {
    isUnmountingRef.current = false;

    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  useEffect(() => {
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

    return () => {
      window.removeEventListener("pagehide", flushForPageExit);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (isUnmountingRef.current) {
        tokenLifecycle.disposeForUnmount(autosaveLifecycle);
      } else {
        tokenLifecycle.disposeForRehydration(autosaveLifecycle);
      }
    };
  }, [
    accountId,
    apiSession?.error,
    copy.hydrationLocalFallback,
    hydratedAccountId,
    hydratedRevision,
    stateHydrationStatus,
    status,
    tokenLifecycle,
  ]);

  useEffect(() => {
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

      if (destroyGamePage) {
        destroyGamePage();
      } else {
        pokeWindow.__POKE_LOUNGE_GAME__?.destroy(true);
      }
      gamePageHandleRef.current = null;
      delete pokeWindow.__POKE_LOUNGE_GAME__;
      delete pokeWindow.__POKE_LOUNGE_CLEANUP_FOR_TEST__;
      delete pokeWindow.__POKE_LOUNGE_E2E__;
      delete document.documentElement.dataset.pokeLoungeE2eBattle;
      setGameCanvasMounted(false);
      pageRef.current?.classList.remove("is-game-fullscreen-fallback");
      document.body.classList.remove("is-game-fullscreen-fallback-active");
      document.querySelector<HTMLElement>("#game-root")?.replaceChildren();
    };

    if (new URLSearchParams(window.location.search).has("e2e")) {
      pokeWindow.__POKE_LOUNGE_CLEANUP_FOR_TEST__ = cleanupGamePage;
    }

    void (async () => {
      try {
        const { startGamePageFromDocument } = await import("./runtime/game-page");
        if (cancelled) {
          return;
        }

        const gamePage = await startGamePageFromDocument(document, new URL(window.location.href), {
          accountId: accountId ?? undefined,
          idToken,
          localTestModeActive,
          getIdToken: () =>
            accountId ? (accountTokensRef.current.get(accountId) ?? idToken) : undefined,
          onGameResult: result => {
            setFinalResult({
              score: result.score,
              playTime: Math.max(1, Math.floor((Date.now() - startedAtMsRef.current) / 1000)),
            });
            setSubmitStatus("idle");
            setSubmitMessage("");
          },
          renderMobileControls: false,
          viewportSize: touchGameDevice
            ? MOBILE_GAME_VIEWPORT_SIZE
            : GAME_VIEWPORT_SIZE_PRESETS.large,
        });

        if (cancelled) {
          gamePage.destroy();
          return;
        }

        gamePageHandleRef.current = gamePage;
        destroyGamePage = () => {
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
  }, [
    accountId,
    gameHydrationReady,
    gameStartupAttempt,
    localTestModeActive,
    setGamePlaying,
    touchGameDevice,
    touchGameDeviceResolved,
  ]);

  const handleSubmitResult = useCallback(async () => {
    if (!finalResult || submitStatus === "submitting" || submitStatus === "success") {
      return;
    }

    const apiSession = session as ApiTokenSession | null;
    const token = getSessionApiIdToken(apiSession, Date.now(), {
      allowLocalTestMode: true,
    });

    if (status !== "authenticated" || !token || isAuthSessionError(apiSession?.error)) {
      setSubmitStatus("auth");
      setSubmitMessage(copy.resultAuthRequired);
      return;
    }

    setSubmitStatus("submitting");
    setSubmitMessage(copy.resultSubmitting);

    const result = await submitScore(
      {
        gameName: "poke-lounge",
        score: finalResult.score,
        playTime: finalResult.playTime,
      },
      token,
    );

    if (result.success) {
      setSubmitStatus("success");
      setSubmitMessage(copy.resultSaved);
      return;
    }

    setSubmitStatus(result.requiresAuth ? "auth" : "error");
    setSubmitMessage(result.requiresAuth ? copy.resultAuthRequired : copy.resultSaveFailed);
  }, [copy, finalResult, session, status, submitStatus]);

  const handleResultRetry = useCallback(() => {
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
    setSubmitStatus("idle");
    setSubmitMessage("");
    if (returnsToRoomEntry) {
      setGameStartupAttempt(attempt => attempt + 1);
    }
  }, []);

  const handleResultLobby = useCallback(() => {
    router.push("/game");
  }, [router]);

  const handleGameExitConfirm = useCallback(() => {
    resetVirtualGamepad();
    setExitConfirmationOpen(false);
    handleResultLobby();
  }, [handleResultLobby]);

  return (
    <main
      ref={pageRef}
      className={`${styles.page} ${touchGameDevice ? styles.touchGameDevice : ""} phaser-game-page`}
      data-testid="poke-lounge-page"
      data-poke-lounge-ui-size={uiSize}
      data-poke-lounge-mobile-shell={touchGameDevice ? "true" : undefined}
    >
      <div
        className={styles.gameFrame}
        data-poke-lounge-game-frame="true"
        data-poke-lounge-mobile-screen={touchGameDevice ? "top" : undefined}
        data-poke-lounge-canvas-mounted={gameCanvasMounted}
      >
        <div
          id="game-root"
          role="region"
          aria-label={copy.gameRegionLabel}
          aria-describedby="poke-lounge-accessible-status"
          data-testid="poke-lounge-game-root"
        />
        {!touchGameDevice && gameCanvasMounted ? (
          <button
            type="button"
            className={styles.desktopSettingsButton}
            onClick={() => setSettingsOpen(true)}
            aria-label={copy.settingsOpenLabel}
            data-poke-lounge-desktop-settings-toggle="true"
          >
            ⚙
          </button>
        ) : null}
      </div>
      {touchGameDevice && gameCanvasMounted ? (
        <MobileGameShell
          activeScene={activeGameScene}
          copy={copy}
          onOpenSettings={handleMobileSettingsOpen}
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
            onRetryRanking: () => setRankingAttempt(attempt => attempt + 1),
            onRoomShare: handleRoomShare,
            onVolumeCycle: handleVolumeCycle,
            open: settingsOpen,
            partySlots: settingsPartySlots,
            ranking: ranking.map(entry => ({
              id: `${entry.rank}-${entry.createdAt}`,
              name: getRankingDisplayName(entry, copy.unknownTrainer),
              rank: entry.rank,
              score: entry.score,
            })),
            rankingStatus,
            roomShareAvailable: Boolean(roomShareUrl),
            roomShareStatus,
            volumeAriaLabel,
            volumeLabel,
          }}
        />
      ) : null}
      {stateHydrationStatus === "pending" ? (
        <section className={styles.loadingOverlay} role="status" aria-live="polite">
          <p className={styles.resultEyebrow}>Poke Lounge</p>
          <p className={styles.resultStatus}>{copy.hydrationLoading}</p>
        </section>
      ) : null}
      {stateHydrationStatus === "unavailable" ? (
        <section
          className={touchGameDevice ? styles.mobileStateScreen : styles.resultOverlay}
          data-testid="poke-lounge-state-hydration-error"
        >
          <p className={styles.resultStatus} aria-live="polite">
            {stateHydrationMessage}
          </p>
          <Button
            type="button"
            onClick={handleStateHydrationRetry}
            data-testid="poke-lounge-state-hydration-retry"
          >
            {copy.hydrationRetry}
          </Button>
        </section>
      ) : null}
      {gameStartupError ? (
        <section
          className={touchGameDevice ? styles.mobileStateScreen : styles.loadingOverlay}
          role="alert"
          data-testid="poke-lounge-startup-error"
        >
          <p className={styles.resultEyebrow}>Poke Lounge</p>
          <h2 className={styles.startupErrorTitle}>{copy.startup.title}</h2>
          <p className={styles.resultStatus}>{copy.startup.description}</p>
          <div className={styles.resultActions}>
            <Button
              type="button"
              onClick={() => setGameStartupAttempt(attempt => attempt + 1)}
              data-testid="poke-lounge-startup-retry"
            >
              {copy.startup.retry}
            </Button>
            <Button type="button" variant="outline" onClick={handleResultLobby}>
              {copy.resultLobby}
            </Button>
          </div>
        </section>
      ) : null}
      {gameCanvasMounted && !touchGameDevice ? (
        <aside
          className={styles.statusRail}
          aria-label={copy.statusRailLabel}
          data-poke-lounge-status-rail="true"
        >
          {multiplayerRoomId ? (
            <p
              className={styles.statusChip}
              data-tone={connectionSummary.connectionStatus === "online" ? "success" : "warning"}
              data-poke-lounge-connection-status={connectionSummary.connectionStatus}
            >
              {connectionLabel}
            </p>
          ) : null}
          <p
            className={styles.statusChip}
            data-tone={
              usingLocalHydrationFallback
                ? "warning"
                : autosaveStatus === "error"
                  ? "error"
                  : "neutral"
            }
            data-poke-lounge-save-status={
              usingLocalHydrationFallback || status !== "authenticated" ? "local" : autosaveStatus
            }
          >
            {autosaveLabel}
          </p>
          {usingLocalHydrationFallback ? (
            <div
              className={`${styles.statusChip} ${styles.hydrationFallbackChip}`}
              data-tone="warning"
              role="status"
              data-testid="poke-lounge-state-hydration-local-fallback"
            >
              <span>{stateHydrationMessage}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={styles.hydrationFallbackRetry}
                onClick={handleStateHydrationRetry}
                disabled={hydrationRetryDisabled}
                data-testid="poke-lounge-state-hydration-retry"
              >
                {hydrationRetryLabel}
              </Button>
            </div>
          ) : null}
        </aside>
      ) : null}
      {notice ? (
        <aside
          className={styles.noticeBanner}
          data-tone={notice.tone}
          role={notice.tone === "error" ? "alert" : "status"}
          data-poke-lounge-notice="true"
        >
          <p>{notice.message}</p>
          <Button type="button" variant="outline" onClick={() => setNotice(null)}>
            {copy.noticeConfirm}
          </Button>
        </aside>
      ) : null}
      {!touchGameDevice ? (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent
            className={styles.settingsDialog}
            showCloseButton={false}
            data-poke-lounge-settings="true"
          >
            <DialogHeader className={styles.settingsHeader}>
              <DialogTitle className={styles.settingsTitle}>{copy.settingsTitle}</DialogTitle>
              <DialogDescription className={styles.settingsDescription}>
                {copy.settingsDescription}
              </DialogDescription>
            </DialogHeader>
            <div className={styles.settingsOptions}>
              <Button
                type="button"
                variant="outline"
                className={styles.settingsOptionButton}
                onClick={handleFullscreenToggle}
                aria-label={fullscreenActive ? copy.fullscreenOff : copy.fullscreenOn}
                aria-pressed={fullscreenActive}
                data-fullscreen-toggle="true"
                data-fullscreen-toggle-placement="settings"
                data-poke-lounge-setting-option="true"
                data-poke-lounge-setting-action="fullscreen"
              >
                {copy.settingsFullscreen}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={styles.settingsOptionButton}
                onClick={handleVolumeCycle}
                aria-label={volumeAriaLabel}
                data-poke-lounge-setting-option="true"
                data-poke-lounge-setting-action="volume"
                data-poke-lounge-volume-level={volumeLevelIndex}
              >
                {volumeLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={styles.settingsOptionButton}
                onClick={handleUiSizeToggle}
                aria-label={copy.settingsUiSizeAria}
                aria-pressed={uiSize === "large"}
                data-poke-lounge-setting-option="true"
                data-poke-lounge-setting-action="ui-size"
                data-poke-lounge-ui-size={uiSize}
              >
                {uiSizeLabel}
              </Button>
              {roomShareUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className={styles.settingsOptionButton}
                  onClick={handleRoomShare}
                  aria-label={localRoomShare ? copy.settingsLocalShare : copy.settingsShare}
                  data-poke-lounge-setting-option="true"
                  data-poke-lounge-setting-action="share-link"
                >
                  {roomShareStatus === "success"
                    ? copy.settingsShareCopied
                    : roomShareStatus === "error"
                      ? copy.settingsShareFailed
                      : localRoomShare
                        ? copy.settingsLocalShare
                        : copy.settingsShare}
                </Button>
              ) : null}
              {localRoomShare ? (
                <p
                  className={styles.settingsDescription}
                  data-poke-lounge-local-share-notice="true"
                >
                  {copy.roomEntry.localDescription}
                </p>
              ) : null}
              <div className={styles.settingsStateSummary} aria-live="polite">
                <span>{multiplayerRoomId ? connectionLabel : copy.settingsSolo}</span>
                <span>{autosaveLabel}</span>
              </div>
              <PokeLoungePartySlotMenu copy={copy} party={settingsPartySlots} />
              <section
                className={styles.rankingSection}
                aria-labelledby="poke-lounge-ranking-title"
              >
                <div className={styles.rankingHeader}>
                  <h3 id="poke-lounge-ranking-title">{copy.settingsRankingTitle}</h3>
                  <span>{copy.settingsRankingCaption}</span>
                </div>
                {rankingStatus === "loading" ? (
                  <p className={styles.rankingEmpty}>{copy.settingsRankingLoading}</p>
                ) : rankingStatus === "error" ? (
                  <div className={styles.rankingEmpty}>
                    <p>{copy.settingsRankingError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRankingAttempt(attempt => attempt + 1)}
                    >
                      {copy.settingsRankingRetry}
                    </Button>
                  </div>
                ) : ranking.length === 0 ? (
                  <p className={styles.rankingEmpty}>{copy.settingsRankingEmpty}</p>
                ) : (
                  <ol className={styles.rankingList}>
                    {ranking.map(entry => (
                      <li key={`${entry.rank}-${entry.createdAt}`}>
                        <span>#{entry.rank}</span>
                        <strong>{getRankingDisplayName(entry, copy.unknownTrainer)}</strong>
                        <b>{entry.score.toLocaleString(copy.locale)}</b>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <Button
                type="button"
                variant="destructive"
                className={styles.settingsOptionButton}
                onClick={handleGameExitRequest}
                data-poke-lounge-setting-option="true"
                data-poke-lounge-game-exit="true"
              >
                {copy.settingsExit}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={styles.settingsOptionButton}
                onClick={() => setSettingsOpen(false)}
                data-poke-lounge-setting-option="true"
                data-poke-lounge-settings-cancel="true"
              >
                {copy.settingsClose}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <AlertDialog
        open={Boolean(pendingHydrationResolution)}
        onOpenChange={open => {
          if (!open) {
            handleDeferHydrationResolution();
          }
        }}
      >
        <AlertDialogContent
          className={touchGameDevice ? styles.mobileDecisionSheet : styles.confirmDialog}
          data-testid="poke-lounge-state-hydration-conflict"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.hydrationConflictTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.hydrationConflictDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeferHydrationResolution}>
              {copy.hydrationDecideLater}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleUseLocalHydration}
              data-testid="poke-lounge-state-hydration-use-local"
            >
              {copy.hydrationUseLocal}
            </Button>
            <Button
              type="button"
              onClick={handleUseServerHydration}
              data-testid="poke-lounge-state-hydration-use-server"
            >
              {copy.hydrationUseServer}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={exitConfirmationOpen} onOpenChange={setExitConfirmationOpen}>
        <AlertDialogContent
          className={touchGameDevice ? styles.mobileDecisionSheet : styles.confirmDialog}
          data-poke-lounge-game-exit-dialog="true"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.exitTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.exitDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.exitContinue}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleGameExitConfirm}
              data-poke-lounge-game-exit-confirm="true"
            >
              {copy.exitConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(leaveRequest)}
        onOpenChange={open => {
          if (!open) {
            setLeaveRequest(null);
          }
        }}
      >
        <AlertDialogContent
          className={touchGameDevice ? styles.mobileDecisionSheet : styles.confirmDialog}
          data-poke-lounge-leave-dialog="true"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{leaveRequest?.title ?? copy.leaveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveRequest?.description ?? copy.leaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.leaveContinue}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const request = leaveRequest;
                setLeaveRequest(null);
                request?.confirm();
              }}
            >
              {copy.leaveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {finalResult ? (
        <section
          className={touchGameDevice ? styles.mobileResultScreen : styles.resultOverlay}
          data-testid="poke-lounge-result-panel"
        >
          <p className={styles.resultEyebrow}>{copy.resultEyebrow}</p>
          <div className={styles.resultScore} data-testid="poke-lounge-result-score">
            {finalResult.score}
          </div>
          <p className={styles.resultMeta}>{copy.resultPlayTime(finalResult.playTime)}</p>
          <p className={styles.resultStatus}>{copy.resultUnranked}</p>
          <Button
            type="button"
            onClick={handleSubmitResult}
            disabled={
              resultRequiresAuthentication ||
              submitStatus === "submitting" ||
              submitStatus === "success"
            }
            data-testid="poke-lounge-result-submit"
          >
            {submitStatus === "submitting" ? copy.resultSaving : copy.resultSave}
          </Button>
          <p
            className={styles.resultStatus}
            data-testid="poke-lounge-result-status"
            aria-live="polite"
          >
            {resultRequiresAuthentication ? copy.resultAuthRequired : submitMessage}
          </p>
          <div className={styles.resultActions}>
            <Button
              type="button"
              variant="outline"
              onClick={handleResultRetry}
              data-testid="poke-lounge-result-retry"
            >
              {resultReturnsToRoomEntry ? copy.resultRoomEntry : copy.resultRetry}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleResultLobby}
              data-testid="poke-lounge-result-lobby"
            >
              {copy.resultLobby}
            </Button>
          </div>
        </section>
      ) : null}
      <div
        id="poke-lounge-accessible-status"
        className={styles.srOnly}
        role="status"
        aria-live="polite"
      >
        {accessibleGameStatus} {multiplayerRoomId ? `${connectionLabel}. ` : ""}
        {autosaveLabel}. {copy.accessibleHelp}
      </div>
    </main>
  );
}

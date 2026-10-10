"use client";

import { useGame } from "@/contexts/game-context";
import { hydrateGameProgress } from "@/features/poke-lounge/application/persistence/hydrate-game-progress";
import { useRouter } from "@/i18n/navigation";
import { reportClientDiagnostic } from "@/lib/client-diagnostics";
import {
  getSessionApiAccountId,
  getSessionApiIdToken,
  isAuthSessionError,
  type ApiTokenSession,
} from "@/lib/auth-token";
import { useLocalTestSession } from "@/lib/use-local-test-session";
import { cn } from "@/lib/utils";
import { loadPokeLoungeState } from "@/services/poke-lounge-state-service";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MobileGameShell } from "./mobile/mobile-game-shell";
import { bindMobileViewport } from "./mobile/mobile-viewport";
import {
  createPokeLoungeAutosaveLifecycle,
  getPokeLoungeTokenLifecycle,
  startPokeLoungeAutosave,
  type PokeLoungeAutosaveStatus,
} from "./poke-lounge-autosave";
import { getPokeLoungeCopy } from "./poke-lounge-copy";
import { STARTUP_ERROR_CODES, type PokeLoungeErrorCode } from "./poke-lounge-error-codes";
import { PokeLoungeGameFrame } from "./poke-lounge-game-frame";
import {
  PokeLoungeDecisionDialogs,
  PokeLoungeHydrationScreens,
  PokeLoungeNoticeBanner,
  PokeLoungeResultPanel,
  PokeLoungeStartupErrorScreen,
  type PokeLoungeStateHydrationStatus,
} from "./poke-lounge-game-overlays";
import { createPokeLoungeRoomEntryUrl } from "./poke-lounge-result-navigation";
import {
  POKE_LOUNGE_VOLUME_STEPS,
  createDefaultPokeLoungeSettings,
  getPokeLoungeVolumeLevelIndex,
  readPokeLoungeSettings,
  writePokeLoungeSettings,
  type PokeLoungeSettings,
} from "./poke-lounge-settings-storage";
import { setPokeLoungeMasterVolume } from "./runtime/game/audio/poke-lounge-audio";
import type { PokeLoungeRuntimeState } from "./runtime/game/game-page-state";
import type { GamePageHandle } from "./runtime/game/game-page-startup";
import { MOBILE_GAME_VIEWPORT_SIZE } from "./runtime/game/game-viewport";
import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  resetVirtualGamepad,
} from "./runtime/game/input/virtual-gamepad";
import { createRoomShareUrl, type RoomEntryIntent } from "./runtime/game/network/room-entry";
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
import { isLocalTestModeUrl } from "./runtime/game/local-test-mode";
import { hasPokeLoungeMobileFullscreenScene } from "./runtime/game/ui/mobile-ui-capability";
import {
  createPokeLoungePartySlotSummaries,
  type PokeLoungePartySlotSummary,
} from "./runtime/game/ui/mobile-world-ui";
import {
  POKE_LOUNGE_NOTICE_EVENT,
  type PokeLoungeNoticeDetail,
  type PokeLoungeRoomLeaveRequestDetail,
} from "./runtime/game/ui/poke-lounge-ui-events";
import { GAME_FULLSCREEN_STATE_EVENT } from "./runtime/web-fullscreen";
import { usePokeLoungeAccessibleStatus } from "./use-poke-lounge-accessible-status";

interface FinalResultState {
  score: number;
  playTime: number;
}

interface PendingHydrationResolution {
  accountId: string;
  revision: number;
  snapshot: PokeLoungeSaveSnapshot;
}

let activeGameStateStorageScope: string = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
const OPEN_MODAL_DIALOG_SELECTOR = [
  "dialog[open]",
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
].join(",");

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

function createPokeLoungeRoomShareUrlFromLocation(roomEntry: RoomEntryIntent): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return createRoomShareUrl(new URL(window.location.href), roomEntry);
}

export function PokeLoungeGame() {
  const { setGamePlaying } = useGame();
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status } = useLocalTestSession();
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
  const [activeGameScene, setActiveGameScene] = useState<"battle" | "world" | null>(null);
  const accessibleGameStatus = usePokeLoungeAccessibleStatus(locale, activeGameScene);
  const pageRef = useRef<HTMLElement>(null);
  const viewportUpdateRef = useRef<(() => void) | null>(null);
  const gamePageHandleRef = useRef<GamePageHandle | null>(null);
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
  useEffect(() => {
    const closeOverlays = () => {
      setSettingsOpen(false);
      setExitConfirmationOpen(false);
      resetVirtualGamepad();
    };
    document.addEventListener("poke-lounge:tournament-gathering", closeOverlays);
    return () => document.removeEventListener("poke-lounge:tournament-gathering", closeOverlays);
  }, []);
  const [gameRuntimeMounted, setGameRuntimeMounted] = useState(false);
  const [settingsPartySlots, setSettingsPartySlots] = useState<PokeLoungePartySlotSummary[]>([]);
  const [settings, setSettings] = useState<PokeLoungeSettings>(createDefaultPokeLoungeSettings);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [localAudioOverride, setLocalAudioOverride] = useState(false);
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
  const [gameStartupErrorCode, setGameStartupErrorCode] = useState<PokeLoungeErrorCode | null>(
    null,
  );
  const gameStartupError = gameStartupErrorCode !== null;
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
  const localAudioMutedByDefault =
    typeof window !== "undefined" && isLocalTestModeUrl(new URL(window.location.href));
  const volumeValue =
    localAudioMutedByDefault && !localAudioOverride ? 0 : settings.audio.masterVolume;
  const volumePercent = Math.round(volumeValue * 100);
  const volumeLabel = volumePercent === 0 ? copy.volumeMuted : copy.volumeLabel(volumePercent);
  const volumeAriaLabel = copy.volumeAriaLabel(volumePercent);
  const multiplayerRoomId =
    connectionSummary.roomId && connectionSummary.roomId !== "local-preview"
      ? connectionSummary.roomId
      : null;
  const activeRoomEntry = "world" in runtimeState ? runtimeState.world?.roomEntry : undefined;
  const roomShareUrl =
    activeRoomEntry && connectionSummary.connectionStatus === "online"
      ? createPokeLoungeRoomShareUrlFromLocation(activeRoomEntry)
      : null;
  const localRoomShare = Boolean(roomShareUrl) && activeRoomEntry?.mode === "local-room";
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
    Boolean(finalResult) && gamePageHandleRef.current?.isMultiplayer() === true;

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

  const handleVolumeCycle = useCallback(
    function memoizedCallback() {
      setSettings(function callback(currentSettings) {
        const currentVolume =
          localAudioMutedByDefault && !localAudioOverride ? 0 : currentSettings.audio.masterVolume;
        const currentIndex = getPokeLoungeVolumeLevelIndex(currentVolume);
        const nextVolume =
          POKE_LOUNGE_VOLUME_STEPS[(currentIndex + 1) % POKE_LOUNGE_VOLUME_STEPS.length];

        return {
          ...currentSettings,
          audio: {
            ...currentSettings.audio,
            masterVolume: nextVolume,
          },
        };
      });

      if (localAudioMutedByDefault) {
        setLocalAudioOverride(true);
      }
    },
    [localAudioMutedByDefault, localAudioOverride],
  );

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
          return hydrateGameProgress(
            { authenticated: true, accountId: retryAccountId, token, mode: "retry" },
            {
              isCurrent: () =>
                latestAccountIdRef.current === retryAccountId &&
                gameStateStorageScopeRef.current === retryStorageScope,
              selectAnonymousScope: () => {},
              selectAccountScope: () => true,
              load: loadPokeLoungeState,
              readLocal: () => buildPokeLoungeSaveSnapshot(getDefaultGameStateStore()),
              hydrate: snapshot => getDefaultGameStateStore().hydrateLocalPlayers(snapshot.state),
            },
          );
        })
        .then(function handleResolved(outcome) {
          if (outcome.kind === "cancelled") return;
          if (outcome.kind === "local-fallback") {
            setStateHydrationMessage(copy.hydrationLocalFallback);
            return;
          }
          if (outcome.kind === "conflict") {
            setPendingHydrationResolution({
              accountId: outcome.accountId,
              revision: outcome.revision,
              snapshot: outcome.snapshot,
            });
            return;
          }
          if (outcome.kind !== "ready") return;
          flushRecoveredLocalStateRef.current = outcome.flushLocal;
          setHydratedAccountId(outcome.accountId);
          setHydratedRevision(outcome.revision);
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
    try {
      setSettings(
        readPokeLoungeSettings({
          localStorage: window.localStorage,
          sessionStorage: window.sessionStorage,
        }),
      );
    } catch {
      // Browser storage may be blocked or full; keep the in-memory defaults.
    }
    setSettingsHydrated(true);
  }, []);

  useEffect(
    function runEffect() {
      setPokeLoungeMasterVolume(volumeValue);
    },
    [volumeValue],
  );

  useEffect(
    function runEffect() {
      if (!settingsHydrated) {
        return;
      }
      try {
        writePokeLoungeSettings(window.localStorage, settings);
      } catch {
        // Keep the current settings for this page when persistence is unavailable.
      }
    },
    [settings, settingsHydrated],
  );

  useEffect(function runEffect() {
    return function callback() {
      setPokeLoungeMasterVolume(1);
    };
  }, []);

  const gameViewportSize = MOBILE_GAME_VIEWPORT_SIZE;

  useEffect(
    function runEffect() {
      gamePageHandleRef.current?.setViewportSize(gameViewportSize);
    },
    [gameViewportSize],
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

  const entryDocumentScroll = runtimeState.phase === "entry";

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const binding = bindMobileViewport(page, {
      documentScroll: entryDocumentScroll,
      fullscreenEvent: GAME_FULLSCREEN_STATE_EVENT,
    });
    viewportUpdateRef.current = binding.update;
    return () => {
      viewportUpdateRef.current = null;
      binding.dispose();
    };
  }, [entryDocumentScroll]);

  // An entry field may be unmounted without a blur event when the game starts.
  useLayoutEffect(() => {
    viewportUpdateRef.current?.();
  }, [runtimeState.phase]);

  useEffect(
    function runEffect() {
      let pendingSettingsOpen: number | null = null;

      const handleKeyDown = (event: KeyboardEvent) => {
        // Full-height tasks own Escape and native button keys, not the world menu.
        if (
          event.defaultPrevented ||
          document.querySelector(
            "[data-poke-lounge-mobile-task], [data-room-lobby-info-open='true'], [data-screen='starter-selection'], [data-poke-lounge-mobile-deck='battle-moves']",
          )
        )
          return;
        if (event.key === "Escape" && settingsOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          handleMobileSettingsClose();
          return;
        }

        if (event.key === "Escape" && hasPokeLoungeMobileFullscreenScene(document)) {
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
    [handleMobileSettingsClose, settingsOpen, worldUiStore],
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

        const outcome = await hydrateGameProgress(
          {
            authenticated: status === "authenticated" && !isAuthSessionError(apiSession?.error),
            accountId,
            token: accountId ? accountTokensRef.current.get(accountId) : undefined,
          },
          {
            isCurrent: () => !cancelled,
            selectAnonymousScope: () => {
              setDefaultGameStateStorageScope(ANONYMOUS_GAME_STATE_STORAGE_SCOPE);
              if (gameStateStorageScopeRef.current !== ANONYMOUS_GAME_STATE_STORAGE_SCOPE)
                getDefaultGameStateStore().reloadLocalPlayersFromStorage();
              gameStateStorageScopeRef.current = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
              activeGameStateStorageScope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
            },
            selectAccountScope: accountId => {
              const scope = createAuthenticatedGameStateStorageScope(accountId);
              const alreadyUsing = gameStateStorageScopeRef.current === scope;
              setDefaultGameStateStorageScope(scope);
              const restored = alreadyUsing
                ? true
                : getDefaultGameStateStore().reloadLocalPlayersFromStorage();
              gameStateStorageScopeRef.current = scope;
              activeGameStateStorageScope = scope;
              return restored;
            },
            load: loadPokeLoungeState,
            readLocal: () => buildPokeLoungeSaveSnapshot(getDefaultGameStateStore()),
            hydrate: snapshot => getDefaultGameStateStore().hydrateLocalPlayers(snapshot.state),
          },
        );
        if (outcome.kind === "cancelled") return;
        if (outcome.kind === "anonymous") {
          setStateHydrationStatus("ready");
          return;
        }
        if (outcome.kind === "identity-error") {
          setStateHydrationStatus("unavailable");
          setStateHydrationMessage(copy.hydrationIdentityError);
          return;
        }
        if (outcome.kind === "local-fallback") {
          setStateHydrationStatus("local-ready");
          setStateHydrationMessage(copy.hydrationLocalFallback);
          return;
        }
        if (outcome.kind === "conflict") {
          setPendingHydrationResolution({
            accountId: outcome.accountId,
            revision: outcome.revision,
            snapshot: outcome.snapshot,
          });
          setStateHydrationStatus("conflict");
          setStateHydrationMessage(copy.hydrationConflictDescription);
          return;
        }
        if (outcome.flushLocal) flushRecoveredLocalStateRef.current = true;
        setStateHydrationStatus("ready");
        setHydratedAccountId(outcome.accountId);
        setHydratedRevision(outcome.revision);
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
      if (!gameHydrationReady) {
        return;
      }

      let cancelled = false;
      let cleanedUp = false;
      let destroyGamePage: (() => void) | null = null;
      const idToken = accountId ? accountTokensRef.current.get(accountId) : undefined;
      setGameStartupErrorCode(null);
      setGamePlaying(true);
      startedAtMsRef.current = Date.now();
      const cleanupGamePage = () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        cancelled = true;
        setGamePlaying(false);

        destroyGamePage?.();
        gamePageHandleRef.current = null;
        setGameRuntimeMounted(false);
        pageRef.current?.classList.remove("is-game-fullscreen-fallback");
        document.body.classList.remove("is-game-fullscreen-fallback-active");
      };

      void (async function callback() {
        let startupStage: "GAME_MODULE_LOAD_FAILED" | "GAME_RUNTIME_INIT_FAILED" =
          "GAME_MODULE_LOAD_FAILED";
        try {
          const { startGamePageFromDocument } = await import("./runtime/game-page");
          if (cancelled) {
            return;
          }

          startupStage = "GAME_RUNTIME_INIT_FAILED";
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
              viewportSize: MOBILE_GAME_VIEWPORT_SIZE,
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
        } catch (error) {
          if (!cancelled) {
            const userCode =
              startupStage === "GAME_MODULE_LOAD_FAILED"
                ? STARTUP_ERROR_CODES.MODULE_LOAD
                : STARTUP_ERROR_CODES.RUNTIME_INIT;
            reportClientDiagnostic({
              kind: "runtime",
              code: startupStage,
              errorName: error instanceof Error ? error.name : "UnknownError",
              error,
              startupStep:
                startupStage === "GAME_MODULE_LOAD_FAILED" ? "module_load" : "runtime_init",
              userCode,
            });
            setGameStartupErrorCode(userCode);
            setGamePlaying(false);
          }
        }
      })();

      return cleanupGamePage;
    },
    [accountId, gameHydrationReady, gameStartupAttempt, localTestModeActive, setGamePlaying],
  );

  const handleResultRetry = useCallback(function memoizedCallback() {
    const currentUrl = new URL(window.location.href);
    const returnsToRoomEntry = gamePageHandleRef.current?.isMultiplayer() === true;

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

  const handleFinalResultLobby = useCallback(() => {
    void gamePageHandleRef.current?.leaveRoomForResult();
  }, []);

  const handleFinalResultNewGame = useCallback(() => {
    void gamePageHandleRef.current?.leaveRoomForResult(true);
  }, []);

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
      className={cn(
        "fixed grid min-h-0 w-[var(--poke-lounge-mobile-app-width)] overflow-clip overscroll-none bg-[#17201a] text-[var(--pl-color-ink)] [--poke-lounge-container-width:100vw] [--poke-lounge-container-height:100dvh] [--poke-lounge-frame-available-height:100%] [--poke-lounge-max-display-width:1440px] [--poke-lounge-mobile-app-width:min(var(--poke-lounge-container-width),480px)] [--poke-lounge-mobile-letterbox-bottom:max(16px,env(safe-area-inset-bottom,0px))] [--poke-lounge-mobile-letterbox-top:max(16px,env(safe-area-inset-top,0px))] [--rom-screen-background:var(--pl-color-ink)] [container-name:poke-viewport] [container-type:size] [font-family:var(--pl-font-game)]",
        "top-[var(--poke-lounge-viewport-top,0px)] left-[calc(var(--poke-lounge-viewport-left,0px)+max(0px,(var(--poke-lounge-container-width)-480px)/2))] h-[var(--poke-lounge-container-height)]",
        "grid-cols-[minmax(0,min(100%,480px))] grid-rows-[minmax(0,1fr)] content-stretch items-stretch justify-center gap-0 pt-[var(--poke-lounge-mobile-letterbox-top)] pr-[env(safe-area-inset-right,0px)] pb-[var(--poke-lounge-mobile-letterbox-bottom)] pl-[env(safe-area-inset-left,0px)]",
        !entryDocumentScroll &&
          "min-[769px]:[--poke-lounge-mobile-app-height:min(var(--poke-lounge-container-height),calc(var(--poke-lounge-mobile-app-width)*16/9))] min-[769px]:top-[calc(var(--poke-lounge-viewport-top,0px)+max(0px,(var(--poke-lounge-container-height)-var(--poke-lounge-mobile-app-height))/2))] min-[769px]:h-[var(--poke-lounge-mobile-app-height)]",
        (runtimeState.phase === "world" || runtimeState.phase === "battle") &&
          !finalResult &&
          !gameStartupError &&
          "grid-cols-[minmax(0,var(--poke-lounge-layout-width,100%))] grid-rows-[auto_var(--poke-lounge-layout-frame-height,40%)_minmax(0,1fr)] gap-[var(--poke-lounge-layout-gap,8px)] data-[poke-lounge-responsive-layout=split]:grid-cols-[var(--poke-lounge-layout-frame-width)_var(--poke-lounge-layout-controller-width)] data-[poke-lounge-responsive-layout=split]:grid-rows-[auto_minmax(0,1fr)]",
        entryDocumentScroll &&
          "relative top-auto left-auto mx-auto block h-auto min-h-dvh w-[min(100%,480px)] overflow-visible overscroll-auto [container-type:inline-size]",
        "[&>[data-poke-lounge-play-status]]:col-[1/-1] [&>[data-poke-lounge-play-status]]:row-start-1 [&>[data-poke-lounge-play-status]]:w-full",
        "[&>[data-poke-lounge-mobile-control-dock]]:col-start-1 [&>[data-poke-lounge-mobile-control-dock]]:row-start-3 [&>[data-poke-lounge-mobile-control-dock]]:h-full [&>[data-poke-lounge-mobile-control-dock]]:w-full [&>[data-poke-lounge-mobile-control-dock]]:min-h-0 [&>[data-poke-lounge-mobile-control-dock]]:min-w-0",
        "data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:col-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:row-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-l-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-t-0",
        "data-[poke-lounge-keyboard-open]:[&>[data-poke-lounge-mobile-control-dock=true]]:hidden",
      )}
      data-testid="poke-lounge-page"
      data-poke-lounge-play-layout={
        (runtimeState.phase === "world" || runtimeState.phase === "battle") &&
        !finalResult &&
        !gameStartupError
          ? "true"
          : undefined
      }
      data-poke-lounge-entry-open={entryDocumentScroll ? "true" : undefined}
      data-poke-lounge-mobile-shell="true"
      data-poke-lounge-room-lobby-open={runtimeState.phase === "lobby" ? "true" : undefined}
      data-poke-lounge-starter-open={runtimeState.phase === "starter" ? "true" : undefined}
    >
      <PokeLoungeGameFrame
        copy={copy}
        gameRuntimeMounted={gameRuntimeMounted}
        roomShareAvailable={Boolean(roomShareUrl)}
        roomShareStatus={roomShareStatus}
        runtimeState={runtimeState}
        onOpenSettings={function handleOpenSettings() {
          return setSettingsOpen(true);
        }}
        onRoomShare={handleRoomShare}
        onResultLobby={handleFinalResultLobby}
        onResultNewGame={handleFinalResultNewGame}
      />
      {gameRuntimeMounted &&
      (runtimeState.phase === "world" ||
        runtimeState.phase === "battle" ||
        runtimeState.phase === "lobby") &&
      !finalResult &&
      !gameStartupError ? (
        <MobileGameShell
          lobby={runtimeState.phase === "lobby"}
          gameStateStore={runtimeState.world?.gameStateStore ?? getDefaultGameStateStore()}
          competitive={runtimeState.world?.competitiveRoundsEnabled ?? false}
          activeScene={runtimeState.phase === "lobby" ? null : activeGameScene}
          battleUiStore={battleUiStore}
          copy={copy}
          onOpenSettings={handleMobileSettingsOpen}
          worldInput={runtimeState.phase === "world" ? runtimeState.world?.input : undefined}
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
        onRetry={handleStateHydrationRetry}
      />
      {gameStartupErrorCode ? (
        <PokeLoungeStartupErrorScreen
          copy={copy}
          errorCode={gameStartupErrorCode}
          onRetry={function handleRetry() {
            return setGameStartupAttempt(function callback(attempt) {
              return attempt + 1;
            });
          }}
          onLobby={handleResultLobby}
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
      <PokeLoungeDecisionDialogs
        copy={copy}
        exitOpen={exitConfirmationOpen}
        hydrationConflictOpen={Boolean(pendingHydrationResolution)}
        leaveRequest={leaveRequest}
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
          onLobby={handleResultLobby}
          onRetry={handleResultRetry}
        />
      ) : null}
      <div id="poke-lounge-accessible-status" className="sr-only" role="status" aria-live="polite">
        {accessibleGameStatus} {multiplayerRoomId ? `${connectionLabel}${sentenceEnd} ` : ""}
        {autosaveLabel}
        {sentenceEnd} {copy.accessibleHelp}
      </div>
    </main>
  );
}

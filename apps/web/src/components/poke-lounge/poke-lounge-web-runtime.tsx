"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PokeLoungeWebBattle } from "./poke-lounge-web-battle";
import type { PokeLoungeCopy } from "./poke-lounge-copy";
import styles from "./poke-lounge.module.css";
import { loadBootstrapData } from "./runtime/bootstrap";
import {
  playPokeLoungeBgm,
  playPokeLoungeSfx,
  primePokeLoungeAudio,
  stopPokeLoungeBgm,
} from "./runtime/game/audio/poke-lounge-audio";
import { getBattlePokemonAssets } from "./runtime/game/battle/battlePokemonAssets";
import type { BattleScreenState } from "./runtime/game/battle/battleTypes";
import { loadRuntimeGameDataJson } from "./runtime/game/data/game-data-json";
import {
  LOCAL_TEST_MODE_START_QUERY_PARAM,
  activateLocalTestMode,
  createLocalTestModeSoloUrl,
  createLocalTestModeStartUrl,
  deactivateLocalTestMode,
  loadLocalTestModeState,
  resolveLocalTestModeState,
  type LocalTestModeState,
} from "./runtime/game/local-test-mode";
import { createMultiplayerRoom } from "./runtime/game/network/multiplayerRoomFactory";
import {
  applyRoomEntrySelection,
  clearRoomEntrySearchParams,
  isCompetitiveRoomEntryMode,
  isLocalE2eUrl,
  replaceBrowserUrl,
} from "./runtime/game/network/room-entry-navigation";
import {
  deriveTemporaryRoomCode,
  normalizeTemporaryPassword,
  readRoomEntryFromLocation,
} from "./runtime/game/network/roomEntry";
import {
  normalizeMultiplayerDisplayName,
  resolveInitialMultiplayerDisplayName,
  shouldResetRoomEntrySession,
  type RoomEntrySelection,
} from "./runtime/game/network/roomEntryScreen";
import type {
  CompetitiveRoomProjectionEvent,
  MultiplayerRoom,
} from "./runtime/game/network/localPreviewRoom";
import type { TournamentStateRoomPayload } from "./runtime/game/network/tournament-projection";
import { createWebRtcRoom } from "./runtime/game/network/webRtcRoom";
import { getDefaultGameStateStore } from "./runtime/game/state/defaultGameStateStore";
import {
  PREMIUM_SHOP_ITEM_IDS,
  SHOP_ITEM_IDS,
  getShopItemById,
  type GameStateStore,
} from "./runtime/game/state/gameStateStore";
import { usePokeLoungeGameState } from "./runtime/game/state/use-poke-lounge-game-state";
import { createStarterPlayerPokemon } from "./runtime/game/starter-player";
import { createRoomLobbyViewState } from "./runtime/game/ui/room-lobby-screen";
import { startWebRoomRuntime, type WebRoomRuntime } from "./runtime/game/web-room-runtime";
import {
  createWebWildBattleState,
  createWebSoloChallengeState,
  settleWebBattle,
  WEB_EXPLORATION_AREAS,
} from "./runtime/game/web-battle-runtime";
import type { GameBootstrapData, StarterPokemon } from "./runtime/types";

type WebScreen = "loading" | "entry" | "starter" | "hub" | "lobby" | "battle" | "error";
type HubPanel = "explore" | "party" | "inventory" | "shop" | "pc";

interface PokeLoungeWebRuntimeProps {
  accountId?: string;
  copy: PokeLoungeCopy;
  getIdToken(): string | undefined;
  idToken?: string;
  localTestModeActive?: boolean;
}

const gameStateStore = getDefaultGameStateStore();

export function PokeLoungeWebRuntime({
  accountId,
  copy,
  getIdToken,
  idToken,
  localTestModeActive,
}: PokeLoungeWebRuntimeProps) {
  const state = usePokeLoungeGameState(gameStateStore);
  const localPlayer = state.playersById[state.currentPlayerId];
  const roomRef = useRef<MultiplayerRoom | null>(null);
  const roomRuntimeRef = useRef<WebRoomRuntime | null>(null);
  const getIdTokenRef = useRef(getIdToken);
  const mountedRef = useRef(true);
  const [screen, setScreen] = useState<WebScreen>("loading");
  const [hubPanel, setHubPanel] = useState<HubPanel>("party");
  const [bootstrap, setBootstrap] = useState<GameBootstrapData | null>(null);
  const [selectedStarterId, setSelectedStarterId] = useState("");
  const [pendingRoomCode, setPendingRoomCode] = useState<string | undefined>();
  const [tournament, setTournament] = useState<TournamentStateRoomPayload | null>(null);
  const [competitiveBattle, setCompetitiveBattle] = useState<CompetitiveRoomProjectionEvent | null>(
    null,
  );
  const [localBattle, setLocalBattle] = useState<BattleScreenState | null>(null);
  const [localTestMode, setLocalTestMode] = useState<LocalTestModeState>({
    available: false,
    active: false,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [displayName, setDisplayName] = useState(() =>
    resolveInitialMultiplayerDisplayName(
      localPlayer.displayName,
      copy.roomEntry.multiplayerNameModifiers,
      copy.roomEntry.multiplayerNameNouns,
    ),
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  getIdTokenRef.current = getIdToken;

  const setResourceState = useCallback((nextScreen: WebScreen) => {
    const root = document.querySelector<HTMLElement>("#game-root");
    if (!root) {
      return;
    }

    root.dataset.pokeLoungeResourceStatus = nextScreen === "loading" ? "loading" : "ready";
    if (nextScreen === "battle") {
      root.dataset.pokeLoungeActiveScene = "battle";
    } else if (nextScreen === "hub" || nextScreen === "lobby") {
      root.dataset.pokeLoungeActiveScene = "world";
    } else {
      delete root.dataset.pokeLoungeActiveScene;
    }
  }, []);

  useEffect(() => setResourceState(screen), [screen, setResourceState]);

  useEffect(() => {
    if (screen === "battle") {
      playPokeLoungeBgm("wild-battle");
    } else if (screen === "hub" || screen === "lobby") {
      playPokeLoungeBgm("field-day");
    } else {
      stopPokeLoungeBgm();
    }
  }, [screen]);

  useEffect(() => () => stopPokeLoungeBgm(), []);

  const disposeRoom = useCallback(() => {
    roomRuntimeRef.current?.dispose();
    roomRuntimeRef.current = null;
    roomRef.current = null;
    setTournament(null);
    setCompetitiveBattle(null);
  }, []);

  const showEntry = useCallback(() => {
    disposeRoom();
    const url = new URL(window.location.href);
    clearRoomEntrySearchParams(url);
    replaceBrowserUrl(url);
    setMessage("");
    setPending(false);
    setScreen("entry");
  }, [disposeRoom]);

  const startRoom = useCallback(
    async (temporaryRoomId?: string) => {
      setScreen("loading");
      setMessage(copy.roomEntry.preparing);
      await loadRuntimeGameDataJson();
      if (!mountedRef.current) {
        return;
      }

      const url = new URL(window.location.href);
      const roomEntry = readRoomEntryFromLocation(url);
      const competitiveRoundsEnabled = isCompetitiveRoomEntryMode(roomEntry.mode);
      const room = createMultiplayerRoom({
        accountId: temporaryRoomId ? undefined : accountId,
        createWebRtcRoom,
        idToken: temporaryRoomId ? undefined : idToken,
        getIdToken: temporaryRoomId ? undefined : () => getIdTokenRef.current(),
        roomId: temporaryRoomId,
        persistRoomCodeInUrl: temporaryRoomId ? false : undefined,
        sharedWorldOnly: Boolean(temporaryRoomId),
        competitiveRoundsEnabled,
        searchParams: url.searchParams,
      });

      disposeRoom();
      roomRef.current = room;
      roomRuntimeRef.current = startWebRoomRuntime({
        gameStateStore,
        room,
        onTournamentState: projection => {
          setTournament(projection);
          setScreen(projection.roomStatus === "waiting" ? "lobby" : "hub");
        },
        onCompetitiveAssignment: event => {
          setCompetitiveBattle(event);
          setScreen("battle");
        },
        onCompetitiveState: event => {
          setCompetitiveBattle(current =>
            current?.projection.matchId === event.projection.matchId ? event : current,
          );
        },
        onCompetitiveActionFailed: event => setMessage(event.message),
      });
      setMessage("");
      setScreen("hub");
    },
    [accountId, copy.roomEntry.preparing, disposeRoom, idToken],
  );

  const continueAfterSelection = useCallback(
    async (temporaryRoomId?: string) => {
      setPendingRoomCode(temporaryRoomId);
      setPending(true);
      setMessage(copy.roomEntry.preparing);

      try {
        await loadRuntimeGameDataJson();
        if (gameStateStore.canChooseStarter()) {
          const data = await loadBootstrapData();
          if (!mountedRef.current) {
            return;
          }
          setBootstrap(data);
          setSelectedStarterId(data.starters[0]?.id ?? "");
          setPending(false);
          setMessage("");
          setScreen("starter");
          return;
        }

        await startRoom(temporaryRoomId);
      } catch {
        if (mountedRef.current) {
          setPending(false);
          setMessage(copy.startup.description);
          setScreen("error");
        }
      }
    },
    [copy.roomEntry.preparing, copy.startup.description, startRoom],
  );

  const selectRoom = useCallback(
    (selection: RoomEntrySelection) => {
      void primePokeLoungeAudio();
      playPokeLoungeSfx("button-confirm");
      const url = new URL(window.location.href);

      if (selection.displayName) {
        gameStateStore.upsertLocalPlayer({
          ...gameStateStore.getCurrentLocalPlayer(),
          displayName: selection.displayName,
        });
      }
      if (shouldResetRoomEntrySession(selection)) {
        gameStateStore.reset();
      }

      applyRoomEntrySelection(url, selection);
      replaceBrowserUrl(url);
      const temporaryRoomId =
        selection.mode === "server-room" && selection.createRoom
          ? (selection.roomCode ?? undefined)
          : undefined;
      void continueAfterSelection(temporaryRoomId);
    },
    [continueAfterSelection],
  );

  useEffect(() => {
    mountedRef.current = true;
    const url = new URL(window.location.href);

    void loadLocalTestModeState(url)
      .then(result => {
        if (!mountedRef.current) {
          return;
        }

        const resolved = resolveLocalTestModeState(result, localTestModeActive === true);
        setLocalTestMode(resolved);
        const localTestModeStartRequested =
          url.searchParams.get(LOCAL_TEST_MODE_START_QUERY_PARAM) === "1";

        if (localTestModeStartRequested && resolved.active) {
          const soloUrl = createLocalTestModeSoloUrl(url);
          replaceBrowserUrl(soloUrl);
          void continueAfterSelection();
          return;
        }

        const roomEntry = readRoomEntryFromLocation(url);
        if (isCompetitiveRoomEntryMode(roomEntry.mode) && isLocalE2eUrl(url)) {
          void continueAfterSelection();
          return;
        }

        if (isCompetitiveRoomEntryMode(roomEntry.mode)) {
          clearRoomEntrySearchParams(url);
          replaceBrowserUrl(url);
        }
        setScreen("entry");
      })
      .catch(() => setScreen("entry"));

    return () => {
      mountedRef.current = false;
      roomRuntimeRef.current?.dispose();
      roomRuntimeRef.current = null;
      roomRef.current = null;
    };
  }, [continueAfterSelection, localTestModeActive]);

  const handleMultiplayerSubmit = async () => {
    const nextDisplayName = normalizeMultiplayerDisplayName(displayName);
    const nextPassword = normalizeTemporaryPassword(temporaryPassword);
    setDisplayName(nextDisplayName);
    setTemporaryPassword(nextPassword);

    if (!nextDisplayName) {
      setMessage(copy.roomEntry.multiplayerNameRequired);
      return;
    }
    if (!nextPassword) {
      setMessage(copy.roomEntry.temporaryPasswordRequired);
      return;
    }

    setPending(true);
    setMessage(copy.roomEntry.preparing);
    try {
      const roomCode = await deriveTemporaryRoomCode(nextPassword);
      selectRoom({
        mode: "server-room",
        roomCode,
        inviteUrl: null,
        displayName: nextDisplayName,
        createRoom: true,
      });
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.multiplayerConnectFailed);
    }
  };

  const handleLocalTestStart = async () => {
    if (localTestMode.active) {
      selectRoom({ mode: "solo", roomCode: null, inviteUrl: null });
      return;
    }

    setPending(true);
    try {
      await activateLocalTestMode(new URL(window.location.href));
      window.location.assign(createLocalTestModeStartUrl(new URL(window.location.href)).href);
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.localTestRequestFailed);
    }
  };

  const handleLocalTestExit = async () => {
    setPending(true);
    try {
      await deactivateLocalTestMode(new URL(window.location.href));
      const url = new URL(window.location.href);
      clearRoomEntrySearchParams(url);
      url.searchParams.delete(LOCAL_TEST_MODE_START_QUERY_PARAM);
      window.location.assign(url.href);
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.localTestRequestFailed);
    }
  };

  const handleStarterConfirm = (starter: StarterPokemon) => {
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm");
    gameStateStore.setStarterPokemon(createStarterPlayerPokemon(starter));
    void startRoom(pendingRoomCode).catch(() => {
      setMessage(copy.startup.description);
      setScreen("error");
    });
  };

  const handleLeave = async () => {
    setPending(true);
    try {
      await roomRuntimeRef.current?.leave();
      showEntry();
    } catch {
      setPending(false);
      setMessage(copy.lobby.mutationFailed);
    }
  };

  const handleExplore = async (areaId: string) => {
    setScreen("loading");
    setMessage("야생 포켓몬을 찾는 중...");
    try {
      const battle = await createWebWildBattleState(areaId, gameStateStore);
      if (!mountedRef.current) {
        return;
      }
      setLocalBattle(battle);
      setCompetitiveBattle(null);
      setMessage("");
      setScreen("battle");
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setMessage("지금은 탐험을 시작할 수 없습니다. 파티 상태를 확인해 주세요.");
      setScreen("hub");
    }
  };

  const handleBattleComplete = (battle: BattleScreenState, authoritative: boolean) => {
    if (!authoritative) {
      settleWebBattle(battle, gameStateStore);
      if (battle.tournamentMatchId === "solo-challenge" && battle.result) {
        gameStateStore.completeSoloChallenge(
          battle.result.winnerPlayerId === battle.player.playerId,
          Date.now(),
        );
      }
    }
    setLocalBattle(null);
    setCompetitiveBattle(null);
    setScreen("hub");
  };

  const handleSoloChallenge = async () => {
    setScreen("loading");
    setMessage("미러 트레이너가 준비 중입니다...");
    try {
      const battle = await createWebSoloChallengeState(gameStateStore);
      if (!mountedRef.current) {
        return;
      }
      setLocalBattle(battle);
      setCompetitiveBattle(null);
      setMessage("");
      setScreen("battle");
    } catch {
      if (!mountedRef.current) {
        return;
      }
      setMessage("솔로 도전을 시작할 수 없습니다. 파티 상태를 확인해 주세요.");
      setScreen("hub");
    }
  };

  return (
    <div className={styles.webRuntime} data-poke-lounge-web-runtime="true">
      {screen === "loading" ? <WebLoading copy={copy} message={message} /> : null}
      {screen === "entry" ? (
        <WebRoomEntry
          copy={copy}
          displayName={displayName}
          localTestMode={localTestMode}
          message={message}
          pending={pending}
          temporaryPassword={temporaryPassword}
          onDisplayNameChange={setDisplayName}
          onLocalTestExit={() => void handleLocalTestExit()}
          onLocalTestStart={() => void handleLocalTestStart()}
          onMultiplayerSubmit={() => void handleMultiplayerSubmit()}
          onNewGame={() => setNewGameOpen(true)}
          onSolo={() => selectRoom({ mode: "solo", roomCode: null, inviteUrl: null })}
          onTemporaryPasswordChange={setTemporaryPassword}
        />
      ) : null}
      {screen === "starter" && bootstrap ? (
        <WebStarterSelection
          bootstrap={bootstrap}
          selectedStarterId={selectedStarterId}
          onConfirm={handleStarterConfirm}
          onSelect={setSelectedStarterId}
        />
      ) : null}
      {screen === "lobby" && tournament && roomRef.current ? (
        <WebRoomLobby
          copy={copy}
          projection={tournament}
          room={roomRef.current}
          onLeave={() => setLeaveOpen(true)}
        />
      ) : null}
      {screen === "hub" ? (
        <WebHub
          panel={hubPanel}
          state={state}
          tournament={tournament}
          message={message}
          onLeave={() => setLeaveOpen(true)}
          onExplore={areaId => void handleExplore(areaId)}
          onPanelChange={setHubPanel}
          onSoloChallenge={() => void handleSoloChallenge()}
        />
      ) : null}
      {screen === "battle" ? (
        <PokeLoungeWebBattle
          competitiveBattle={competitiveBattle}
          gameStateStore={gameStateStore}
          localBattle={localBattle}
          room={roomRef.current}
          onComplete={handleBattleComplete}
        />
      ) : null}
      {screen === "error" ? (
        <section className="room-entry-screen" role="alert">
          <div className="room-entry-panel game-startup-panel">
            <h1>{copy.startup.title}</h1>
            <p className="room-entry-mode-copy">{message || copy.startup.description}</p>
            <div className="room-entry-mode-actions">
              <Button type="button" onClick={() => void continueAfterSelection(pendingRoomCode)}>
                {copy.startup.retry}
              </Button>
              <Button type="button" variant="outline" onClick={showEntry}>
                {copy.startup.lobby}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <AlertDialog open={newGameOpen} onOpenChange={setNewGameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.roomEntry.newGameTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.roomEntry.newGameDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.roomEntry.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                selectRoom({
                  mode: "solo",
                  roomCode: null,
                  inviteUrl: null,
                  resetSession: true,
                })
              }
            >
              {copy.roomEntry.resetAndStart}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.roomEntry.leaveRoomTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.roomEntry.leaveRoomDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.leaveContinue}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleLeave()}>
              {copy.leaveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WebLoading({ copy, message }: { copy: PokeLoungeCopy; message: string }) {
  return (
    <section className="room-entry-screen" role="status" aria-live="polite">
      <div className="room-entry-panel game-startup-panel">
        <p className="kicker">Poke Lounge</p>
        <h1>{message || copy.roomEntry.preparing}</h1>
      </div>
    </section>
  );
}

interface WebRoomEntryProps {
  copy: PokeLoungeCopy;
  displayName: string;
  localTestMode: LocalTestModeState;
  message: string;
  pending: boolean;
  temporaryPassword: string;
  onDisplayNameChange(value: string): void;
  onLocalTestExit(): void;
  onLocalTestStart(): void;
  onMultiplayerSubmit(): void;
  onNewGame(): void;
  onSolo(): void;
  onTemporaryPasswordChange(value: string): void;
}

function WebRoomEntry(props: WebRoomEntryProps) {
  const { copy } = props;
  return (
    <section
      className="room-entry-screen"
      data-room-entry-screen="true"
      data-local-test-mode-active={props.localTestMode.active || undefined}
    >
      <div className="room-entry-panel">
        <h1>{copy.roomEntry.title}</h1>
        <p className="room-entry-notice">{copy.roomEntry.fanNotice}</p>
        <section className="room-entry-mode-group" data-room-entry-mode="solo">
          <h2 className="room-entry-mode-heading">{copy.roomEntry.soloTitle}</h2>
          <p className="room-entry-mode-copy">{copy.roomEntry.soloDescription}</p>
          <div className="room-entry-mode-actions">
            <Button type="button" disabled={props.pending} onClick={props.onSolo}>
              {copy.roomEntry.continue}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.pending}
              onClick={props.onNewGame}
            >
              {copy.roomEntry.newGame}
            </Button>
          </div>
          {props.localTestMode.available ? (
            <section
              className="room-entry-local-test"
              data-local-test-mode-active={props.localTestMode.active || undefined}
            >
              <h3 className="room-entry-field-label">{copy.roomEntry.localTestTitle}</h3>
              <p className="room-entry-field-copy">{copy.roomEntry.localTestDescription}</p>
              <div className="room-entry-local-test-actions">
                <Button
                  type="button"
                  disabled={props.pending}
                  onClick={props.onLocalTestStart}
                  data-room-entry-local-test-start="true"
                >
                  {props.localTestMode.active
                    ? copy.roomEntry.localTestContinue
                    : copy.roomEntry.localTestStart}
                </Button>
                {props.localTestMode.active ? (
                  <Button
                    type="button"
                    disabled={props.pending}
                    onClick={props.onLocalTestExit}
                    data-room-entry-local-test-exit="true"
                  >
                    {copy.roomEntry.localTestExit}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
        {!props.localTestMode.active ? (
          <section className="room-entry-mode-group" data-room-entry-mode="multiplayer">
            <h2 className="room-entry-mode-heading">{copy.roomEntry.multiplayerTitle}</h2>
            <p className="room-entry-mode-copy">{copy.roomEntry.multiplayerDescription}</p>
            <label className="room-entry-field">
              <span className="room-entry-field-label">{copy.roomEntry.multiplayerNameLabel}</span>
              <input
                type="text"
                autoComplete="off"
                maxLength={12}
                disabled={props.pending}
                value={props.displayName}
                onChange={event => props.onDisplayNameChange(event.target.value)}
                data-room-entry-display-name="true"
              />
              <span className="room-entry-field-copy">
                {copy.roomEntry.multiplayerNameDescription}
              </span>
            </label>
            <label className="room-entry-field">
              <span className="room-entry-field-label">
                {copy.roomEntry.temporaryPasswordLabel}
              </span>
              <input
                type="password"
                autoComplete="off"
                maxLength={64}
                disabled={props.pending}
                value={props.temporaryPassword}
                onChange={event => props.onTemporaryPasswordChange(event.target.value)}
                data-room-entry-temporary-password="true"
                onKeyDown={event => {
                  if (event.key === "Enter") props.onMultiplayerSubmit();
                }}
              />
              <span className="room-entry-field-copy">
                {copy.roomEntry.temporaryPasswordDescription}
              </span>
            </label>
            <Button
              type="button"
              disabled={props.pending}
              onClick={props.onMultiplayerSubmit}
              data-room-entry-multiplayer-submit="true"
            >
              {copy.roomEntry.multiplayerConnect}
            </Button>
          </section>
        ) : null}
        <p className="room-entry-message" role="alert" aria-live="assertive">
          {props.message}
        </p>
      </div>
    </section>
  );
}

function WebStarterSelection({
  bootstrap,
  onConfirm,
  onSelect,
  selectedStarterId,
}: {
  bootstrap: GameBootstrapData;
  onConfirm(starter: StarterPokemon): void;
  onSelect(starterId: string): void;
  selectedStarterId: string;
}) {
  const selectedStarter =
    bootstrap.starters.find(starter => starter.id === selectedStarterId) ?? bootstrap.starters[0];
  if (!selectedStarter) {
    return null;
  }

  return (
    <section className="game-screen game-screen--starter-modal" data-screen="starter-selection">
      <div className="selection-panel starter-selection-modal">
        <header className="selection-header">
          <div className="title-block">
            <p className="kicker">Poke Lounge</p>
            <h1>첫 파트너 선택</h1>
          </div>
        </header>
        <div className="selection-body">
          <section className="starter-modal-preview">
            <div className="starter-preview-stage">
              <span
                className="starter-preview-sprite"
                role="img"
                aria-label={selectedStarter.displayName}
                style={{ backgroundImage: `url("${selectedStarter.assetPath}")` }}
              />
            </div>
            <div className="starter-preview-meta">
              <strong className="starter-preview-name">{selectedStarter.displayName}</strong>
              <span className={`starter-type starter-type--${selectedStarter.type.toLowerCase()}`}>
                {selectedStarter.type}
              </span>
              <Button
                type="button"
                className="starter-confirm-button"
                onClick={() => onConfirm(selectedStarter)}
                data-starter-confirm="true"
              >
                이 포켓몬으로 시작
              </Button>
            </div>
          </section>
          <div className="starter-grid" aria-label="Starter Pokemon options">
            {bootstrap.starters.map(starter => (
              <Button
                key={starter.id}
                type="button"
                className={`starter-card starter-card--${starter.type.toLowerCase()} ${
                  starter.id === selectedStarter.id ? "is-selected" : ""
                }`}
                aria-pressed={starter.id === selectedStarter.id}
                onClick={() => onSelect(starter.id)}
              >
                <span
                  className="starter-sprite"
                  role="img"
                  aria-label={starter.displayName}
                  style={{ backgroundImage: `url("${starter.assetPath}")` }}
                />
                <span className="starter-name">{starter.displayName}</span>
                <span className="starter-type">{starter.type}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WebRoomLobby({
  copy,
  onLeave,
  projection,
  room,
}: {
  copy: PokeLoungeCopy;
  onLeave(): void;
  projection: TournamentStateRoomPayload;
  room: MultiplayerRoom;
}) {
  const [mutation, setMutation] = useState<"ready" | "start" | null>(null);
  const [error, setError] = useState("");
  const view = createRoomLobbyViewState(projection, mutation);

  const runMutation = async (kind: "ready" | "start", action: () => Promise<void>) => {
    setMutation(kind);
    setError("");
    try {
      await action();
    } catch {
      setError(copy.lobby.mutationFailed);
    } finally {
      setMutation(null);
    }
  };

  return (
    <section className="room-lobby-screen" data-room-lobby="true">
      <Button type="button" className="room-leave-button" onClick={onLeave}>
        {copy.roomEntry.leaveRoom}
      </Button>
      <div className="room-lobby-panel">
        <header className="room-lobby-header">
          <h2>{copy.lobby.title}</h2>
          <p>{copy.lobby.participantCount(view.participantCount)}</p>
        </header>
        <ol className="room-lobby-participants" aria-label={copy.lobby.participantListLabel}>
          {projection.participants.map(participant => (
            <li key={participant.playerId} className="room-lobby-participant">
              <strong>{participant.displayName}</strong>
              <span className="room-lobby-badges">
                {participant.playerId === projection.hostPlayerId ? (
                  <span>{copy.lobby.hostBadge}</span>
                ) : null}
                <span>{participant.ready ? copy.lobby.ready : copy.lobby.notReady}</span>
                <span>
                  {participant.connected ? copy.lobby.connected : copy.lobby.disconnected}
                </span>
                <span>
                  {participant.partyReady ? copy.lobby.partyReady : copy.lobby.partyMissing}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <footer className="room-lobby-footer">
          <Button
            type="button"
            disabled={view.readyDisabled}
            onClick={() => void runMutation("ready", () => room.setLobbyReady(!view.ownReady))}
            data-room-lobby-ready="true"
          >
            {view.ownReady ? copy.lobby.cancelReadyAction : copy.lobby.readyAction}
          </Button>
          {view.isHost ? (
            <Button
              type="button"
              disabled={view.startDisabledReason !== null}
              onClick={() => void runMutation("start", () => room.startChampionship())}
              data-room-lobby-start="true"
            >
              {copy.lobby.startAction}
            </Button>
          ) : null}
        </footer>
        <p className="room-lobby-status">
          {!view.ownPartyReady
            ? copy.lobby.ownPartyMissingReason
            : view.isHost
              ? view.startDisabledReason
                ? copy.lobby.startDisabledReason[view.startDisabledReason]
                : copy.lobby.hostReady
              : copy.lobby.guestWaiting}
        </p>
        <p className="room-lobby-error" aria-live="assertive">
          {error}
        </p>
      </div>
    </section>
  );
}

function WebHub({
  message,
  onExplore,
  onLeave,
  onPanelChange,
  onSoloChallenge,
  panel,
  state,
  tournament,
}: {
  message: string;
  onExplore(areaId: string): void;
  onLeave(): void;
  onPanelChange(panel: HubPanel): void;
  onSoloChallenge(): void;
  panel: HubPanel;
  state: ReturnType<typeof gameStateStore.getState>;
  tournament: TournamentStateRoomPayload | null;
}) {
  const player = state.playersById[state.currentPlayerId];
  const activePokemon = player.party.find(
    slot => slot.slotIndex === player.activePartySlotIndex,
  )?.pokemon;
  const remoteCount = Object.keys(state.remotePlayers).length;

  return (
    <section
      className={styles.webHub}
      aria-label="Poke Lounge Web Hub"
      data-web-hub="true"
      data-room-status={tournament?.roomStatus}
      data-round-duration-ms={tournament?.roomRound.durationMs}
      data-round-started-at-ms={tournament?.roomRound.startedAtMs ?? undefined}
      data-round-ends-at-ms={tournament?.roomRound.endsAtMs ?? undefined}
    >
      <header className={styles.webHubHeader}>
        <div>
          <p>Poke Lounge</p>
          <h1>{player.displayName}</h1>
        </div>
        <div className={styles.webHubStatus}>
          {tournament ? (
            <span>
              {tournament.roomStatus === "completed"
                ? "챔피언십 완료"
                : `라운드 ${Math.max(1, tournament.roundIndex)}`}
            </span>
          ) : null}
          {tournament?.roomStatus === "completed"
            ? tournament.finalStandings
                .filter(standing => standing.playerId === tournament.ownPlayerId)
                .map(standing => (
                  <span key={standing.playerId}>
                    {standing.rank}위 · {standing.score}점
                  </span>
                ))
            : null}
          <span>₽{player.wallet.pokeDollars.toLocaleString()}</span>
          <span>{remoteCount > 0 ? `함께 접속 ${remoteCount + 1}명` : "솔로 플레이"}</span>
          <Button type="button" variant="outline" onClick={onLeave}>
            나가기
          </Button>
        </div>
      </header>
      <div className={styles.webHubWorkspace}>
        <section className={styles.webHubStage}>
          <div className={styles.webHubPokemon}>
            {activePokemon ? <PokemonSprite speciesId={activePokemon.speciesId} /> : null}
          </div>
          <div className={styles.webHubLead}>
            <span>현재 파트너</span>
            <strong>{activePokemon?.name ?? "파트너 없음"}</strong>
            <small>
              {activePokemon
                ? `Lv.${activePokemon.level} · HP ${activePokemon.currentHp ?? "-"}/${activePokemon.maxHp ?? "-"}`
                : "스타터를 선택해 주세요"}
            </small>
          </div>
          <nav className={styles.webHubActions} aria-label="허브 메뉴">
            {(
              [
                ["explore", "탐험"],
                ["party", "파티"],
                ["inventory", "가방"],
                ["shop", "상점"],
                ["pc", "PC 박스"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                variant={panel === id ? "default" : "outline"}
                aria-pressed={panel === id}
                onClick={() => onPanelChange(id)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => gameStateStore.healCurrentParty()}
            >
              파티 회복
            </Button>
            <Button type="button" variant="outline" onClick={onSoloChallenge}>
              솔로 도전
            </Button>
          </nav>
          {message ? (
            <p className={styles.webHubMessage} role="status">
              {message}
            </p>
          ) : null}
        </section>
        <section className={styles.webHubPanel} aria-live="polite">
          {panel === "explore" ? <ExplorePanel onExplore={onExplore} /> : null}
          {panel === "party" ? <PartyPanel player={player} /> : null}
          {panel === "inventory" ? <InventoryPanel inventory={player.inventory} /> : null}
          {panel === "shop" ? <ShopPanel /> : null}
          {panel === "pc" ? <PcPanel player={player} /> : null}
        </section>
      </div>
    </section>
  );
}

function ExplorePanel({ onExplore }: { onExplore(areaId: string): void }) {
  return (
    <>
      <header className={styles.webPanelHeader}>
        <h2>탐험</h2>
        <span>지역을 선택하세요</span>
      </header>
      <ul className={styles.webExploreList}>
        {WEB_EXPLORATION_AREAS.map(area => (
          <li key={area.id}>
            <div>
              <strong>{area.name}</strong>
              <small>{area.description}</small>
            </div>
            <Button type="button" onClick={() => onExplore(area.id)}>
              탐험 시작
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PartyPanel({ player }: { player: ReturnType<GameStateStore["getCurrentLocalPlayer"]> }) {
  return (
    <>
      <header className={styles.webPanelHeader}>
        <h2>파티</h2>
        <span>{player.party.filter(slot => slot.pokemon).length}/6</span>
      </header>
      <ol className={styles.webList}>
        {player.party.map(slot => (
          <li key={slot.slotIndex} data-active={slot.slotIndex === player.activePartySlotIndex}>
            <span>{slot.slotIndex + 1}</span>
            <strong>{slot.pokemon?.name ?? "비어 있음"}</strong>
            {slot.pokemon ? (
              <small>
                Lv.{slot.pokemon.level} · HP {slot.pokemon.currentHp ?? "-"}/
                {slot.pokemon.maxHp ?? "-"}
              </small>
            ) : null}
            {slot.pokemon && slot.slotIndex !== player.activePartySlotIndex ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => gameStateStore.setActivePartySlot(slot.slotIndex)}
              >
                선두
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}

function InventoryPanel({ inventory }: { inventory: Record<string, number> }) {
  const entries = Object.entries(inventory).filter(([, count]) => count > 0);
  return (
    <>
      <header className={styles.webPanelHeader}>
        <h2>가방</h2>
        <span>{entries.length}종</span>
      </header>
      <ul className={styles.webList}>
        {entries.map(([itemId, count]) => (
          <li key={itemId}>
            <strong>{getShopItemById(itemId)?.displayName ?? itemId}</strong>
            <small>{getShopItemById(itemId)?.description ?? ""}</small>
            <b>×{count}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

function ShopPanel() {
  const items = [...SHOP_ITEM_IDS, ...PREMIUM_SHOP_ITEM_IDS]
    .map(getShopItemById)
    .filter((item): item is NonNullable<ReturnType<typeof getShopItemById>> => Boolean(item));
  return (
    <>
      <header className={styles.webPanelHeader}>
        <h2>상점</h2>
        <span>{items.length}개 품목</span>
      </header>
      <ul className={styles.webList}>
        {items.map(item => (
          <li key={item.id}>
            <strong>{item.displayName}</strong>
            <small>{item.description}</small>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                SHOP_ITEM_IDS.includes(item.id as (typeof SHOP_ITEM_IDS)[number])
                  ? gameStateStore.buyShopItem(item.id, 1)
                  : gameStateStore.buyPremiumShopItem(item.id, 1)
              }
            >
              ₽{item.price.toLocaleString()}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PcPanel({ player }: { player: ReturnType<GameStateStore["getCurrentLocalPlayer"]> }) {
  return (
    <>
      <header className={styles.webPanelHeader}>
        <h2>PC 박스</h2>
        <span>{player.pokemonBox.length}마리</span>
      </header>
      <div className={styles.webPcColumns}>
        <section>
          <h3>파티</h3>
          <ul className={styles.webList}>
            {player.party
              .filter(slot => slot.pokemon)
              .map(slot => (
                <li key={slot.slotIndex}>
                  <strong>{slot.pokemon?.name}</strong>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => gameStateStore.movePartyPokemonToBox(slot.slotIndex)}
                  >
                    보관
                  </Button>
                </li>
              ))}
          </ul>
        </section>
        <section>
          <h3>박스</h3>
          <ul className={styles.webList}>
            {player.pokemonBox.map((pokemon, index) => (
              <li key={`${pokemon.speciesId}-${index}`}>
                <strong>{pokemon.name}</strong>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => gameStateStore.moveBoxPokemonToParty(index)}
                >
                  데려오기
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function PokemonSprite({ speciesId }: { speciesId: number }) {
  const asset = useMemo(() => getBattlePokemonAssets(speciesId).front, [speciesId]);
  const size = 144;
  const column = asset.frame % 16;
  const row = Math.floor(asset.frame / 16);
  return (
    <span
      className={styles.webPokemonSprite}
      role="img"
      aria-label={`전국도감 ${speciesId}번 포켓몬`}
      style={{
        backgroundImage: `url("${asset.path}")`,
        backgroundPosition: `${-column * size}px ${-row * size}px`,
        backgroundSize: `${size * 16}px ${size * 16}px`,
      }}
    />
  );
}

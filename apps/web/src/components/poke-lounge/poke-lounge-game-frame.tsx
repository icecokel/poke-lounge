import type { PokeLoungeCopy } from "./poke-lounge-copy";
import { createPortal } from "react-dom";
import type { PokeLoungeRuntimeState } from "./runtime/game/game-page-state";
import {
  PokeLoungeRuntimeControls,
  PokeLoungeRuntimeScreen,
} from "./runtime/game/ui/poke-lounge-runtime-screen";
import styles from "./poke-lounge.module.css";
import { WorldScreen } from "./runtime/game/world/world-screen";
import { BattleScreen } from "./runtime/game/battle/battle-screen";
import {
  RoundCountdown,
  TournamentCelebration,
} from "./runtime/game/tournament/tournament-feedback";

export function PokeLoungeGameFrame({
  copy,
  gameRuntimeMounted,
  roomShareAvailable,
  roomShareStatus,
  runtimeState,
  touchGameDevice,
  onOpenSettings,
  onRoomShare,
}: {
  copy: PokeLoungeCopy;
  gameRuntimeMounted: boolean;
  roomShareAvailable: boolean;
  roomShareStatus: "idle" | "success" | "error";
  runtimeState: PokeLoungeRuntimeState;
  touchGameDevice: boolean;
  onOpenSettings(): void;
  onRoomShare(): void;
}) {
  const hasRuntimeScreen =
    runtimeState.phase === "entry" ||
    runtimeState.phase === "starter" ||
    runtimeState.phase === "loading" ||
    runtimeState.phase === "error";
  const lobbyTarget =
    runtimeState.phase === "lobby" && typeof document !== "undefined"
      ? document.getElementById("game-root")
      : null;
  const gameplayTarget =
    (runtimeState.phase === "world" ||
      runtimeState.phase === "battle" ||
      runtimeState.phase === "lobby") &&
    typeof document !== "undefined"
      ? document.getElementById("game-root")
      : null;
  const world =
    runtimeState.phase === "world" || runtimeState.phase === "lobby"
      ? runtimeState.world
      : undefined;
  const worldTarget = world ? gameplayTarget : null;
  const gameplayWorld =
    runtimeState.phase === "world" ||
    runtimeState.phase === "battle" ||
    runtimeState.phase === "lobby"
      ? runtimeState.world
      : undefined;
  const battle =
    runtimeState.phase === "world" ||
    runtimeState.phase === "battle" ||
    runtimeState.phase === "lobby"
      ? runtimeState.battle
      : undefined;
  const roomShareLabel =
    roomShareStatus === "success"
      ? copy.settingsShareCopied
      : roomShareStatus === "error"
        ? copy.settingsShareFailed
        : copy.settingsShare;

  return (
    <div
      className={styles.gameFrame}
      data-poke-lounge-game-frame="true"
      data-poke-lounge-mobile-screen={touchGameDevice ? "top" : undefined}
      data-poke-lounge-runtime-mounted={gameRuntimeMounted}
    >
      <div
        id="game-root"
        tabIndex={0}
        role="region"
        aria-label={copy.gameRegionLabel}
        aria-describedby="poke-lounge-accessible-status"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Z X I H Escape"
        data-poke-lounge-game-surface={gameRuntimeMounted ? "ready" : "loading"}
        data-testid="poke-lounge-game-root"
      />
      {hasRuntimeScreen ? (
        <div className={styles.runtimeScreen} data-poke-lounge-runtime-screen="true">
          <PokeLoungeRuntimeScreen
            onOpenSettings={onOpenSettings}
            roomShareAvailable={roomShareAvailable}
            roomShareLabel={roomShareLabel}
            state={runtimeState}
            onRoomShare={onRoomShare}
          />
        </div>
      ) : null}
      {lobbyTarget
        ? createPortal(
            <div
              className={`${styles.runtimeScreen} ${styles.runtimeLobbyScreen}`}
              data-poke-lounge-runtime-screen="true"
            >
              <PokeLoungeRuntimeScreen
                onOpenSettings={onOpenSettings}
                roomShareAvailable={roomShareAvailable}
                roomShareLabel={roomShareLabel}
                state={runtimeState}
                onRoomShare={onRoomShare}
              />
            </div>,
            lobbyTarget,
          )
        : null}
      {worldTarget && world
        ? createPortal(
            <WorldScreen {...world} copy={copy} desktop={!touchGameDevice} />,
            worldTarget,
          )
        : null}
      {gameplayTarget && battle
        ? createPortal(
            <BattleScreen
              copy={copy}
              desktop={!touchGameDevice}
              gameStateStore={
                runtimeState.phase === "battle" ? runtimeState.world?.gameStateStore : undefined
              }
              uiStore={battle.uiStore}
            />,
            gameplayTarget,
          )
        : null}
      {gameplayWorld?.competitiveRoundsEnabled ? (
        <>
          {!touchGameDevice && runtimeState.phase !== "lobby" ? (
            <RoundCountdown copy={copy} gameStateStore={gameplayWorld.gameStateStore} />
          ) : null}
          <TournamentCelebration gameStateStore={gameplayWorld.gameStateStore} />
        </>
      ) : null}
      {gameplayTarget
        ? createPortal(<PokeLoungeRuntimeControls state={runtimeState} />, gameplayTarget)
        : null}
      {!touchGameDevice &&
      gameRuntimeMounted &&
      !hasRuntimeScreen &&
      runtimeState.phase !== "lobby" ? (
        <button
          type="button"
          className={styles.desktopSettingsButton}
          onClick={onOpenSettings}
          aria-label={copy.settingsOpenLabel}
          data-poke-lounge-desktop-settings-toggle="true"
        >
          ⚙
        </button>
      ) : null}
    </div>
  );
}

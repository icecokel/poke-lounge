import { cn } from "@/lib/utils";
import type { PokeLoungeCopy } from "./poke-lounge-copy";
import { createPortal } from "react-dom";
import type { PokeLoungeRuntimeState } from "./runtime/game/game-page-state";
import {
  PokeLoungeRuntimeControls,
  PokeLoungeRuntimeScreen,
} from "./runtime/game/ui/poke-lounge-runtime-screen";
import { WorldScreen } from "./runtime/game/world/world-screen";
import { BattleScreen } from "./runtime/game/battle/battle-screen";
import { TournamentCelebration } from "./runtime/game/tournament/tournament-feedback";

export function PokeLoungeGameFrame({
  copy,
  gameRuntimeMounted,
  roomShareAvailable,
  roomShareStatus,
  runtimeState,
  onOpenSettings,
  onRoomShare,
}: {
  copy: PokeLoungeCopy;
  gameRuntimeMounted: boolean;
  roomShareAvailable: boolean;
  roomShareStatus: "idle" | "success" | "error";
  runtimeState: PokeLoungeRuntimeState;
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
  const playing = runtimeState.phase === "world" || runtimeState.phase === "battle";
  const roomShareLabel =
    roomShareStatus === "success"
      ? copy.settingsShareCopied
      : roomShareStatus === "error"
        ? copy.settingsShareFailed
        : copy.settingsShare;

  return (
    <div
      className={cn(
        "relative col-start-1 row-start-1 h-full w-full max-h-full max-w-full self-stretch justify-self-center bg-[var(--rom-screen-background)]",
        playing &&
          "row-start-2 h-[var(--poke-lounge-layout-frame-height,100%)] w-[var(--poke-lounge-layout-frame-width,100%)] aspect-[4/3] self-center",
        runtimeState.phase === "entry" &&
          "h-auto min-h-[calc(100dvh-var(--poke-lounge-mobile-letterbox-top)-var(--poke-lounge-mobile-letterbox-bottom))] max-h-none",
      )}
      data-poke-lounge-game-frame="true"
      data-poke-lounge-mobile-screen="top"
      data-poke-lounge-runtime-mounted={gameRuntimeMounted}
    >
      <div
        id="game-root"
        className={cn(
          "relative h-full w-full bg-[var(--rom-screen-background)]",
          runtimeState.phase === "entry" && "absolute inset-0",
        )}
        tabIndex={0}
        role="region"
        aria-label={copy.gameRegionLabel}
        aria-describedby="poke-lounge-accessible-status"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Z X I H Escape"
        data-poke-lounge-game-surface={gameRuntimeMounted ? "ready" : "loading"}
        data-testid="poke-lounge-game-root"
      />
      {hasRuntimeScreen ? (
        <div
          className={cn(
            "absolute inset-0 z-70 min-h-0 min-w-0",
            runtimeState.phase === "entry" && "relative inset-auto min-h-[inherit]",
          )}
          data-poke-lounge-runtime-screen="true"
        >
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
              className="absolute inset-0 z-45 min-h-0 min-w-0"
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
        ? createPortal(<WorldScreen {...world} copy={copy} desktop={false} />, worldTarget)
        : null}
      {gameplayTarget && battle
        ? createPortal(
            <BattleScreen
              copy={copy}
              desktop={false}
              gameStateStore={
                runtimeState.phase === "battle" ? runtimeState.world?.gameStateStore : undefined
              }
              uiStore={battle.uiStore}
            />,
            gameplayTarget,
          )
        : null}
      {gameplayWorld?.competitiveRoundsEnabled ? (
        <TournamentCelebration gameStateStore={gameplayWorld.gameStateStore} />
      ) : null}
      {gameplayTarget
        ? createPortal(<PokeLoungeRuntimeControls state={runtimeState} />, gameplayTarget)
        : null}
    </div>
  );
}

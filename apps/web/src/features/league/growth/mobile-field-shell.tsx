"use client";
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  MobileExploreDeck,
  MobileWorldScreen,
} from "@/components/poke-lounge/mobile/mobile-game-shell";
import { MobileBattleDeck } from "@/components/poke-lounge/mobile/mobile-battle-deck";
import { bindMobileViewport } from "@/components/poke-lounge/mobile/mobile-viewport";
import { GAME_FULLSCREEN_STATE_EVENT } from "@/components/poke-lounge/runtime/web-fullscreen";
import { primePokeLoungeAudio } from "@/components/poke-lounge/runtime/game/audio/poke-lounge-audio";
import { virtualGamepadController } from "@/components/poke-lounge/runtime/game/input/virtual-gamepad";
import { localizeMobileWorldUiState } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { BattleUiStore } from "@/components/poke-lounge/runtime/game/battle/battle-ui-store";
import type { WorldUiStore } from "@/components/poke-lounge/runtime/game/world/world-ui-store";
import type { MobileWorldUiAction } from "@/components/poke-lounge/runtime/game/ui/mobile-world-ui";
import type { PokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";
import type { GameStateStore } from "@/features/poke-lounge/contracts/game-state";

import { cn } from "@/lib/utils";
import {
  MOBILE_SHELL_BASE,
  MOBILE_SHELL_POSITION,
  MOBILE_SHELL_CONTENT,
  MOBILE_SHELL_DESKTOP,
  MOBILE_PLAY_GRID,
  MOBILE_PLAY_CHILDREN,
} from "@/components/poke-lounge/mobile/mobile-play-shell";

export const MOBILE_FRAME =
  "relative col-start-1 row-start-2 h-[var(--poke-lounge-layout-frame-height,100%)] w-[var(--poke-lounge-layout-frame-width,100%)] max-h-full max-w-full aspect-[4/3] self-center justify-self-center overflow-hidden bg-[var(--rom-screen-background)] outline-none";

export function LeagueMobileFieldShell({
  children,
  playing = true,
}: {
  children: ReactNode;
  playing?: boolean;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!shell.current) return;
    const binding = bindMobileViewport(shell.current, {
      fullscreenEvent: GAME_FULLSCREEN_STATE_EVENT,
    });
    return () => binding.dispose();
  }, []);
  return (
    <>
      <div className="fixed inset-0 z-[59] bg-[#17201a]" aria-hidden="true" />
      <div
        ref={shell}
        className={cn(
          MOBILE_SHELL_BASE,
          MOBILE_SHELL_POSITION,
          MOBILE_SHELL_CONTENT,
          MOBILE_SHELL_DESKTOP,
          MOBILE_PLAY_GRID,
          MOBILE_PLAY_CHILDREN,
          "z-[60]",
        )}
        data-testid="poke-lounge-page"
        data-poke-lounge-mobile-shell="true"
        data-poke-lounge-play-layout={playing ? "true" : undefined}
        data-poke-lounge-league-mobile-field="true"
      >
        {children}
      </div>
    </>
  );
}

type MobileWorldProps = { copy: PokeLoungeCopy; uiStore: WorldUiStore };
function useMobileWorld({ copy, uiStore }: MobileWorldProps) {
  const raw = useSyncExternalStore(
    uiStore.subscribe,
    () => uiStore.getSnapshot().mobile,
    () => null,
  );
  const state = raw ? localizeMobileWorldUiState(raw, copy.locale) : null;
  const dispatch = (action: MobileWorldUiAction) => {
    virtualGamepadController.reset();
    void primePokeLoungeAudio();
    uiStore.dispatch(action);
  };
  return { state, dispatch };
}

export function LeagueMobileDock({
  battle,
  battleStore,
  children,
  ...props
}: MobileWorldProps & {
  battle: boolean;
  battleStore: BattleUiStore;
  children?: ReactNode;
}) {
  const { state, dispatch } = useMobileWorld(props);
  const activePokemon = state?.party.find(pokemon => pokemon.isActive && !pokemon.isEmpty);
  return (
    <section
      className="relative z-40 grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden border-t-2 border-[rgb(23_35_28_/_66%)] bg-[radial-gradient(circle_at_12%_20%,rgb(255_255_255_/_54%)_0_1px,transparent_1.5px),linear-gradient(180deg,#e9f1df_0%,#d6e5d1_100%)] bg-[length:12px_12px,auto] text-[#17201a] [container-name:poke-controller] [container-type:inline-size]"
      data-poke-lounge-mobile-control-dock="true"
      aria-label={battle ? props.copy.mobile.battleDeckLabel : props.copy.mobile.exploreDeckLabel}
    >
      {battle ? (
        <MobileBattleDeck copy={props.copy} uiStore={battleStore} />
      ) : (
        <MobileExploreDeck
          copy={props.copy}
          input={virtualGamepadController}
          onAction={dispatch}
          activePokemon={activePokemon}
        />
      )}
      {children}
    </section>
  );
}

export function LeagueMobileWorldTask({
  battle,
  store,
  ...props
}: MobileWorldProps & {
  battle: boolean;
  store: GameStateStore;
}) {
  const { state, dispatch } = useMobileWorld(props);
  return !battle && state && state.screen !== "explore" ? (
    <MobileWorldScreen copy={props.copy} onAction={dispatch} state={state} gameStateStore={store} />
  ) : null;
}

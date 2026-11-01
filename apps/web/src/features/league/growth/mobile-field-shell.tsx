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

// Playing shell classes from poke-lounge-game.tsx:1110-1125, with league stacking.
const MOBILE_SHELL =
  "fixed z-[60] grid min-h-0 w-[var(--poke-lounge-mobile-app-width)] overflow-clip overscroll-none bg-[#17201a] text-[var(--pl-color-ink)] [--poke-lounge-container-width:100vw] [--poke-lounge-container-height:100dvh] [--poke-lounge-mobile-app-width:min(var(--poke-lounge-container-width),480px)] [--poke-lounge-mobile-letterbox-bottom:max(16px,env(safe-area-inset-bottom,0px))] [--poke-lounge-mobile-letterbox-top:max(16px,env(safe-area-inset-top,0px))] [--rom-screen-background:var(--pl-color-ink)] [container-name:poke-viewport] [container-type:size] [font-family:var(--pl-font-game)] top-[var(--poke-lounge-viewport-top,0px)] left-[calc(var(--poke-lounge-viewport-left,0px)+max(0px,(var(--poke-lounge-container-width)-480px)/2))] h-[var(--poke-lounge-container-height)] content-stretch items-stretch justify-center pt-[var(--poke-lounge-mobile-letterbox-top)] pr-[env(safe-area-inset-right,0px)] pb-[var(--poke-lounge-mobile-letterbox-bottom)] pl-[env(safe-area-inset-left,0px)] min-[769px]:[--poke-lounge-mobile-app-height:min(var(--poke-lounge-container-height),calc(var(--poke-lounge-mobile-app-width)*16/9))] min-[769px]:top-[calc(var(--poke-lounge-viewport-top,0px)+max(0px,(var(--poke-lounge-container-height)-var(--poke-lounge-mobile-app-height))/2))] min-[769px]:h-[var(--poke-lounge-mobile-app-height)] grid-cols-[minmax(0,var(--poke-lounge-layout-width,100%))] grid-rows-[auto_var(--poke-lounge-layout-frame-height,40%)_minmax(0,1fr)] gap-[var(--poke-lounge-layout-gap,8px)] data-[poke-lounge-responsive-layout=split]:grid-cols-[var(--poke-lounge-layout-frame-width)_var(--poke-lounge-layout-controller-width)] data-[poke-lounge-responsive-layout=split]:grid-rows-[auto_minmax(0,1fr)] [&>[data-poke-lounge-play-status]]:col-[1/-1] [&>[data-poke-lounge-play-status]]:row-start-1 [&>[data-poke-lounge-play-status]]:w-full [&>[data-poke-lounge-mobile-control-dock]]:col-start-1 [&>[data-poke-lounge-mobile-control-dock]]:row-start-3 [&>[data-poke-lounge-mobile-control-dock]]:h-full [&>[data-poke-lounge-mobile-control-dock]]:w-full [&>[data-poke-lounge-mobile-control-dock]]:min-h-0 [&>[data-poke-lounge-mobile-control-dock]]:min-w-0 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:col-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:row-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-l-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-t-0";
export const MOBILE_FRAME =
  "relative col-start-1 row-start-2 h-[var(--poke-lounge-layout-frame-height,100%)] w-[var(--poke-lounge-layout-frame-width,100%)] max-h-full max-w-full aspect-[4/3] self-center justify-self-center overflow-hidden bg-[var(--rom-screen-background)] outline-none";

export function LeagueMobileFieldShell({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!shell.current) return;
    const binding = bindMobileViewport(shell.current, {
      fullscreenEvent: GAME_FULLSCREEN_STATE_EVENT,
    });
    return () => binding.dispose();
  }, []);
  return (
    <div
      ref={shell}
      className={MOBILE_SHELL}
      data-testid="poke-lounge-page"
      data-poke-lounge-mobile-shell="true"
      data-poke-lounge-play-layout="true"
      data-poke-lounge-league-mobile-field="true"
    >
      {children}
    </div>
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

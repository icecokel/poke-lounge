"use client";
import { POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS } from "@poke-lounge/battle/timing";

import { useEffect, useSyncExternalStore, useState } from "react";
import { Menu } from "lucide-react";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import type { GameStateStore } from "../runtime/game/state/game-state-store";
import type { BattleUiStore } from "../runtime/game/battle/battle-ui-store";
import {
  formatRankScoreHud,
  formatRoundHudText,
  getCurrentGameRankScore,
} from "../runtime/game/scenes/world-scene-hud";
import { localizeRuntimeText } from "../runtime/game/i18n/runtime-game-localization";
import { getMobileUiCopy } from "./mobile-ui-copy";

const noSubscription = () => () => {};
const noState = () => null;

export function MobileGameSummary({
  copy,
  gameStateStore,
  competitive = false,
  detail = false,
}: {
  copy: PokeLoungeCopy;
  gameStateStore?: GameStateStore;
  competitive?: boolean;
  detail?: boolean;
}) {
  const state = useSyncExternalStore(
    gameStateStore?.subscribe ?? noSubscription,
    gameStateStore?.getState ?? noState,
    noState,
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!competitive) return;
    const timer = window.setInterval(
      () => setNow(Date.now()),
      POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [competitive]);
  if (!state) return null;
  if (detail) {
    return (
      <div className="grid gap-2 rounded-[7px] border-2 border-[#82989d] bg-[repeating-linear-gradient(0deg,#f4f8ed_0_24px,#e8efe3_24px_48px)] p-4 text-sm whitespace-pre-line shadow-[inset_0_0_0_2px_#fffdf0]">
        {competitive ? (
          <span>{localizeRuntimeText(formatRoundHudText(state.round, now), copy.locale)}</span>
        ) : null}
        <span>
          {localizeRuntimeText(
            formatRankScoreHud(
              getCurrentGameRankScore(state),
              competitive ? "competitive" : "solo",
              copy.locale,
            ),
            copy.locale,
          )}
        </span>
      </div>
    );
  }
  return competitive ? (
    <span
      className="min-w-0 text-sm leading-[1.4] whitespace-pre-line [overflow-wrap:anywhere]"
      role="timer"
      aria-live="off"
    >
      {localizeRuntimeText(formatRoundHudText(state.round, now), copy.locale)}
    </span>
  ) : null;
}

export function MobilePlayStatus({
  copy,
  gameStateStore,
  battleUiStore,
  competitive = false,
  activeScene,
  onMenu,
}: {
  copy: PokeLoungeCopy;
  gameStateStore?: GameStateStore;
  battleUiStore?: BattleUiStore;
  competitive?: boolean;
  activeScene: "world" | "battle" | null;
  onMenu(): void;
}) {
  const snapshot = useSyncExternalStore(
    battleUiStore?.subscribe ?? noSubscription,
    battleUiStore?.getSnapshot ?? noState,
    noState,
  );
  const [now, setNow] = useState(Date.now);
  const deadline = activeScene === "battle" ? snapshot?.controls?.turnEndsAtMs : null;
  const text = getMobileUiCopy(copy.locale);
  useEffect(() => {
    if (deadline == null) return;
    const timer = window.setInterval(
      () => setNow(Date.now()),
      POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [deadline]);
  return (
    <header
      className="flex min-h-12 items-center justify-between gap-3 border-b-2 border-[#17231c] bg-[linear-gradient(#fffdf0_55%,#d7e6d7_55%)] px-3 text-[#17231c] shadow-[inset_0_2px_0_#fffdf0]"
      data-poke-lounge-play-status="true"
    >
      {deadline != null ? (
        <span className="text-sm font-bold tabular-nums" role="timer" aria-live="off">
          {text.timeLeft} {Math.max(0, Math.ceil((deadline - now) / 1000))}s
        </span>
      ) : competitive ? (
        <MobileGameSummary copy={copy} gameStateStore={gameStateStore} competitive />
      ) : (
        <span className="min-w-0 text-sm leading-[1.4] whitespace-pre-line [overflow-wrap:anywhere]">
          Poke Lounge
        </span>
      )}
      <button
        type="button"
        className="grid min-h-12 min-w-12 shrink-0 touch-manipulation place-items-center border-0 bg-transparent p-2 font-bold focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3"
        onClick={onMenu}
        aria-label={copy.settingsOpenLabel}
        data-poke-lounge-mobile-menu="true"
      >
        <Menu size={24} />
      </button>
    </header>
  );
}

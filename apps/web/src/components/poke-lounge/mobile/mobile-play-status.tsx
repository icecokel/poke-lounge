"use client";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, useState } from "react";
import { Menu } from "lucide-react";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import type { GameStateStore } from "../runtime/game/state/game-state-store";
import type { BattleUiStore } from "../runtime/game/battle/battle-ui-store";
import {
  formatPokeDollars,
  formatRankScoreHud,
  formatRoundHudText,
  getCurrentGameRankScore,
} from "../runtime/game/scenes/world-scene-hud";
import { localizeRuntimeText } from "../runtime/game/i18n/runtime-game-localization";
import { getMobileUiCopy } from "./mobile-ui-copy";
import styles from "./mobile-ui.module.css";

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
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [competitive]);
  if (!state) return null;
  if (detail) {
    const player = state.playersById[state.currentPlayerId];
    return (
      <div className={styles.settingsStatus}>
        {competitive ? (
          <span>{localizeRuntimeText(formatRoundHudText(state.round, now), copy.locale)}</span>
        ) : null}
        {player ? (
          <span>
            {copy.mobile.wallet} · {formatPokeDollars(player.wallet.pokeDollars, copy.locale)}
          </span>
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
    <span className={styles.playStatus} role="timer" aria-live="off">
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
  const ref = useRef<HTMLElement>(null);
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
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  useLayoutEffect(() => {
    const bar = ref.current;
    const page = bar?.closest<HTMLElement>("[data-testid='poke-lounge-page']");
    if (!bar || !page) return;
    const measure = () =>
      page.style.setProperty(
        "--poke-lounge-mobile-status-height",
        `${bar.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => {
      observer.disconnect();
      page.style.removeProperty("--poke-lounge-mobile-status-height");
    };
  }, []);
  return (
    <header ref={ref} className={styles.playBar} data-poke-lounge-play-status="true">
      {deadline != null ? (
        <span className={styles.timer} role="timer" aria-live="off">
          {text.timeLeft} {Math.max(0, Math.ceil((deadline - now) / 1000))}s
        </span>
      ) : competitive ? (
        <MobileGameSummary copy={copy} gameStateStore={gameStateStore} competitive />
      ) : (
        <span className={styles.playStatus}>Poke Lounge</span>
      )}
      <button
        type="button"
        className={styles.menuButton}
        onClick={onMenu}
        aria-label={copy.settingsOpenLabel}
        data-poke-lounge-mobile-menu="true"
      >
        <Menu size={24} />
      </button>
    </header>
  );
}

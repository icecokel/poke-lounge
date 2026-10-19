"use client";

import { useEffect, useState } from "react";
import {
  createAccessibleGameSummary,
  localizePokeLoungeAccessibleSceneStatus,
} from "./runtime/game/ui/accessible-game-summary";
import { getDefaultGameStateStore } from "./runtime/game/state/default-game-state-store";
import {
  POKE_LOUNGE_ACCESSIBLE_STATUS_EVENT,
  type PokeLoungeAccessibleStatusDetail,
} from "./runtime/game/ui/poke-lounge-ui-events";
import { resolvePokeLoungeLocale } from "./poke-lounge-copy";
import type { BattleUiStore } from "./runtime/game/battle/battle-ui-store";

export function usePokeLoungeAccessibleStatus(
  locale?: string | null,
  activeScene?: "battle" | "world" | null,
  battleUiStore?: BattleUiStore,
): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  const [gameSummary, setGameSummary] = useState(function callback() {
    return getInitialGameSummary(resolvedLocale);
  });
  const [sceneStatus, setSceneStatus] = useState(function callback() {
    return getInitialSceneStatus(resolvedLocale);
  });

  useEffect(
    function runEffect() {
      const store = getDefaultGameStateStore();
      const syncSummary = () => {
        const battle = activeScene === "battle" ? battleUiStore?.getSnapshot().presentation : null;
        const nextSummary = createAccessibleGameSummary(store.getState(), resolvedLocale, {
          omitMutablePartyState: activeScene === "battle",
          battlePokemon: battle && !battle.authoritative.spectating ? battle.player : undefined,
        });
        setGameSummary(function callback(currentSummary) {
          return currentSummary === nextSummary ? currentSummary : nextSummary;
        });
      };

      syncSummary();
      const unsubscribeGame = store.subscribe(syncSummary);
      const unsubscribeBattle = battleUiStore?.subscribe(syncSummary);
      return () => {
        unsubscribeGame();
        unsubscribeBattle?.();
      };
    },
    [activeScene, resolvedLocale, battleUiStore],
  );

  useEffect(
    function runEffect() {
      setSceneStatus(getInitialSceneStatus(resolvedLocale));
    },
    [resolvedLocale],
  );

  useEffect(
    function runEffect() {
      const handleAccessibleStatus = (event: Event) => {
        const rawStatus = (event as CustomEvent<PokeLoungeAccessibleStatusDetail>).detail.message;
        const nextStatus = localizePokeLoungeAccessibleSceneStatus(rawStatus, resolvedLocale);
        setSceneStatus(function callback(currentStatus) {
          return currentStatus === nextStatus ? currentStatus : nextStatus;
        });
      };

      document.addEventListener(POKE_LOUNGE_ACCESSIBLE_STATUS_EVENT, handleAccessibleStatus);
      return function callback() {
        document.removeEventListener(POKE_LOUNGE_ACCESSIBLE_STATUS_EVENT, handleAccessibleStatus);
      };
    },
    [resolvedLocale],
  );

  return `${gameSummary} ${sceneStatus}`;
}

function getInitialGameSummary(locale: ReturnType<typeof resolvePokeLoungeLocale>): string {
  if (locale === "en-US") {
    return "Preparing game status";
  }

  if (locale === "ja-JP") {
    return "ゲーム状況を準備中";
  }

  return "게임 상태 준비 중";
}

function getInitialSceneStatus(locale: ReturnType<typeof resolvePokeLoungeLocale>): string {
  if (locale === "en-US") {
    return "Exploring the field";
  }

  if (locale === "ja-JP") {
    return "フィールド探索中";
  }

  return "필드 탐색";
}

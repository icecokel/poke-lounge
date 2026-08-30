"use client";

import { useEffect, useState } from "react";
import { createAccessibleGameSummary } from "./runtime/game/ui/accessible-game-summary";
import { getDefaultGameStateStore } from "./runtime/game/state/defaultGameStateStore";
import { resolvePokeLoungeLocale } from "./poke-lounge-copy";

export function usePokeLoungeAccessibleStatus(locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  const [gameSummary, setGameSummary] = useState(() => getInitialGameSummary(resolvedLocale));

  useEffect(() => {
    const store = getDefaultGameStateStore();
    const syncSummary = () => {
      const nextSummary = createAccessibleGameSummary(store.getState(), resolvedLocale);
      setGameSummary(currentSummary =>
        currentSummary === nextSummary ? currentSummary : nextSummary,
      );
    };

    syncSummary();
    return store.subscribe(syncSummary);
  }, [resolvedLocale]);

  return gameSummary;
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

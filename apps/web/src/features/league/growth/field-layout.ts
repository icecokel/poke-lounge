"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { BattleUiStore } from "@/components/poke-lounge/runtime/game/battle/battle-ui-store";

export const LEAGUE_FIELD_MOBILE_QUERY = "(max-width: 767px), (max-height: 540px)";
export type LeagueFieldLayout = "desktop" | "mobile";

function subscribeLayout(listener: () => void) {
  const media = window.matchMedia(LEAGUE_FIELD_MOBILE_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const getLayout = (): LeagueFieldLayout =>
  window.matchMedia(LEAGUE_FIELD_MOBILE_QUERY).matches ? "mobile" : "desktop";
const getServerLayout = (): LeagueFieldLayout => "desktop";

export function useLeagueFieldLayout(battle?: BattleUiStore): LeagueFieldLayout {
  const desired = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const subscribeBattle = useCallback(
    (listener: () => void) => battle?.subscribe(listener) ?? (() => {}),
    [battle],
  );
  const getBattling = useCallback(() => !!battle?.getSnapshot().presentation, [battle]);
  const battling = useSyncExternalStore(subscribeBattle, getBattling, getBattling);
  const [layout, setLayout] = useState(desired);
  useEffect(() => {
    if (!battling) setLayout(desired);
  }, [desired, battling]);
  return layout;
}

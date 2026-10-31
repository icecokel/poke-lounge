"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { localizeTrainerName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale } from "../contract";
import { growthCopy } from "./copy";
import type { GymRoam } from "./gym-roam";

export function GymRoamToast({ roam, locale }: { roam: GymRoam; locale: LeagueLocale }) {
  const { visible, appearance } = useSyncExternalStore(
    roam.subscribe,
    roam.getSnapshot,
    roam.getSnapshot,
  );
  // Remounting after a battle or a challenge must not announce the same appearance again.
  const lastAppearance = useRef(appearance);
  const [announced, setAnnounced] = useState<number | null>(null);
  useEffect(() => {
    if (lastAppearance.current === appearance) return;
    lastAppearance.current = appearance;
    setAnnounced(appearance);
    const timer = setTimeout(() => setAnnounced(null), 4_000);
    return () => clearTimeout(timer);
  }, [appearance]);
  if (!visible || announced !== appearance) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 left-1/2 z-40 -translate-x-1/2 rounded border-2 border-gray-700 bg-white px-3 py-2 text-center text-sm font-bold text-gray-900 shadow"
    >
      {growthCopy(locale).gymAppeared(localizeTrainerName(roam.npc.displayName, locale))}
    </div>
  );
}

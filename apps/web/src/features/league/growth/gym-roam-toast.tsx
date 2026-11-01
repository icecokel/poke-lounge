"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LeagueLocale } from "../contract";
import { growthCopy } from "./copy";
import type { GymRoam } from "./gym-roam";
import { localizeGymName } from "./gym-name";

export function GymRoamToast({
  roam,
  locale,
  placement = "field",
}: {
  roam: GymRoam;
  locale: LeagueLocale;
  placement?: "field" | "dock";
}) {
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
  const message = growthCopy(locale).gymAppeared(localizeGymName(roam.npc.displayName, locale));
  return (
    <div
      role="status"
      title={placement === "dock" ? message : undefined}
      className={
        placement === "dock"
          ? "pointer-events-none absolute inset-x-2 top-1.5 z-10 truncate rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-center text-sm leading-[1.25] font-black text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]"
          : "pointer-events-none absolute top-2 left-1/2 z-40 -translate-x-1/2 rounded border-2 border-gray-700 bg-white px-3 py-2 text-center text-sm font-bold text-gray-900 shadow"
      }
    >
      {message}
    </div>
  );
}

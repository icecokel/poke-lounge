"use client";

import { useEffect, useState } from "react";
import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "./copy";

const DEMO_TOAST_MS = 6_000;

// Shown once each time the league opens, over whichever screen comes first.
export function LeagueDemoToast({ locale }: { locale: LeagueLocale }) {
  const text = getLeagueCopy(locale);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), DEMO_TOAST_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      data-league-demo-toast="true"
      className="fixed top-3 left-1/2 z-[60] flex w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 items-start gap-3 rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-sm leading-[1.4] font-bold text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1,0_4px_0_#17251c]"
    >
      <p className="min-w-0 flex-1">{text.demo}</p>
      <button
        type="button"
        className="shrink-0 rounded px-1 text-base leading-none font-black hover:bg-[#e6eedb] focus-visible:outline-2 focus-visible:outline-[#2f6b78]"
        aria-label={text.demoClose}
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </div>
  );
}

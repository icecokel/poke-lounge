"use client";

import { useEffect, useState } from "react";
import { PixelButton, PixelPanel } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import styles from "./league-frame.module.css";
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
    <PixelPanel role="status" data-league-demo-toast="true" className={styles.demoToast}>
      <p className="min-w-0 flex-1">{text.demo}</p>
      <PixelButton
        type="button"
        className={styles.demoClose}
        aria-label={text.demoClose}
        onClick={() => setVisible(false)}
      >
        ×
      </PixelButton>
    </PixelPanel>
  );
}

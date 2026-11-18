"use client";

import { useRef, useState } from "react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { startGuest } from "../api/league";
import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "../shell/copy";
import { leagueErrorMessage } from "../shell/league-errors";
import styles from "../shell/league-frame.module.css";

export function LeagueGuestLoginPanel({
  locale,
  onLogin,
}: {
  locale: LeagueLocale;
  onLogin(): Promise<void>;
}) {
  const text = getLeagueCopy(locale);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await startGuest();
      await onLogin();
    } catch (error) {
      setError(error);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className={styles.panel}>
      <p id="league-guest-notice" className={styles.meta}>
        {text.guestNotice}
      </p>
      <PixelButton
        type="button"
        className={styles.primary}
        aria-describedby="league-guest-notice"
        disabled={pending}
        onClick={() => void start()}
      >
        {pending ? text.guestStarting : text.guestStart}
      </PixelButton>
      {error !== null && (
        <p role="alert" className={styles.message}>
          {leagueErrorMessage(error, locale)}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { startGuest, resumeGuest } from "../api/league";
import { LeagueApiError } from "../api/core";
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
  const [code, setCode] = useState("");
  const [resumeError, setResumeError] = useState<unknown>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const invalidCode =
    resumeError instanceof LeagueApiError && resumeError.code === "LEAGUE_GUEST_RESUME_INVALID";

  async function login(resuming: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setResumeError(null);
    try {
      if (resuming) await resumeGuest(code);
      else await startGuest();
      setCode("");
      await onLogin();
    } catch (error) {
      if (resuming) {
        setResumeError(error);
        codeInput.current?.focus();
      } else setError(error);
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
        onClick={() => void login(false)}
      >
        {pending ? text.guestStarting : text.guestStart}
      </PixelButton>
      {error !== null && (
        <p role="alert" className={styles.message}>
          {leagueErrorMessage(error, locale)}
        </p>
      )}
      <form
        method="post"
        className={styles.content}
        onSubmit={event => {
          event.preventDefault();
          void login(true);
        }}
      >
        <div className={styles.field}>
          <label htmlFor="league-resume-code">{text.guestResumeInput}</label>
          <p id="league-resume-help" className={styles.meta}>
            {text.guestResumeHelp}
          </p>
          <input
            ref={codeInput}
            id="league-resume-code"
            name="code"
            type="text"
            value={code}
            onChange={event => {
              setCode(event.target.value);
              setResumeError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={256}
            required
            readOnly={pending}
            aria-invalid={invalidCode || undefined}
            aria-describedby={`league-resume-help${resumeError !== null ? " league-resume-error" : ""}`}
          />
        </div>
        {resumeError !== null && (
          <p id="league-resume-error" role="alert" className={styles.message}>
            {leagueErrorMessage(resumeError, locale)}
          </p>
        )}
        <PixelButton type="submit" className={styles.secondary} disabled={pending}>
          {pending ? text.loading : text.guestResumeSubmit}
        </PixelButton>
      </form>
    </div>
  );
}

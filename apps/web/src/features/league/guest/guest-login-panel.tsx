"use client";

import { useRef, useState } from "react";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { startGuest, resumeGuest } from "../api/league";
import { LeagueApiError } from "../api/core";
import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "../shell/copy";
import { getGuideCopy } from "../shell/guide-copy";
import { leagueErrorMessage } from "../shell/league-errors";
import styles from "../shell/league-frame.module.css";

export function LeagueGuestLoginPanel({
  locale,
  guestAllowed,
  onLogin,
}: {
  locale: LeagueLocale;
  guestAllowed: boolean;
  onLogin(): Promise<void>;
}) {
  const text = getLeagueCopy(locale);
  const guideText = getGuideCopy(locale);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [code, setCode] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
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
      setResumeOpen(false);
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
      {guestAllowed && (
        <>
          <PixelButton
            type="button"
            className={styles.primary}
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
          <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
            <DialogTrigger asChild>
              <PixelButton type="button" className={styles.secondary} disabled={pending}>
                {text.guestResumeInput}
              </PixelButton>
            </DialogTrigger>
            <DialogContent
              className={`${styles.dialog} ${styles.entryDialog}`}
              showCloseButton={false}
              onOpenAutoFocus={event => {
                event.preventDefault();
                codeInput.current?.focus();
              }}
            >
              <DialogHeader>
                <DialogTitle>{text.guestResumeInput}</DialogTitle>
                <DialogDescription id="league-resume-help">
                  {text.guestResumeHelp}
                </DialogDescription>
              </DialogHeader>
              <form
                method="post"
                className={styles.modalForm}
                onSubmit={event => {
                  event.preventDefault();
                  void login(true);
                }}
              >
                <div className={styles.field}>
                  <label htmlFor="league-resume-code">{text.guestCodeLabel}</label>
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
                <PixelButton type="submit" className={styles.primary} disabled={pending}>
                  {pending ? text.loading : text.guestResumeSubmit}
                </PixelButton>
              </form>
              <DialogClose asChild>
                <PixelButton type="button" className={styles.secondary}>
                  {text.close}
                </PixelButton>
              </DialogClose>
            </DialogContent>
          </Dialog>
        </>
      )}
      <DiscordAccountButton locale={locale} compact />
      <div className={styles.loginSummary}>
        {guestAllowed && <p className={styles.meta}>{text.guestSummary}</p>}
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className={styles.details}>
              {text.details}
            </button>
          </DialogTrigger>
          <DialogContent className={styles.dialog} showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{text.loginInfo}</DialogTitle>
              <DialogDescription>{guideText.discordWhy}</DialogDescription>
            </DialogHeader>
            {guestAllowed && <p className={styles.meta}>{text.guestNotice}</p>}
            <DialogClose asChild>
              <PixelButton type="button" className={styles.secondary}>
                {text.close}
              </PixelButton>
            </DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

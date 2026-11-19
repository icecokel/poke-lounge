"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { issueGuestResumeCode } from "../api/league";
import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "../shell/copy";
import { leagueErrorMessage } from "../shell/league-errors";
import styles from "../shell/league-frame.module.css";

export function GuestResumeCode({
  locale,
  hasResumeCode,
}: {
  locale: LeagueLocale;
  hasResumeCode: boolean;
}) {
  const text = getLeagueCopy(locale);
  const [issued, setIssued] = useState(hasResumeCode);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const codeField = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCopyMessage = useRef("");

  const copy = useCallback(async () => {
    const field = codeField.current;
    if (!field) return;
    clearTimeout(copyTimer.current);
    let message: string;
    try {
      await navigator.clipboard.writeText(field.value);
      message = text.guestCodeCopied;
    } catch {
      field.focus();
      field.select();
      message = text.guestCodeCopyFailed;
    }
    if (message === lastCopyMessage.current) message += "\u00a0";
    lastCopyMessage.current = message;
    setCopyMessage(message);
    copyTimer.current = setTimeout(() => setCopyMessage(""), 5000);
  }, [text.guestCodeCopied, text.guestCodeCopyFailed]);

  useEffect(() => {
    const field = codeField.current;
    const onCommand = (event: Event) => {
      if ("command" in event && event.command === "--copy") void copy();
    };
    field?.addEventListener("command", onCommand);
    return () => {
      field?.removeEventListener("command", onCommand);
      clearTimeout(copyTimer.current);
    };
  }, [code, copy]);

  async function issue() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    // Once rotation is requested, the old code may already have been invalidated.
    setCode("");
    setCopyMessage("");
    try {
      const result = await issueGuestResumeCode();
      setCode(result.code);
      setIssued(true);
    } catch (error) {
      setError(error);
    } finally {
      setConfirmOpen(false);
      setPending(false);
      inFlight.current = false;
    }
  }

  const buttonText = pending ? text.loading : issued ? text.guestCodeNew : text.guestCodeGet;
  return (
    <div className={styles.panel}>
      {issued ? (
        <AlertDialog open={confirmOpen} onOpenChange={open => !pending && setConfirmOpen(open)}>
          <AlertDialogTrigger asChild>
            <PixelButton className={styles.secondary} disabled={pending}>
              {buttonText}
            </PixelButton>
          </AlertDialogTrigger>
          <AlertDialogContent className={styles.dialog}>
            <AlertDialogHeader>
              <AlertDialogTitle>{text.guestCodeConfirm}</AlertDialogTitle>
              <AlertDialogDescription>{text.guestCodeRotateNotice}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={event => {
                  event.preventDefault();
                  void issue();
                }}
              >
                {buttonText}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <PixelButton className={styles.secondary} disabled={pending} onClick={() => void issue()}>
          {buttonText}
        </PixelButton>
      )}
      <p className={styles.meta}>{text.guestCodeRotateNotice}</p>
      {code && (
        <>
          <div className={styles.field}>
            <label htmlFor="league-issued-code">{text.guestCodeLabel}</label>
            <input
              ref={codeField}
              id="league-issued-code"
              className={styles.resumeCode}
              type="text"
              value={code}
              readOnly
              autoComplete="off"
              spellCheck={false}
              aria-describedby="league-code-warning league-code-once"
            />
          </div>
          <PixelButton
            type="button"
            className={styles.secondary}
            {...{ command: "--copy", commandfor: "league-issued-code" }}
            onClick={() => {
              if (!("CommandEvent" in window)) void copy();
            }}
          >
            {text.guestCodeCopy}
          </PixelButton>
        </>
      )}
      <p role="status" className={styles.meta}>
        {copyMessage}
      </p>
      <p id="league-code-warning" className={styles.meta}>
        {text.guestCodeWarning}
      </p>
      <p id="league-code-once" className={styles.meta}>
        {text.guestCodeOnce}
      </p>
      {error !== null && (
        <p role="alert" className={styles.message}>
          {leagueErrorMessage(error, locale)}
        </p>
      )}
    </div>
  );
}

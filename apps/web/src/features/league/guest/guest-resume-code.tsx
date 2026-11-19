"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const dialogOpen = useRef(false);
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
      if (dialogOpen.current) setCode(result.code);
      setIssued(true);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  const buttonText = pending ? text.loading : issued ? text.guestCodeNew : text.guestCodeGet;
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        dialogOpen.current = next;
        setOpen(next);
        setCode("");
        setError(null);
        setCopyMessage("");
        clearTimeout(copyTimer.current);
      }}
    >
      <DialogTrigger asChild>
        <PixelButton type="button" className={styles.secondary} disabled={pending}>
          {buttonText}
        </PixelButton>
      </DialogTrigger>
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {code ? text.guestCodeLabel : issued ? text.guestCodeConfirm : text.guestCodeGet}
          </DialogTitle>
          <DialogDescription>
            {code
              ? text.guestCodeOnce
              : issued
                ? text.guestCodeRotateNotice
                : text.guestCodeWarning}
          </DialogDescription>
        </DialogHeader>
        {code ? (
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
                aria-describedby="league-code-warning league-code-rotate"
              />
            </div>
            <PixelButton
              type="button"
              className={styles.primary}
              {...{ command: "--copy", commandfor: "league-issued-code" }}
              onClick={() => {
                if (!("CommandEvent" in window)) void copy();
              }}
            >
              {text.guestCodeCopy}
            </PixelButton>
            <p role="status" className={styles.meta}>
              {copyMessage}
            </p>
            <ul className={styles.codeWarnings}>
              <li id="league-code-warning">{text.guestCodeWarning}</li>
              <li id="league-code-rotate">{text.guestCodeRotateNotice}</li>
            </ul>
          </>
        ) : (
          <PixelButton
            type="button"
            className={styles.primary}
            disabled={pending}
            onClick={() => void issue()}
          >
            {buttonText}
          </PixelButton>
        )}
        {error !== null && (
          <p role="alert" className={styles.message}>
            {leagueErrorMessage(error, locale)}
          </p>
        )}
        <DialogClose asChild>
          <PixelButton type="button" className={styles.secondary}>
            {text.close}
          </PixelButton>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

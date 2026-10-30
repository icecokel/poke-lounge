"use client";

import { useRef, useState } from "react";
import { logoutAccount } from "@/components/poke-lounge/runtime/game/network/account-session";
import { Button } from "@/components/ui/button";
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
import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "./copy";

export function LeagueAccountScreen({
  locale,
  displayName,
  onHome,
}: {
  locale: LeagueLocale;
  displayName: string;
  onHome(): void;
}) {
  const text = getLeagueCopy(locale);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      await logoutAccount();
      onHome();
    } catch {
      setFailed(true);
      setConfirmOpen(false);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <p className="break-words">{displayName}</p>
      {failed && <p role="alert">{text.logoutFailed}</p>}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={open => {
          if (!inFlight.current) setConfirmOpen(open);
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={pending}>
            {text.logout}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-h-[calc(100dvh-32px)] overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{text.logoutTitle}</AlertDialogTitle>
            <AlertDialogDescription>{text.logoutDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending && <p role="status">{text.loggingOut}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={event => {
                event.preventDefault();
                void logout();
              }}
            >
              {text.logout}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button
        disabled={pending}
        onClick={() => {
          if (!inFlight.current) onHome();
        }}
      >
        {text.home}
      </Button>
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { logoutAccount } from "@/components/poke-lounge/runtime/game/network/account-session";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { ChevronRight } from "lucide-react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import styles from "./league-frame.module.css";
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
  isGuest,
  guestAllowed,
  onHome,
}: {
  locale: LeagueLocale;
  displayName: string;
  isGuest: boolean;
  guestAllowed: boolean;
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
      <h2 className={styles.panelTitle}>{text.account}</h2>
      <p className={styles.meta}>
        {displayName}
        {isGuest && ` · ${text.guest}`}
      </p>
      {isGuest && guestAllowed && (
        <>
          <p className={styles.meta}>{text.guestAccountNotice}</p>
          <p className={styles.meta}>{text.guestDiscordNotice}</p>
          <DiscordAccountButton locale={locale} />
        </>
      )}
      {failed && (
        <p role="alert" className={styles.message}>
          {text.logoutFailed}
        </p>
      )}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={open => {
          if (!inFlight.current) setConfirmOpen(open);
        }}
      >
        <AlertDialogTrigger asChild>
          <PixelButton className={styles.secondary} disabled={pending}>
            {text.logout}
          </PixelButton>
        </AlertDialogTrigger>
        <AlertDialogContent className={styles.dialog}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isGuest ? text.guestLogoutTitle : text.logoutTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isGuest ? text.guestLogoutDescription : text.logoutDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending && <p role="status">{text.loggingOut}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className={styles.danger}
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
      <PixelButton
        className={`${styles.primary} ${styles.menuFooter}`}
        disabled={pending}
        onClick={() => {
          if (!inFlight.current) onHome();
        }}
      >
        {text.home}
        <ChevronRight size={18} aria-hidden="true" />
      </PixelButton>
    </>
  );
}

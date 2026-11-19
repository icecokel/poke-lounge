"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import styles from "../runtime/game/ui/trainer-name-entry.module.css";
import { Button } from "@/components/ui/button";
import { getAccountLogoutCopy } from "./account-logout-copy";
import type { PokeLoungeLocale } from "../poke-lounge-copy";
import {
  DISCORD_LOGIN_FAILED_HASH,
  fetchAccountSession,
  getDiscordLoginUrl,
  logoutAccount,
  type AccountSession,
} from "../runtime/game/network/account-session";

const messages = {
  "ko-KR": {
    login: "디스코드로 로그인",
    guest: "게스트로 플레이 중입니다.",
    logout: (name: string) => `디스코드 로그아웃 (${name})`,
    checking: "로그인 상태 확인 중…",
    signedIn: (name: string) => `로그인됨: ${name}`,
    signedOut: "로그인하지 않은 상태입니다.",
    preparing: "리그 준비 중",
    sessionFailed: "로그인 상태를 확인하지 못했습니다.",
    cancel: "취소",
    confirm: "로그아웃",
    loginFailed: "디스코드 로그인을 완료하지 못했습니다. 같은 브라우저에서 다시 시도해 주세요.",
    logoutFailed: "로그아웃하지 못했습니다. 다시 시도해 주세요.",
  },
  "en-US": {
    login: "Log in with Discord",
    guest: "Playing as a guest.",
    logout: (name: string) => `Log out of Discord (${name})`,
    checking: "Checking login status…",
    signedIn: (name: string) => `Logged in: ${name}`,
    signedOut: "You are not logged in.",
    preparing: "League coming soon",
    sessionFailed: "Could not check login status.",
    cancel: "Cancel",
    confirm: "Log out",
    loginFailed: "Discord login did not complete. Please try again in the same browser.",
    logoutFailed: "Could not log out. Please try again.",
  },
  "ja-JP": {
    login: "Discordでログイン",
    guest: "ゲストでプレイ中です。",
    logout: (name: string) => `Discordからログアウト（${name}）`,
    checking: "ログイン状態を確認中…",
    signedIn: (name: string) => `ログイン中：${name}`,
    signedOut: "ログインしていません。",
    preparing: "リーグ準備中",
    sessionFailed: "ログイン状態を確認できませんでした。",
    cancel: "キャンセル",
    confirm: "ログアウト",
    loginFailed: "Discordログインを完了できませんでした。同じブラウザーでもう一度お試しください。",
    logoutFailed: "ログアウトできませんでした。もう一度お試しください。",
  },
} satisfies Record<
  PokeLoungeLocale,
  {
    login: string;
    guest: string;
    logout: (name: string) => string;
    checking: string;
    signedIn: (name: string) => string;
    signedOut: string;
    preparing: string;
    sessionFailed: string;
    cancel: string;
    confirm: string;
    loginFailed: string;
    logoutFailed: string;
  }
>;

/** Account controls for the league page, separate from multiplayer. */
export function DiscordAccountButton({ locale }: { locale: PokeLoungeLocale }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const focusAfterLogout = useRef(false);
  const text = messages[locale];
  const logoutText = getAccountLogoutCopy(locale, session?.user?.provider ?? "discord");

  useEffect(
    function runEffect() {
      if (window.location.hash === DISCORD_LOGIN_FAILED_HASH) {
        setError(text.loginFailed);
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
      }
      const controller = new AbortController();
      fetchAccountSession(controller.signal).then(
        function handleResolved(nextSession) {
          setSession(nextSession);
          setLoading(false);
        },
        function handleRejected() {
          if (!controller.signal.aborted) {
            setLoading(false);
            setError(current => current ?? text.sessionFailed);
          }
        },
      );
      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) setPending(false);
      };
      window.addEventListener("pageshow", handlePageShow);
      return function cleanup() {
        controller.abort();
        window.removeEventListener("pageshow", handlePageShow);
      };
    },
    [text],
  );

  useEffect(() => {
    if (!pending && focusAfterLogout.current) {
      (trigger.current ?? status.current)?.focus({ preventScroll: true });
      focusAfterLogout.current = false;
    }
  }, [pending]);

  const handleLogin = () => {
    setPending(true);
    window.location.assign(getDiscordLoginUrl(`/${locale}/league`));
  };
  const handleLogout = () => {
    if (!session?.user) return;
    focusAfterLogout.current = true;
    setPending(true);
    setError(null);
    logoutAccount().then(
      function handleResolved() {
        setSession({ ...session, user: null });
        setPending(false);
      },
      function handleRejected() {
        setError(text.logoutFailed);
        setPending(false);
      },
    );
  };

  return (
    <>
      <p ref={status} tabIndex={-1} role="status" className="text-muted-foreground break-words">
        {loading
          ? text.checking
          : session
            ? session.user
              ? session.user.isGuest
                ? text.guest
                : text.signedIn(session.user.displayName)
              : text.signedOut
            : text.sessionFailed}
      </p>
      {session && !session.discordEnabled && !session.guestAllowed ? <p>{text.preparing}</p> : null}
      {session?.user && !session.user.isGuest ? (
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
          className="h-auto min-h-12 w-full bg-[var(--pl-color-surface-raised)] whitespace-normal break-words rounded-[4px] border-2 border-[var(--pl-color-ink)] font-black text-[var(--pl-color-ink)] shadow-[0_3px_0_var(--pl-color-ink)] font-[inherit] hover:bg-[var(--pl-color-gold-soft)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--pl-color-ink)]"
        >
          <LogOut size={20} aria-hidden="true" />
          {session.user.provider === "discord"
            ? text.logout(session.user.displayName)
            : `${text.confirm} (${session.user.displayName})`}
        </Button>
      ) : session?.discordEnabled ? (
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleLogin}
          className="h-auto min-h-12 w-full bg-[var(--pl-color-gold)] whitespace-normal rounded-[4px] border-2 border-[var(--pl-color-ink)] font-black text-[var(--pl-color-ink)] shadow-[0_3px_0_var(--pl-color-ink)] font-[inherit] hover:bg-[var(--pl-color-gold-soft)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--pl-color-ink)]"
        >
          <LogIn size={20} aria-hidden="true" />
          {text.login}
        </Button>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          className={styles.dialog}
          onCloseAutoFocus={event => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{logoutText.title}</AlertDialogTitle>
            <AlertDialogDescription>{logoutText.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="bg-[var(--pl-color-danger)]! text-[var(--pl-color-surface-raised)]! hover:bg-[#a83d35]!"
              disabled={pending}
              onClick={handleLogout}
            >
              {text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

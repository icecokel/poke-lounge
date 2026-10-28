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
import { Button } from "@/components/ui/button";
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
    logout: (name: string) => `디스코드 로그아웃 (${name})`,
    title: "디스코드 로그인 화면으로 이동할까요?",
    description:
      "로그인을 마치면 이 화면으로 돌아옵니다. 저장 데이터는 삭제하지 않지만 진행 중인 야생전과 선택 화면은 유지되지 않을 수 있습니다. 방에 다시 연결되는 동안에도 대회 시간은 계속 흐릅니다.",
    cancel: "계속 플레이",
    confirm: "이동",
    loginFailed: "디스코드 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
    logoutFailed: "로그아웃하지 못했습니다. 다시 시도해 주세요.",
  },
  "en-US": {
    login: "Log in with Discord",
    logout: (name: string) => `Log out of Discord (${name})`,
    title: "Go to the Discord login page?",
    description:
      "You return to this page after logging in. Saved data is kept, but a wild battle or unfinished selection may not be preserved. Tournament timers continue while reconnecting to the room.",
    cancel: "Keep playing",
    confirm: "Continue",
    loginFailed: "Discord login did not complete. Please try again.",
    logoutFailed: "Could not log out. Please try again.",
  },
  "ja-JP": {
    login: "Discordでログイン",
    logout: (name: string) => `Discordからログアウト（${name}）`,
    title: "Discordのログイン画面へ移動しますか？",
    description:
      "ログイン後はこの画面に戻ります。保存データは削除しませんが、進行中の野生バトルや選択は保持されない場合があります。部屋へ再接続する間も大会の時間は進みます。",
    cancel: "プレイを続ける",
    confirm: "移動",
    loginFailed: "Discordログインを完了できませんでした。もう一度お試しください。",
    logoutFailed: "ログアウトできませんでした。もう一度お試しください。",
  },
} satisfies Record<
  PokeLoungeLocale,
  {
    login: string;
    logout: (name: string) => string;
    title: string;
    description: string;
    cancel: string;
    confirm: string;
    loginFailed: string;
    logoutFailed: string;
  }
>;

/** Renders nothing until the API reports Discord login as available. */
export function DiscordAccountButton({ locale }: { locale: PokeLoungeLocale }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const text = messages[locale];

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
      fetchAccountSession(controller.signal).then(setSession, function handleRejected() {
        // Login is optional; an unreachable account API leaves the control hidden.
      });
      return function cleanup() {
        controller.abort();
      };
    },
    [text.loginFailed],
  );

  if (!session || (!session.discordEnabled && !session.user)) return null;

  const handleLogin = () => {
    setPending(true);
    window.location.assign(getDiscordLoginUrl(window.location.pathname + window.location.search));
  };
  const handleLogout = () => {
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
      {session.user ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleLogout}
          data-poke-lounge-setting-action="discord-logout"
        >
          <LogOut size={20} aria-hidden="true" />
          {text.logout(session.user.displayName)}
        </Button>
      ) : (
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
          data-poke-lounge-setting-action="discord-login"
        >
          <LogIn size={20} aria-hidden="true" />
          {text.login}
        </Button>
      )}
      {error ? (
        <p className="text-sm font-bold text-[#864033]" role="alert">
          {error}
        </p>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          className="max-h-[calc(100dvh-32px)] overflow-auto rounded-[9px] border-[3px] border-[#304550] bg-[#fffdf0] p-6 text-[#17201a] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1,0_4px_0_#304550] [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-md [&_[data-slot=button]]:border-2 [&_[data-slot=button]]:border-[#607e84] [&_[data-slot=button]]:shadow-[inset_0_0_0_1px_#fffdf0,0_2px_0_#304550]"
          data-poke-lounge-discord-login-confirm
          onCloseAutoFocus={event => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{text.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#405244]">
              {text.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleLogin}>
              {text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

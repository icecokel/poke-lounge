"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { LeagueLocale } from "../contract";
import { LeagueApiError, leagueRequest } from "../api/core";

const messages = {
  title: ["운영 테스트 계정", "Operator test accounts", "運用テストアカウント"],
  note: [
    "운영자 테스트 전용입니다. 이 계정의 기록은 순위·명예의 전당에 들어가지 않습니다.",
    "For operator testing only. These records never enter standings or the Hall of Fame.",
    "運用者テスト専用です。このアカウントの記録は順位・殿堂入りに入りません。",
  ],
  token: ["테스트 토큰", "Test token", "テストトークン"],
  account: ["계정 번호", "Account number", "アカウント番号"],
  submit: ["테스트 계정으로 로그인", "Log in with test account", "テストアカウントでログイン"],
  loggingIn: ["로그인 중", "Logging in", "ログイン中"],
  rejected: [
    "토큰이 맞지 않거나 운영 테스트 계정이 꺼져 있습니다",
    "The token is wrong, or operator test accounts are off.",
    "トークンが違うか、運用テストアカウントがオフです。",
  ],
  invalidAccount: [
    "사용할 수 없는 계정 번호입니다",
    "That account number is not available.",
    "使えないアカウント番号です。",
  ],
  failed: ["로그인하지 못했습니다", "Could not log in.", "ログインできませんでした。"],
} as const;

function copy(locale: LeagueLocale) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  return Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof messages, string>;
}

/** Shown only on `/league?agent`; the server token is the actual gate. */
export function LeagueAgentLoginPanel({
  locale,
  onLogin,
}: {
  locale: LeagueLocale;
  onLogin(): void;
}) {
  const text = copy(locale);
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).has("agent"));
  }, []);
  if (!visible) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leagueRequest("/agent/login", {
        method: "POST",
        body: { token: token.trim(), account: Number(account) },
      });
      setToken("");
      onLogin();
    } catch (error) {
      setError(
        error instanceof LeagueApiError && error.status === 404
          ? text.rejected
          : error instanceof LeagueApiError && error.code === "LEAGUE_AGENT_ACCOUNT_INVALID"
            ? text.invalidAccount
            : text.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border p-4"
      aria-label={text.title}
      onSubmit={event => void submit(event)}
    >
      <h2 className="font-bold">{text.title}</h2>
      <p className="text-muted-foreground text-sm">{text.note}</p>
      <label className="grid gap-1">
        <span>{text.token}</span>
        <input
          type="password"
          autoComplete="off"
          className="rounded-md border px-3 py-2"
          value={token}
          disabled={busy}
          onChange={event => setToken(event.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span>{text.account}</span>
        <select
          className="rounded-md border px-3 py-2"
          value={account}
          disabled={busy}
          onChange={event => setAccount(event.target.value)}
        >
          {Array.from({ length: 8 }, (_, index) => String(index + 1)).map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={busy || token.trim().length < 32}>
        {text.submit}
      </Button>
      {busy && <p role="status">{text.loggingIn}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

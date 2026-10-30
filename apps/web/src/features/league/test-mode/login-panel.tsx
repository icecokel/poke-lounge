"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeagueLocale, LeagueTestModeView } from "../contract";
import { LeagueApiError } from "../api/core";
import { leagueErrorMessage } from "../shell/league-errors";
import { getTestModeCopy } from "./copy";

export function LeagueTestLoginPanel({
  locale,
  test,
  onLogin,
}: {
  locale: LeagueLocale;
  test?: LeagueTestModeView;
  onLogin(): Promise<void>;
}) {
  const text = getTestModeCopy(locale);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!test?.login) return null;

  async function login(account: number) {
    if (busy) return;
    setBusy(true);
    setSelected(account);
    setError(null);
    try {
      const response = await fetch("/api/league-test/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-poke-lounge-league-test": "1" },
        body: JSON.stringify({ account }),
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 404) setError(text.loginUnavailable);
      else if (response.status === 403) setError(text.localhostRequired);
      else {
        const result = (await response.json()) as { ok?: boolean; error?: string } | null;
        if (!response.ok || result?.ok !== true) {
          setError(
            result?.error === "LEAGUE_TEST_ACCOUNT_INVALID"
              ? leagueErrorMessage(new LeagueApiError(502, result.error, undefined, false), locale)
              : text.loginFailed,
          );
        } else await onLogin();
      }
    } catch {
      setError(text.loginFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-label={text.accounts}>
      <h2 className="font-bold">{text.accounts}</h2>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: test.accounts }, (_, index) => index + 1).map(account => (
          <Button
            key={account}
            variant="outline"
            disabled={busy}
            onClick={() => void login(account)}
          >
            {text.account} {account}
          </Button>
        ))}
      </div>
      {busy && <p role="status">{text.loggingIn}</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <Button disabled={busy} onClick={() => selected !== null && void login(selected)}>
            {text.retry}
          </Button>
        </>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { LeagueApiError } from "../api/core";
import {
  getCurrentAttempt,
  getMe,
  getStandings,
  getStatus,
  type AttemptView,
  type StandingsView,
} from "../api/league";
import type { LeagueLocale, MeView, StatusView } from "../contract";
import { getLeagueCopy } from "./copy";

type Screen = "boot" | "closed" | "login" | "home" | "attempt" | "error";
export default function LeagueApp({ locale }: { locale: LeagueLocale }) {
  const text = getLeagueCopy(locale);
  const [screen, setScreen] = useState<Screen>("boot");
  const [status, setStatus] = useState<StatusView | null>(null);
  const [me, setMe] = useState<MeView | null>(null);
  const [standings, setStandings] = useState<StandingsView | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boot = useCallback(async () => {
    setScreen("boot");
    setError(null);
    let nextStatus: StatusView;
    try {
      nextStatus = await getStatus();
      setStatus(nextStatus);
    } catch (error) {
      if (!(error instanceof LeagueApiError) || error.status === 404 || error.status === 0) {
        setScreen("closed");
      } else {
        setError(error.code);
        setScreen("error");
      }
      return;
    }
    try {
      if (!(await fetchAccountSession()).user) {
        setScreen("login");
        return;
      }
      const [nextMe, nextStandings] = await Promise.all([getMe(), getStandings()]);
      setMe(nextMe);
      setStandings(nextStandings);
      if (nextMe.attempt?.status === "active") {
        const current = await getCurrentAttempt();
        if (current?.id === nextMe.attempt.id) {
          setAttempt(current);
          setScreen("attempt");
          return;
        }
      }
      setScreen("home");
    } catch (error) {
      if (error instanceof LeagueApiError && error.status === 401) setScreen("login");
      else {
        setError(error instanceof Error ? error.message : "NETWORK");
        setScreen("error");
      }
    }
  }, []);
  useEffect(() => {
    void boot();
  }, [boot]);
  return (
    <main className="bg-background text-foreground min-h-dvh px-4 py-10">
      <section className="bg-card border-border mx-auto grid w-full max-w-4xl gap-6 rounded-xl border p-5 sm:p-8">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{text.title}</h1>
          <a href={`/${locale}/game/poke-lounge`} className="underline">
            {text.firstScreen}
          </a>
        </header>
        {screen === "boot" && <p role="status">{text.loading}</p>}
        {screen === "closed" && <p>{text.closed}</p>}
        {screen === "login" && <DiscordAccountButton locale={locale} />}
        {screen === "error" && (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => void boot()}>{text.retry}</Button>
          </>
        )}
        {screen === "home" && status && me && standings && (
          <p>
            {me.user.nickname ?? text.unnamed} · {text.badges} {me.run?.badges ?? 0}/8
          </p>
        )}
        {screen === "attempt" && attempt && (
          <p>
            {text.resume} · {attempt.currentMatch + 1}/5
          </p>
        )}
      </section>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";
import { LeagueApiError } from "../api/core";
import {
  getCurrentAttempt,
  getMe,
  getStandings,
  getStatus,
  type AttemptView,
  type StandingsView,
} from "../api/league";
import type {
  LeagueLocale,
  LeagueRuntime,
  LeagueJudgedBattleProps,
  MeView,
  StatusView,
} from "../contract";
import { getLeagueCopy } from "./copy";
import { loadLeagueRuntime } from "./load-runtime";
import { LeagueGrowthScreen } from "../growth/league-growth-screen";
import { LeagueJudgedBattle } from "../battle/league-judged-battle";
import { EntryScreen } from "../attempt/entry-screen";
import { AttemptFlow } from "../attempt/attempt-flow";
import { LeagueHome } from "./league-home";
import { leagueErrorMessage, useRateLimitCooldown } from "./league-errors";

type Screen = "boot" | "closed" | "login" | "home" | "entry" | "attempt" | "growth" | "error";
export default function LeagueApp({ locale }: { locale: LeagueLocale }) {
  const text = getLeagueCopy(locale);
  const [screen, setScreen] = useState<Screen>("boot");
  const [status, setStatus] = useState<StatusView | null>(null);
  const [me, setMe] = useState<MeView | null>(null);
  const [standings, setStandings] = useState<StandingsView | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [attemptNeedsRefresh, setAttemptNeedsRefresh] = useState(false);
  const runtimePromise = useRef<Promise<LeagueRuntime> | null>(null);
  const [runtime, setRuntime] = useState<LeagueRuntime | null>(null);
  const blocked = useRateLimitCooldown(error);
  const ensureRuntime = useCallback(() => {
    runtimePromise.current ??= loadLeagueRuntime(locale).catch(error => {
      runtimePromise.current = null;
      throw error;
    });
    return runtimePromise.current;
  }, [locale]);
  const boot = useCallback(
    async (resume = true) => {
      setScreen("boot");
      setError(null);
      setAttemptNeedsRefresh(false);
      let nextStatus: StatusView;
      try {
        nextStatus = await getStatus();
        setStatus(nextStatus);
        setReceivedAt(performance.now());
      } catch (error) {
        if (!(error instanceof LeagueApiError) || error.status === 404 || error.status === 0)
          setScreen("closed");
        else {
          setError(error);
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
        if (resume && nextMe.attempt?.status === "active") {
          const current = await getCurrentAttempt();
          if (current?.id === nextMe.attempt.id && current.status === "active") {
            if (current.engineVersion !== LEAGUE_ENGINE_VERSION) {
              if (current.engineVersion === nextStatus.engineVersion) setAttemptNeedsRefresh(true);
              else setMe(await getMe());
            } else if (
              !nextStatus.engineVersion ||
              nextStatus.engineVersion === LEAGUE_ENGINE_VERSION
            ) {
              setRuntime(await ensureRuntime());
              setAttempt(current);
              setScreen("attempt");
              return;
            }
          } else setMe(await getMe());
        }
        setScreen("home");
      } catch (error) {
        if (error instanceof LeagueApiError && error.status === 401) setScreen("login");
        else {
          setError(error);
          setScreen("error");
        }
      }
    },
    [ensureRuntime],
  );
  useEffect(() => {
    void boot();
  }, [boot]);
  const home = useCallback(
    (error?: unknown) => {
      if (error) setNotice(leagueErrorMessage(error, locale));
      else setNotice(null);
      if (error instanceof LeagueApiError && error.status === 401) {
        setScreen("login");
        return;
      }
      void boot(false);
    },
    [boot, locale],
  );
  async function open(target: "growth" | "entry") {
    if (
      target === "entry" &&
      status?.engineVersion &&
      status.engineVersion !== LEAGUE_ENGINE_VERSION
    )
      return;
    setScreen("boot");
    setNotice(null);
    try {
      setRuntime(await ensureRuntime());
      setScreen(target);
    } catch (error) {
      setError(error);
      setScreen("error");
    }
  }
  function entered(next: AttemptView) {
    if (next.engineVersion !== LEAGUE_ENGINE_VERSION) {
      home(new LeagueApiError(409, "LEAGUE_ENGINE_VERSION_MISMATCH", undefined, false));
      return;
    }
    setAttempt(next);
    setScreen("attempt");
  }
  const mismatch =
    attemptNeedsRefresh ||
    (!!status?.engineVersion && status.engineVersion !== LEAGUE_ENGINE_VERSION);
  const JudgedBattle = useMemo(() => {
    if (!mismatch) return LeagueJudgedBattle;
    return function VersionBlockedBattle({ onAbort }: LeagueJudgedBattleProps) {
      return (
        <div className="grid gap-3" role="alert">
          <p>{text.version}</p>
          <Button onClick={() => window.location.reload()}>{text.refresh}</Button>
          <Button variant="outline" onClick={onAbort}>
            {text.cancel}
          </Button>
        </div>
      );
    };
  }, [mismatch, text.version, text.refresh, text.cancel]);
  return (
    <div className="grid gap-6">
      {notice && <p role="status">{notice}</p>}
      {screen === "boot" && <p role="status">{text.loading}</p>}
      {screen === "closed" && <p>{text.closed}</p>}
      {screen === "login" && <DiscordAccountButton locale={locale} />}
      {screen === "error" && (
        <>
          <p role="alert">{leagueErrorMessage(error, locale)}</p>
          <Button disabled={blocked} onClick={() => void boot()}>
            {text.retry}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {text.refresh}
          </Button>
        </>
      )}
      {screen === "home" && status && me && standings && (
        <LeagueHome
          locale={locale}
          status={status}
          receivedAt={receivedAt}
          me={me}
          standings={standings}
          versionMismatch={mismatch}
          onGrowth={() => void open("growth")}
          onEntry={() => void open("entry")}
          onResume={() => void boot()}
        />
      )}
      {screen === "growth" && runtime && status && me && (
        <LeagueGrowthScreen
          runtime={runtime}
          status={status}
          me={me}
          JudgedBattle={JudgedBattle}
          onExit={() => home()}
        />
      )}
      {screen === "entry" && runtime && me?.run && (
        <EntryScreen runtime={runtime} runId={me.run.id} onEntered={entered} onHome={home} />
      )}
      {screen === "attempt" && attempt && runtime && (
        <AttemptFlow key={attempt.id} runtime={runtime} initial={attempt} onHome={home} />
      )}
    </div>
  );
}

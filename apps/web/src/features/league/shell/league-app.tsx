"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { sameLeagueEngine } from "../test-mode/engine";
import { LeagueTestModeBanner } from "../test-mode/banner";
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
import { clearEntryKey } from "../attempt/entry-key";
import { LeagueHome } from "./league-home";
import { LeagueAccountScreen } from "./league-account-screen";
import { leagueErrorMessage, useRateLimitCooldown } from "./league-errors";
import { RecordsScreen, type RecordsCache } from "../records/records-screen";

type Screen =
  | "boot"
  | "closed"
  | "login"
  | "account"
  | "home"
  | "records"
  | "entry"
  | "attempt"
  | "growth"
  | "error";
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
  const recordsCache = useRef<RecordsCache>({});
  const recordsUserId = useRef<string | null>(null);
  const showLogin = useCallback(() => {
    recordsCache.current = {};
    recordsUserId.current = null;
    setScreen("login");
  }, []);
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
        const { user } = await fetchAccountSession();
        if (!user) {
          showLogin();
          return;
        }
        if (recordsUserId.current !== user.id) recordsCache.current = {};
        recordsUserId.current = user.id;
        const [nextMe, nextStandings] = await Promise.all([getMe(), getStandings()]);
        setMe(nextMe);
        setStandings(nextStandings);
        if (resume && nextMe.attempt?.status === "active") {
          const current = await getCurrentAttempt();
          if (current?.id === nextMe.attempt.id && current.status === "active") {
            if (nextMe.run) clearEntryKey(nextMe.run.id);
            if (!sameLeagueEngine(current.engineVersion)) {
              if (current.engineVersion === nextStatus.engineVersion) setAttemptNeedsRefresh(true);
              else setMe(await getMe());
            } else if (
              current.current &&
              (!nextStatus.engineVersion || sameLeagueEngine(nextStatus.engineVersion))
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
        if (error instanceof LeagueApiError && error.status === 401) showLogin();
        else {
          setError(error);
          setScreen("error");
        }
      }
    },
    [ensureRuntime, showLogin],
  );
  useEffect(() => {
    void boot();
  }, [boot]);
  const home = useCallback(
    (error?: unknown) => {
      if (error) setNotice(leagueErrorMessage(error, locale));
      else setNotice(null);
      if (error instanceof LeagueApiError && error.status === 401) {
        showLogin();
        return;
      }
      void boot(false);
    },
    [boot, locale, showLogin],
  );
  async function open(target: "growth" | "entry") {
    if (target === "entry" && status?.engineVersion && !sameLeagueEngine(status.engineVersion))
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
    if (next.status !== "active" || !next.current) {
      home(new LeagueApiError(409, "LEAGUE_ATTEMPT_NOT_ACTIVE", undefined, false));
      return;
    }
    if (!sameLeagueEngine(next.engineVersion)) {
      home(new LeagueApiError(409, "LEAGUE_ENGINE_VERSION_MISMATCH", undefined, false));
      return;
    }
    setAttempt(next);
    setScreen("attempt");
  }
  const mismatch =
    attemptNeedsRefresh || (!!status?.engineVersion && !sameLeagueEngine(status.engineVersion));
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
      <LeagueTestModeBanner locale={locale} test={status?.test} />
      {notice && <p role="status">{notice}</p>}
      {screen === "boot" && <p role="status">{text.loading}</p>}
      {screen === "closed" && <p>{text.closed}</p>}
      {screen === "login" && <DiscordAccountButton locale={locale} />}
      {screen === "account" && me && (
        <LeagueAccountScreen locale={locale} displayName={me.user.displayName} onHome={home} />
      )}
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
        <>
          <Button variant="outline" onClick={() => setScreen("account")}>
            {text.account}
          </Button>
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
            onRecords={() => setScreen("records")}
            onRefresh={() => home()}
          />
        </>
      )}
      {screen === "records" && status && me && standings && (
        <RecordsScreen
          locale={locale}
          status={status}
          me={me}
          standings={standings}
          cache={recordsCache}
          onHome={home}
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

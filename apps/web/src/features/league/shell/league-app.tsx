"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { sameLeagueEngine } from "../test-mode/engine";
import { LeagueTestModeBanner } from "../test-mode/banner";
import { LeagueTestLoginPanel } from "../test-mode/login-panel";
import { LeagueAgentLoginPanel } from "../agent/agent-login-panel";
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
import { LeagueDemoToast } from "./league-demo-toast";
import { LeagueAccountScreen } from "./league-account-screen";
import { LeagueGuide } from "./league-guide";
import { getGuideCopy } from "./guide-copy";
import frame from "./league-frame.module.css";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { ChevronLeft } from "lucide-react";
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
  const guideText = getGuideCopy(locale);
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
  // The growth screen widens itself (via :has) only once the field is showing.
  const wide = screen === "attempt" || screen === "entry" || screen === "records";
  const guide = (line: string, lead?: string) => (
    <LeagueGuide locale={locale} lead={lead} line={line} />
  );
  return (
    <div className={wide ? `${frame.frame} ${frame.wide}` : frame.frame}>
      <header className={frame.brand}>
        <h1>
          POKE LOUNGE <span>{text.title}</span>
        </h1>
        <a href={`/${locale}/game/poke-lounge`} className={frame.backLink}>
          <ChevronLeft size={16} aria-hidden="true" />
          {text.firstScreen}
        </a>
      </header>
      <LeagueTestModeBanner locale={locale} test={status?.test} />
      <LeagueDemoToast locale={locale} />
      <div className={frame.body}>
        {screen === "boot" && (
          <>
            {guide(guideText.opening)}
            <p role="status" className={`${frame.content} ${frame.meta}`}>
              {text.loading}
            </p>
          </>
        )}
        {screen === "closed" && guide(guideText.closed)}
        {notice && (
          <p role="status" className={`${frame.content} ${frame.meta}`}>
            {notice}
          </p>
        )}
        {screen === "login" && (
          <>
            {guide(guideText.register, guideText.welcome)}
            <div className={frame.content}>
              <div className={frame.panel}>
                <p className={frame.meta}>{guideText.discordWhy}</p>
                <DiscordAccountButton locale={locale} />
              </div>
              <LeagueTestLoginPanel locale={locale} test={status?.test} onLogin={() => boot()} />
              <LeagueAgentLoginPanel locale={locale} onLogin={() => void boot()} />
            </div>
          </>
        )}
        {screen === "account" && me && (
          <>
            {guide(guideText.account)}
            <div className={frame.content}>
              <div className={frame.panel}>
                <LeagueAccountScreen
                  locale={locale}
                  displayName={me.user.displayName}
                  onHome={home}
                />
              </div>
            </div>
          </>
        )}
        {screen === "error" && (
          <>
            {guide(guideText.trouble)}
            <div className={frame.content}>
              <div className={frame.panel}>
                <p role="alert" className={frame.message}>
                  {leagueErrorMessage(error, locale)}
                </p>
                <div className={frame.actions}>
                  <PixelButton
                    className={frame.primary}
                    disabled={blocked}
                    onClick={() => void boot()}
                  >
                    {text.retry}
                  </PixelButton>
                  <PixelButton className={frame.secondary} onClick={() => window.location.reload()}>
                    {text.refresh}
                  </PixelButton>
                </div>
              </div>
            </div>
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
            onRecords={() => setScreen("records")}
            onRefresh={() => home()}
            onAccount={() => setScreen("account")}
          />
        )}
        {screen === "records" && status && me && standings && (
          <div className={frame.content}>
            <RecordsScreen
              locale={locale}
              status={status}
              me={me}
              standings={standings}
              cache={recordsCache}
              onHome={home}
            />
          </div>
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
          <div className={frame.content}>
            <EntryScreen
              runtime={runtime}
              runId={me.run.id}
              badgesToConsume={me.run.badges ?? status?.test?.badgesRequired ?? 8}
              onEntered={entered}
              onHome={home}
            />
          </div>
        )}
        {screen === "attempt" && attempt && runtime && (
          <div className={frame.content}>
            <AttemptFlow key={attempt.id} runtime={runtime} initial={attempt} onHome={home} />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sameLeagueEngine } from "../test-mode/engine";
import { LeagueTestModeBanner } from "../test-mode/banner";
import { LeagueTestLoginPanel } from "../test-mode/login-panel";
import { agentLoginErrorMessage, LeagueAgentLoginPanel } from "../agent/agent-login-panel";
import { hasAgentLoginLink } from "../agent/agent-auto-login";
import { LeagueApiError } from "../api/core";
import {
  getCurrentAttempt,
  getMe,
  getStandings,
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
import { takeLeagueBoot } from "./league-boot";
import { loadLeagueRuntime } from "./load-runtime";
import { LeagueGrowthScreen } from "../growth/league-growth-screen";
import { LeagueJudgedBattle } from "../battle/league-judged-battle";
import { EntryScreen } from "../attempt/entry-screen";
import { AttemptFlow } from "../attempt/attempt-flow";
import { clearEntryKey } from "../attempt/entry-key";
import { LeagueGuestLoginPanel } from "../guest/guest-login-panel";
import { LeagueHome } from "./league-home";
import { LeagueDemoToast } from "./league-demo-toast";
import { LeagueAccountScreen } from "./league-account-screen";
import { LeagueGuide, LeagueGuideScene } from "./league-guide";
import { LeagueBootPanel } from "./league-loading";
import { getGuideCopy } from "./guide-copy";
import frame from "./league-frame.module.css";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
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
  const [agentLinkFailed, setAgentLinkFailed] = useState(false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [attemptNeedsRefresh, setAttemptNeedsRefresh] = useState(false);
  const runtimePromise = useRef<Promise<LeagueRuntime> | null>(null);
  const [runtime, setRuntime] = useState<LeagueRuntime | null>(null);
  const blocked = useRateLimitCooldown(error);
  const recordsCache = useRef<RecordsCache>({});
  const recordsUserId = useRef<string | null>(null);
  const screenBody = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const heading = screenBody.current?.querySelector<HTMLElement>("h1, h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [screen]);
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
      const initial = takeLeagueBoot();
      let nextStatus: StatusView;
      try {
        const result = await initial.status;
        nextStatus = result.value;
        setStatus(nextStatus);
        setReceivedAt(result.receivedAt);
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
        const linkError = await initial.login;
        if (linkError) {
          setAgentLinkFailed(true);
          setNotice(agentLoginErrorMessage(linkError, locale));
        }
        const { user } = await initial.account;
        if (!user) {
          showLogin();
          return;
        }
        if (recordsUserId.current !== user.id) recordsCache.current = {};
        recordsUserId.current = user.id;
        const currentRequest = resume
          ? getCurrentAttempt().then(
              value => ({ value }),
              (error: unknown) => ({ error }),
            )
          : null;
        const [nextMe, nextStandings] = await Promise.all([getMe(), getStandings()]);
        setMe(nextMe);
        setStandings(nextStandings);
        if (resume && nextMe.attempt?.status === "active") {
          const result = await currentRequest!;
          if ("error" in result) throw result.error;
          const current = result.value;
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
    [ensureRuntime, locale, showLogin],
  );
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    // Opening a login link in a tab already on this page changes only the fragment.
    const onHashChange = () => {
      if (hasAgentLoginLink()) void boot();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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
        <div className={frame.panel} role="alert">
          <p>{text.version}</p>
          <PixelButton className={frame.primary} onClick={() => window.location.reload()}>
            {text.refresh}
          </PixelButton>
          <PixelButton className={frame.secondary} onClick={onAbort}>
            {text.cancel}
          </PixelButton>
        </div>
      );
    };
  }, [mismatch, text.version, text.refresh, text.cancel]);
  // The growth screen widens itself (via :has) only once the field is showing.
  const wide = screen === "attempt" || screen === "entry";
  // Home keeps its compact layout on mobile; only boot and login share the guide scene.
  const reception = screen === "boot" || screen === "login";
  return (
    <>
      {/* Wait for the server status so a test build does not flash the mismatch warning. */}
      {status && <LeagueTestModeBanner locale={locale} test={status.test} />}
      <div
        ref={screenBody}
        className={reception ? `${frame.body} ${frame.reception}` : frame.body}
        data-league-screen-wide={wide || undefined}
      >
        {reception && <LeagueGuideScene locale={locale} />}
        {/* The login screen explains the pre-league in its info dialog and must fit one mobile screen. */}
        {status?.season?.openEnded && screen !== "login" && <LeagueDemoToast locale={locale} />}
        {screen === "boot" && <LeagueBootPanel locale={locale} />}
        {screen === "closed" && (
          <div className={frame.content}>
            <section className={`${frame.panel} ${frame.menuPanel}`}>
              <h2 className={frame.panelTitle}>{text.title}</h2>
              <p className={frame.meta}>{guideText.closed}</p>
            </section>
          </div>
        )}
        {notice && (
          <p role="status" className={`${frame.content} ${frame.meta}`}>
            {notice}
          </p>
        )}
        {screen === "login" && (
          <>
            <LeagueGuide
              lead={guideText.welcome}
              line={status?.guestAllowed ? text.guestRegister : guideText.register}
            />
            <div className={frame.content}>
              <LeagueGuestLoginPanel
                locale={locale}
                guestAllowed={status?.guestAllowed ?? false}
                onLogin={() => boot(false)}
              />
              <LeagueTestLoginPanel locale={locale} test={status?.test} onLogin={() => boot()} />
              <LeagueAgentLoginPanel
                locale={locale}
                accounts={status?.agentAccounts ?? 0}
                forceVisible={agentLinkFailed}
                onLogin={() => void boot()}
              />
            </div>
          </>
        )}
        {screen === "account" && me && (
          <>
            <div className={frame.content}>
              <div className={`${frame.panel} ${frame.menuPanel}`}>
                <LeagueAccountScreen
                  locale={locale}
                  displayName={
                    me.user.nickname ?? (me.user.isGuest ? text.unnamed : me.user.displayName)
                  }
                  isGuest={me.user.isGuest}
                  hasResumeCode={me.user.hasResumeCode}
                  provider={me.user.provider}
                  guestAllowed={status?.guestAllowed ?? false}
                  onHome={home}
                />
              </div>
            </div>
          </>
        )}
        {screen === "error" && (
          <>
            <div className={frame.content}>
              <div className={`${frame.panel} ${frame.menuPanel}`}>
                <h2 className={frame.panelTitle}>{guideText.trouble}</h2>
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
    </>
  );
}

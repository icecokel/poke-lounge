"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import NextLink from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Clock,
  Gamepad2,
  Info,
  Link2,
  Pause,
  Play,
  Shuffle,
  Target,
  Timer,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

import styles from "./page.module.css";

function DrawLoading() {
  const t = useTranslations("Game");
  return (
    <div className={styles.drawLoading}>
      <p role="status">{t("introDrawLoading")}</p>
    </div>
  );
}

const RandomDraw = dynamic(() => import("./intro-random-draw"), {
  ssr: false,
  loading: DrawLoading,
});

const modes = {
  league: {
    title: "introModesLeagueTitle",
    guide: "introModesLeagueLink",
    route: "introLeagueRoute",
    benefits: [
      ["introLeagueDefenseTitle", "introLeagueDefenseDescription", Trophy],
      ["introLeaguePaceTitle", "introLeaguePaceDescription", Clock],
      ["introLeagueScoreTitle", "introLeagueScoreDescription", Target],
      ["introLeagueGuestTitle", "introLeagueGuestDescription", UserRound],
    ],
    steps: [
      ["starter", "introLeagueStarter", "introLeagueStarterAlt", 456, 460],
      ["growth", "introLeagueGrowth", "introLeagueGrowthAlt", 480, 360],
      ["badge", "introLeagueBadge", "introLeagueBadgeAlt", 480, 417],
      ["entry", "introLeagueEntry", "introLeagueEntryAlt", 862, 544],
      ["battle", "introLeagueBattle", "introLeagueBattleAlt", 862, 687],
    ],
  },
  multiplayer: {
    title: "introModesMultiplayerTitle",
    guide: "introModesMultiplayerLink",
    route: "introMultiplayerRoute",
    benefits: [
      ["introMultiInviteTitle", "introMultiInviteDescription", Link2],
      ["introMultiAiTitle", "introMultiAiDescription", Users],
      ["introMultiRoundsTitle", "introMultiRoundsDescription", Timer],
      ["introMultiStarterTitle", "introMultiStarterDescription", Shuffle],
    ],
    steps: [
      ["lobby", "introMultiLobby", "introMultiLobbyAlt", 464, 616],
      ["starter", "introMultiPartner", "introMultiPartnerAlt", 456, 802],
      ["field", "introMultiExplore", "introMultiExploreAlt", 480, 360],
      ["tournament", "introMultiTournament", "introMultiTournamentAlt", 444, 344],
      ["results", "introMultiResults", "introMultiResultsAlt", 480, 336],
    ],
  },
} as const;

type Mode = keyof typeof modes;

function StartLink({ mode }: { mode: Mode }) {
  const t = useTranslations("Game");
  const locale = useLocale();

  return mode === "league" ? (
    <Button asChild className={styles.cta} data-mode="league">
      <NextLink href={`/${locale}/league`} prefetch={false}>
        <Trophy aria-hidden="true" />
        {t("introPlayLeague")}
      </NextLink>
    </Button>
  ) : (
    <Button asChild className={styles.cta} data-mode="multiplayer">
      <Link href="/game/poke-lounge" prefetch={false}>
        <Gamepad2 aria-hidden="true" />
        {t("introPlayTogether")}
      </Link>
    </Button>
  );
}

function Languages({ footer = false }: { footer?: boolean }) {
  const t = useTranslations("Game");
  const locale = useLocale();
  return (
    <nav
      className={styles.languages}
      aria-label={t(footer ? "introFooterLanguages" : "introLanguages")}
    >
      {routing.locales.map(language => (
        <Link
          key={language}
          href="/game"
          locale={language}
          hrefLang={language}
          aria-current={locale === language ? "page" : undefined}
        >
          {t(`introLanguage-${language}`)}
        </Link>
      ))}
    </nav>
  );
}

function Brand() {
  const t = useTranslations("Game");
  return (
    <Link href="/game" className={styles.brand}>
      <span className={styles.brandMark} aria-hidden="true" />
      {t("introBrand")}
    </Link>
  );
}

function ModeSection({ mode, children }: { mode: Mode; children?: ReactNode }) {
  const t = useTranslations("Game");
  const locale = useLocale();
  const { title, benefits, route, steps, guide } = modes[mode];

  return (
    <section id={`intro-${mode}`} className={styles.mode} data-mode={mode} tabIndex={-1}>
      <div className={styles.shell}>
        <h2>{t(title)}</h2>
        {mode === "league" && (
          <div className={styles.modeLead}>
            <p className={styles.modeHeadline}>{t("introLeagueHeadline")}</p>
            <p>{t("introLeagueHeadlineNote")}</p>
          </div>
        )}
        <ul className={styles.benefits}>
          {benefits.map(([heading, description, Icon]) => (
            <li key={heading}>
              <Icon size={26} aria-hidden="true" />
              <div>
                <h3>{t(heading)}</h3>
                <p>{t(description)}</p>
              </div>
            </li>
          ))}
        </ul>
        {mode === "league" && (
          <p className={styles.modeNote}>
            <Info size={18} aria-hidden="true" />
            {t("introLeaguePartyNote")}
          </p>
        )}
        <div className={styles.route}>
          <h3>{t(route)}</h3>
          <ol className={styles.steps}>
            {steps.map(([image, label, alt, width, height]) => (
              <li key={image}>
                <Image
                  src={`/assets/poke-lounge/guide/${mode}/${image}.webp`}
                  alt={t(alt)}
                  width={width}
                  height={height}
                  unoptimized
                />
                <span>{t(label)}</span>
              </li>
            ))}
          </ol>
        </div>
        {children}
        <div className={styles.actions}>
          <StartLink mode={mode} />
          <NextLink className={styles.guideLink} href={`/${locale}/guide/${mode}`}>
            {t(guide)} <ArrowRight size={18} aria-hidden="true" />
          </NextLink>
        </div>
      </div>
    </section>
  );
}

function useNearby() {
  const ref = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, nearby };
}

function PartnerPreview() {
  const t = useTranslations("Game");
  const { ref, nearby } = useNearby();
  return (
    <section ref={ref} className={styles.drawSection}>
      <div className={styles.drawIntro}>
        <h3>{t("introDrawTitle")}</h3>
        <p>{t("introDrawDescription")}</p>
        <div className={styles.levelNote}>
          <span>{t("introKnownLevel")}</span>
          <strong>{t("introMysteryLevel")}</strong>
        </div>
        <p className={styles.mysteryNote}>{t("introMysteryRule")}</p>
      </div>
      {nearby ? <RandomDraw /> : <DrawLoading />}
    </section>
  );
}

const videoPath = "/assets/poke-lounge/video/gameplay.mp4";

function GameplayVideo({ motionPaused }: { motionPaused: boolean }) {
  const t = useTranslations("Game");
  const video = useRef<HTMLVideoElement>(null);
  const film = useNearby();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (motionPaused) video.current?.pause();
  }, [motionPaused]);

  const showVideoError = () => {
    setPlaying(false);
    setError(true);
  };

  const toggleVideo = () => {
    const player = video.current;
    if (!player) return;

    setError(false);
    if (player.error) player.load();
    if (!player.paused) player.pause();
    else
      void player.play().catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) showVideoError();
      });
  };

  return (
    <section className={styles.videoSection}>
      <div className={styles.videoCopy}>
        <h3>{t("introVideoTitle")}</h3>
        <p>{t("introVideoDescription")}</p>
        <button
          type="button"
          className={styles.textLink}
          onClick={toggleVideo}
          aria-controls="intro-video"
        >
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {t(playing ? "introPauseVideo" : "introWatch")}
        </button>
        {error && (
          <p role="alert">
            {t("introVideoError")} <a href={videoPath}>{t("introVideoFallback")}</a>
          </p>
        )}
      </div>
      <figure ref={film.ref} className={styles.film}>
        <video
          ref={video}
          id="intro-video"
          src={videoPath}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={showVideoError}
          width={480}
          height={824}
          controls
          playsInline
          muted
          preload="none"
          poster={film.nearby ? "/assets/poke-lounge/video/gameplay-poster.jpg" : undefined}
          aria-label={t("introVideoLabel")}
        >
          <a href={videoPath}>{t("introVideoFallback")}</a>
        </video>
        <figcaption>{t("introVideoCaption")}</figcaption>
      </figure>
    </section>
  );
}

export function IntroExperience() {
  const t = useTranslations("Game");
  const locale = useLocale();
  const [motionOff, setMotionOff] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  const paused = motionOff || systemReduced;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setSystemReduced(preference.matches);
    syncPreference();
    try {
      setMotionOff(localStorage.getItem("poke-lounge-intro-motion-disabled") === "true");
    } catch {
      /* The toggle still works when browser storage is unavailable. */
    }
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  const toggleMotion = () => {
    const next = !motionOff;
    setMotionOff(next);
    try {
      localStorage.setItem("poke-lounge-intro-motion-disabled", String(next));
    } catch {
      /* Keep the current preference for this page even without storage. */
    }
  };

  return (
    <div className={styles.page} lang={locale} data-motion={paused ? "paused" : "playing"}>
      <NextLink href="#intro-main" className={styles.skipLink}>
        {t("introSkipToContent")}
      </NextLink>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Brand />
          <div className={styles.headerTools}>
            <Languages />
            <Button
              type="button"
              variant="ghost"
              className={styles.motionButton}
              role="switch"
              aria-checked={paused}
              disabled={systemReduced}
              onClick={toggleMotion}
              aria-describedby={systemReduced ? "intro-motion-system" : undefined}
            >
              <span>{t("introMotionPause")}</span>
              <span className={styles.toggleTrack} aria-hidden="true" />
            </Button>
          </div>
        </div>
        {systemReduced && (
          <span id="intro-motion-system" className={styles.srOnly}>
            {t("introSystemMotion")}
          </span>
        )}
      </header>
      <main id="intro-main" tabIndex={-1}>
        <section className={styles.hero}>
          <Image
            src="/assets/poke-lounge/intro/autumn-village.webp"
            alt={t("introHeroAlt")}
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.shell}>
            <div className={styles.dialogue}>
              <h1>{t("introTitle")}</h1>
              <p>{t("introDescription")}</p>
              <div className={styles.actions}>
                <StartLink mode="league" />
                <StartLink mode="multiplayer" />
              </div>
            </div>
          </div>
        </section>
        <nav className={styles.modeNav} aria-label={t("introModesTitle")}>
          <div className={styles.shell}>
            <NextLink href="#intro-league">
              <Trophy size={20} aria-hidden="true" />
              {t("introModesLeagueTitle")} <ArrowDown size={16} aria-hidden="true" />
            </NextLink>
            <NextLink href="#intro-multiplayer">
              <Users size={20} aria-hidden="true" />
              {t("introModesMultiplayerTitle")} <ArrowDown size={16} aria-hidden="true" />
            </NextLink>
          </div>
        </nav>
        <ModeSection mode="league" />
        <ModeSection mode="multiplayer">
          <PartnerPreview />
          <GameplayVideo motionPaused={paused} />
        </ModeSection>
        <section className={styles.finalCta}>
          <h2>{t("introFinalTitle")}</h2>
          <div className={styles.actions}>
            <StartLink mode="league" />
            <StartLink mode="multiplayer" />
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.shell}>
          <Brand />
          <p>{t("introFanNotice")}</p>
          <Languages footer />
        </div>
      </footer>
    </div>
  );
}

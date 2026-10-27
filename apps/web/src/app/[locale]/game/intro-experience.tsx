"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowRight, Pause, Play, Trophy } from "lucide-react";
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
const steps = [
  { id: "lobby", number: "01", width: 464, height: 713 },
  { id: "starter-selection", number: "02", width: 480, height: 824 },
  { id: "world", number: "03", width: 480, height: 823 },
  { id: "battle", number: "04", width: 480, height: 823 },
] as const;

function StartLink({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Game");
  return (
    <Button asChild className={`${styles.primaryCta} ${compact ? styles.compactCta : ""}`}>
      <Link href="/game/poke-lounge" prefetch={false}>
        <span>{t("introPlayTogether")}</span>
        <span className={styles.buttonKey} aria-hidden="true">
          {t("introActionKey")}
        </span>
      </Link>
    </Button>
  );
}

function Languages() {
  const t = useTranslations("Game");
  const locale = useLocale();
  return (
    <nav className={styles.languages} aria-label={t("introLanguages")}>
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

function TrainerLine({ slots = false }: { slots?: boolean }) {
  const t = useTranslations("Game");
  return (
    <div className={slots ? styles.lobbySlots : styles.trainerLine} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span
          className={styles.trainerSlot}
          key={index}
          data-ai={index > 4}
          style={{ "--slot-index": index } as CSSProperties}
        >
          {!slots && index === 7 ? <b>{t("introQuestion")}</b> : <i className={styles.trainer} />}
          {slots && <small>{t(index > 4 ? "introAi" : "introFriend")}</small>}
        </span>
      ))}
    </div>
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
    <section ref={ref} className={styles.drawSection} aria-labelledby="intro-draw-title">
      <div className={styles.drawIntro}>
        <p className={styles.eyebrow}>{t("introDrawEyebrow")}</p>
        <h2 id="intro-draw-title">{t("introDrawTitle")}</h2>
        <p>{t("introDrawDescription")}</p>
        <div className={styles.levelNote}>
          <span>{t("introKnownLevel")}</span>
          <ArrowRight size={16} aria-hidden="true" />
          <strong>{t("introMysteryLevel")}</strong>
        </div>
        <p className={styles.mysteryNote}>{t("introMysteryRule")}</p>
      </div>
      {nearby ? <RandomDraw /> : <DrawLoading />}
    </section>
  );
}

function ExploreTimer({ active, paused }: { active: boolean; paused: boolean }) {
  const t = useTranslations("Game");
  const [remaining, setRemaining] = useState(90);
  useEffect(() => {
    setRemaining(90);
    if (!active || paused) return;
    const timers = [1, 2, 3].map(second =>
      window.setTimeout(() => setRemaining(90 - second), second * 1000),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [active, paused]);
  return (
    <div className={styles.timer}>
      <span>{t("introTimerLabel")}</span>
      <strong aria-hidden="true">
        {t("introTimerValue", {
          seconds: (paused ? 27 : remaining - 60).toString().padStart(2, "0"),
        })}
      </strong>
      <small>{t("introTimerNote")}</small>
    </div>
  );
}

function Scoreboard() {
  const t = useTranslations("Game");
  const rows = [
    { name: "introTrainerBrave", score: 100, total: 245 },
    { name: "introTrainerQuick", score: 70, total: 215 },
    { name: "introTrainerAi", score: 45, total: 160 },
  ];
  return (
    <div className={styles.scoreboard}>
      <div className={styles.panelHeading}>
        <span>{t("introScoreboardTitle")}</span>
        <Trophy size={20} aria-hidden="true" />
      </div>
      <table>
        <caption>{t("introScoreExample")}</caption>
        <thead>
          <tr>
            {["Rank", "Trainer", "Round", "Total"].map(key => (
              <th scope="col" key={key}>
                {t(`introScore${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.name}>
              <td>
                <span className={styles.rank}>{index + 1}</span>
              </td>
              <th scope="row">{t(row.name)}</th>
              <td>{row.score}</td>
              <td>
                <strong>{row.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.scoreBadges}>
        {[100, 70, 45, 15].map(score => (
          <span key={score}>{t(`introScoreBadge${score}`)}</span>
        ))}
      </div>
    </div>
  );
}

export function IntroExperience() {
  const t = useTranslations("Game");
  const locale = useLocale();
  const hero = useRef<HTMLElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const film = useNearby();
  const [motionOff, setMotionOff] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  const [headerCta, setHeaderCta] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [lineHeight, setLineHeight] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
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

  useEffect(() => {
    const element = hero.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeaderCta(!entry.isIntersecting && entry.boundingClientRect.bottom <= 70);
      },
      { rootMargin: "-70px 0px 0px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = timeline.current;
    if (!element) return;
    const stages = Array.from(element.querySelectorAll<HTMLElement>("[data-intro-step]"));
    let current = -1;
    const updateLine = () => {
      const badge = stages[current]?.querySelector<HTMLElement>("[data-step-number]");
      if (badge)
        setLineHeight(
          Math.max(
            0,
            badge.getBoundingClientRect().top -
              element.getBoundingClientRect().top +
              badge.offsetHeight / 2 -
              28,
          ),
        );
    };
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        if (!visible.length) return;
        visible.sort(
          (a, b) =>
            Math.abs(
              a.boundingClientRect.top + a.boundingClientRect.height / 2 - window.innerHeight / 2,
            ) -
            Math.abs(
              b.boundingClientRect.top + b.boundingClientRect.height / 2 - window.innerHeight / 2,
            ),
        );
        current = stages.indexOf(visible[0].target as HTMLElement);
        setActiveStep(current);
        updateLine();
      },
      { rootMargin: "-42% 0px -42% 0px" },
    );
    stages.forEach(stage => observer.observe(stage));
    window.addEventListener("resize", updateLine);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLine);
    };
  }, []);

  useEffect(() => {
    if (paused) video.current?.pause();
  }, [paused]);

  const toggleMotion = () => {
    const next = !motionOff;
    setMotionOff(next);
    try {
      localStorage.setItem("poke-lounge-intro-motion-disabled", String(next));
    } catch {
      /* Keep the current preference for this page even without storage. */
    }
  };
  const toggleVideo = () => {
    const player = video.current;
    if (!player) return;
    setVideoError(false);
    if (!player.paused) player.pause();
    else void player.play().catch(() => setVideoError(true));
  };
  return (
    <div className={styles.page} data-motion={paused ? "paused" : "playing"}>
      <a href="#intro-main" className={styles.skipLink}>
        {t("introSkipToContent")}
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner} data-compact={headerCta}>
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
              <Pause size={14} aria-hidden="true" />
              <span>{t("introMotionPause")}</span>
              <span className={styles.toggleTrack} aria-hidden="true" />
            </Button>
          </div>
          {headerCta && (
            <div className={styles.headerCta}>
              <StartLink compact />
            </div>
          )}
        </div>
        {systemReduced && (
          <span id="intro-motion-system" className={styles.srOnly}>
            {t("introSystemMotion")}
          </span>
        )}
      </header>
      <main id="intro-main" tabIndex={-1}>
        <section ref={hero} className={styles.hero} aria-labelledby="intro-title">
          <Image
            src="/assets/poke-lounge/intro/autumn-village.webp"
            alt={t("introHeroAlt")}
            fill
            priority
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroInner}>
            <div className={styles.dialogue}>
              <p className={styles.dialogueEyebrow}>{t("introFinalEyebrow")}</p>
              <div className={styles.dialogueBody}>
                <h1 id="intro-title">{t("introTitle")}</h1>
                <p className={styles.heroDescription} key={locale}>
                  <span className={styles.srOnly}>{t("introDescription")}</span>
                  <span aria-hidden="true">
                    {Array.from(t("introDescription")).map((character, index) => (
                      <span
                        className={styles.typingChar}
                        key={index}
                        style={{ "--character-index": index } as CSSProperties}
                      >
                        {character}
                      </span>
                    ))}
                  </span>
                </p>
                <StartLink />
                <p className={styles.playNote}>{t("introPlayNote")}</p>
                <span className={styles.dialogueArrow} aria-hidden="true">
                  {t("introDown")}
                </span>
              </div>
            </div>
            <div className={styles.heroMini} aria-hidden="true">
              <p>{t("introHeroMiniTitle")}</p>
              <div className={styles.miniGrid}>
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index}>
                    {index === 5 ? t("introQuestion") : <i className={styles.brandMark} />}
                  </span>
                ))}
              </div>
              <span>{t("introHeroMiniNote")}</span>
            </div>
          </div>
          <a href="#intro-adventure" className={styles.scrollHint}>
            <ArrowDown size={16} aria-hidden="true" />
            {t("introScroll")}
          </a>
        </section>
        <section
          id="intro-adventure"
          className={styles.adventure}
          aria-labelledby="intro-adventure-title"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t("introJourneyEyebrow")}</p>
            <h2 id="intro-adventure-title">{t("introJourneyTitle")}</h2>
            <p>{t("introJourneyDescription")}</p>
            <div className={styles.roundRoute}>
              <span>{t("introExploreLabel")}</span>
              <ArrowRight size={18} aria-hidden="true" />
              <span>{t("introTournamentLabel")}</span>
              <b>{t("introThreeRounds")}</b>
            </div>
          </div>
          <div
            ref={timeline}
            className={styles.timeline}
            style={{ "--line-height": `${lineHeight}px` } as CSSProperties}
          >
            {steps.map((step, index) => (
              <div key={step.id}>
                <article
                  className={styles.step}
                  data-reverse={index % 2 === 1}
                  data-intro-step={index}
                  data-active={paused || activeStep >= index}
                  data-current={activeStep === index}
                >
                  <span className={styles.stepNumber} data-step-number>
                    {step.number}
                  </span>
                  <div className={styles.stepCopy}>
                    <p className={styles.eyebrow}>{t(`introStep${step.number}Eyebrow`)}</p>
                    <h3>{t(`introStep${step.number}Title`)}</h3>
                    <p>{t(`introStep${step.number}Description`)}</p>
                    {index === 0 && (
                      <>
                        <TrainerLine slots />
                        <p className={styles.stepNote}>{t("introRoomNote")}</p>
                      </>
                    )}
                    {index === 1 && (
                      <div className={styles.modeTags}>
                        <span>{t("introClassicLabel")}</span>
                        <span>{t("introRandomLabel")}</span>
                      </div>
                    )}
                    {index === 2 && <ExploreTimer active={activeStep >= 2} paused={paused} />}
                    {index === 3 && (
                      <div
                        className={styles.bracket}
                        role="img"
                        aria-label={t("introBracketLabel")}
                      >
                        <div className={styles.bracketEntrants}>
                          {Array.from({ length: 8 }, (_, i) => (
                            <span key={i} />
                          ))}
                        </div>
                        <div className={styles.bracketQuarter}>
                          {Array.from({ length: 4 }, (_, i) => (
                            <span key={i} />
                          ))}
                        </div>
                        <div className={styles.bracketSemi}>
                          <span />
                          <span />
                        </div>
                        <div className={styles.bracketFinal}>
                          <span />
                        </div>
                        <Trophy size={24} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <figure className={styles.scene}>
                    <div className={styles.sceneTop}>
                      <span>{t("introBrand")}</span>
                      <span>{step.number}</span>
                    </div>
                    <Image
                      src={`/assets/poke-lounge/guide/${step.id}.webp`}
                      alt={t(`introStep${step.number}Alt`)}
                      width={step.width}
                      height={step.height}
                      loading="lazy"
                      sizes="(max-width: 600px) 260px, 300px"
                    />
                    <figcaption>
                      <span aria-hidden="true" />
                      {t("introActualScreen")}
                    </figcaption>
                  </figure>
                </article>
                {index === 1 && <PartnerPreview />}
              </div>
            ))}
            <article
              className={`${styles.step} ${styles.finalStep}`}
              data-intro-step="4"
              data-active={paused || activeStep >= 4}
              data-current={activeStep === 4}
            >
              <span className={styles.stepNumber} data-step-number>
                {t("introFinalStepNumber")}
              </span>
              <div className={styles.stepCopy}>
                <p className={styles.eyebrow}>{t("introStep05Eyebrow")}</p>
                <h3>{t("introStep05Title")}</h3>
                <p>{t("introStep05Description")}</p>
              </div>
              <Scoreboard />
            </article>
          </div>
        </section>
        <section className={styles.videoSection} aria-labelledby="intro-video-title">
          <div className={styles.videoCopy}>
            <p className={styles.eyebrow}>{t("introVideoEyebrow")}</p>
            <h2 id="intro-video-title">{t("introVideoTitle")}</h2>
            <p>{t("introVideoDescription")}</p>
            <button
              type="button"
              className={styles.textLink}
              onClick={toggleVideo}
              aria-controls="intro-video"
            >
              {videoPlaying ? (
                <Pause size={16} aria-hidden="true" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              {t(videoPlaying ? "introPauseVideo" : "introWatch")}
            </button>
            {videoError && <p role="alert">{t("introVideoError")}</p>}
          </div>
          <figure ref={film.ref} className={styles.film} id="intro-film">
            <div className={styles.filmHeading}>
              <span>{t("introBrand")}</span>
              <span className={styles.rec}>{t("introRec")}</span>
            </div>
            <video
              ref={video}
              id="intro-video"
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onEnded={() => setVideoPlaying(false)}
              onError={() => setVideoError(true)}
              width={480}
              height={824}
              controls
              playsInline
              muted
              preload="none"
              poster={film.nearby ? "/assets/poke-lounge/video/gameplay-poster.jpg" : undefined}
              aria-label={t("introVideoLabel")}
            >
              <source src="/assets/poke-lounge/video/gameplay.mp4" type="video/mp4" />
              <a href="/assets/poke-lounge/video/gameplay.mp4">{t("introVideoFallback")}</a>
            </video>
            <figcaption>{t("introVideoCaption")}</figcaption>
          </figure>
        </section>
        <section className={styles.finalCta} aria-labelledby="intro-final-title">
          <p className={styles.eyebrow}>{t("introFinalEyebrow")}</p>
          <h2 id="intro-final-title">{t("introFinalTitle")}</h2>
          <p>{t("introFinalDescription")}</p>
          <StartLink />
          <TrainerLine />
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <p>{t("introFanNotice")}</p>
        <Languages />
      </footer>
    </div>
  );
}

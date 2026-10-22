"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Globe2,
  Home,
  Map,
  Pause,
  Play,
  Sparkles,
  Swords,
  Ticket,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

import styles from "./page.module.css";

const partners = [
  {
    id: "chikorita",
    name: "introChikorita",
    type: "introGrassType",
    description: "introChikoritaDescription",
    sprite: 152,
  },
  {
    id: "cyndaquil",
    name: "introCyndaquil",
    type: "introFireType",
    description: "introCyndaquilDescription",
    sprite: 155,
  },
  {
    id: "totodile",
    name: "introTotodile",
    type: "introWaterType",
    description: "introTotodileDescription",
    sprite: 158,
  },
] as const;

const scenes = [
  {
    image: "starter-selection",
    title: "introPartyTitle",
    description: "introPartyDescription",
    alt: "introPartyAlt",
    width: 480,
    height: 824,
  },
  {
    image: "world",
    title: "introWorldTitle",
    description: "introWorldDescription",
    alt: "introWorldAlt",
    width: 480,
    height: 823,
  },
  {
    image: "battle",
    title: "introMultiplayerTitle",
    description: "introMultiplayerDescription",
    alt: "introBattleAlt",
    width: 480,
    height: 823,
  },
] as const;

const navigation = [
  { id: "home", label: "introNavHome", icon: Home },
  { id: "friends", label: "introNavFriends", icon: Users },
  { id: "guide", label: "introNavGuide", icon: BookOpen },
  { id: "partners", label: "introNavPartners", icon: Sparkles },
] as const;

type Screen = (typeof navigation)[number]["id"];

const friendPoints = [
  { icon: Ticket, title: "introFriendsInviteTitle", description: "introFriendsInviteDescription" },
  { icon: Map, title: "introFriendsExploreTitle", description: "introFriendsExploreDescription" },
  { icon: Swords, title: "introFriendsBattleTitle", description: "introFriendsBattleDescription" },
] as const;

const languageLabels = { "ko-KR": "한국어", "en-US": "English", "ja-JP": "日本語" };

export function IntroExperience() {
  const t = useTranslations("Game");
  const locale = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef<Screen>("home");
  const [screen, setScreen] = useState<Screen>("home");
  const [activeScene, setActiveScene] = useState(0);
  const [paused, setPaused] = useState(true);
  const current = navigation.find(item => item.id === screen)!;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPaused(preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (previousScreen.current === screen) return;
    previousScreen.current = screen;
    title.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  useEffect(() => {
    const player = video.current;
    if (!player || screen !== "home" || paused) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Native controls remain available when the browser blocks autoplay.
          void player.play().catch(() => {});
        } else {
          player.pause();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(player);
    return () => {
      observer.disconnect();
      player.pause();
    };
  }, [paused, screen]);

  return (
    <div className={styles.page} data-screen={screen} data-motion={paused ? "paused" : "playing"}>
      <div className={styles.app}>
        <header className={styles.header}>
          <Link href="/game" className={styles.brand} aria-label="Poke Lounge">
            <span className={styles.brandMark} aria-hidden="true" />
            POKE LOUNGE
          </Link>
          <span className={styles.headerEdition}>A LITTLE WORLD. A NEW ADVENTURE.</span>
          <div className={styles.headerTools}>
            <Button
              variant="ghost"
              size="icon"
              className={styles.iconButton}
              aria-label={t(paused ? "introMotionResume" : "introMotionPause")}
              title={t(paused ? "introMotionResume" : "introMotionPause")}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            </Button>
            <details className={styles.languages}>
              <summary aria-label={t("introLanguages")}>
                <Globe2 size={16} aria-hidden="true" />
                <span>{locale.slice(0, 2).toUpperCase()}</span>
                <ChevronDown size={12} aria-hidden="true" />
              </summary>
              <nav aria-label={t("introLanguages")}>
                {routing.locales.map(language => (
                  <Link
                    key={language}
                    href="/game"
                    locale={language}
                    hrefLang={language}
                    aria-current={language === locale ? "page" : undefined}
                  >
                    {languageLabels[language]}
                    {language === locale && <Check size={14} aria-hidden="true" />}
                  </Link>
                ))}
              </nav>
            </details>
          </div>
        </header>
        <div className={styles.appBody}>
          <aside className={styles.sidebar}>
            <p className={styles.menuLabel}>YOUR ADVENTURE</p>
            <nav className={styles.navigation} aria-label={t("introNavigation")}>
              {navigation.map(({ id, label, icon: Icon }, index) => (
                <Button
                  key={id}
                  variant="ghost"
                  className={styles.navButton}
                  aria-current={screen === id ? "page" : undefined}
                  aria-controls={`intro-${id}`}
                  onClick={() => setScreen(id)}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{t(label)}</span>
                  <span className={styles.navNumber} aria-hidden="true">
                    0{index + 1}
                  </span>
                </Button>
              ))}
            </nav>
            <div className={styles.sidebarNote}>
              <span className={styles.brandMark} aria-hidden="true" />
              <p>{t("introEyebrow")}</p>
              <small>{t("introPlayNote")}</small>
            </div>
            <Button asChild className={styles.sidebarPlay}>
              <Link href="/game/poke-lounge">
                {t("playNow")}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <span className={styles.sidebarEdition}>POKE LOUNGE / FAN GAME</span>
          </aside>
          <main className={styles.workspace}>
            <div className={styles.screenHeader}>
              <div>
                <p className={styles.breadcrumb}>
                  POKE LOUNGE <span>/ {screen.toUpperCase()}</span>
                </p>
                <h1 ref={title} tabIndex={-1}>
                  {t(current.label)}
                </h1>
              </div>
              <span className={styles.deviceNote}>{t("introAppReady")}</span>
            </div>
            <section
              id="intro-home"
              hidden={screen !== "home"}
              className={styles.screen}
              aria-label={t("introNavHome")}
            >
              <div className={styles.homeGrid}>
                <div className={styles.homeMain}>
                  <div className={styles.welcome}>
                    <div className={styles.welcomeLandscape}>
                      <Image
                        src="/assets/poke-lounge/guide/world.webp"
                        alt={t("introWorldAlt")}
                        width={480}
                        height={823}
                        priority
                        sizes="(max-width: 700px) 100vw, 640px"
                      />
                      <span className={styles.fieldLabel}>POKE LOUNGE</span>
                    </div>
                    <div className={styles.welcomeCopy}>
                      <span className={styles.desktopBrand}>POKE LOUNGE</span>
                      <p className={styles.eyebrow}>
                        <span aria-hidden="true" /> {t("introFinalEyebrow")}
                      </p>
                      <h2>{t("introTitle")}</h2>
                      <p className={styles.welcomeDescription}>{t("pokeLoungeDesc")}</p>
                      <Button asChild className={styles.primaryCta}>
                        <Link href="/game/poke-lounge">
                          <Play size={16} fill="currentColor" aria-hidden="true" />
                          {t("introPlayTogether")}
                          <span className={styles.buttonKey} aria-hidden="true">
                            A
                          </span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className={styles.friendsShortcut}
                    onClick={() => setScreen("friends")}
                    aria-controls="intro-friends"
                  >
                    <Users aria-hidden="true" />
                    <span>{t("introFriendsCapacity")}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                  <div className={styles.galleryHeading}>
                    <h2>{t("introPreviewEyebrow")}</h2>
                    <Button
                      variant="ghost"
                      className={styles.textButton}
                      onClick={() => setScreen("guide")}
                      aria-controls="intro-guide"
                    >
                      {t("introNavGuide")}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                  <div className={styles.shots}>
                    {scenes.map((scene, index) => (
                      <Button
                        key={scene.image}
                        variant="ghost"
                        className={styles.shot}
                        aria-controls="intro-guide"
                        onClick={() => {
                          setActiveScene(index);
                          setScreen("guide");
                        }}
                      >
                        <span className={styles.shotImage}>
                          <Image
                            src={`/assets/poke-lounge/guide/${scene.image}.webp`}
                            alt={t(scene.alt)}
                            width={scene.width}
                            height={scene.height}
                            sizes="(max-width: 700px) 30vw, 200px"
                          />
                          <span className={styles.shotNumber}>0{index + 1}</span>
                        </span>
                        <span className={styles.shotTitle}>
                          {t(scene.title)}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className={styles.partnerShortcut}
                    onClick={() => setScreen("partners")}
                    aria-controls="intro-partners"
                  >
                    <span className={styles.miniPartners} aria-hidden="true">
                      {partners.map(partner => (
                        <span
                          key={partner.id}
                          className={`${styles.starter} ${styles[partner.id]}`}
                        />
                      ))}
                    </span>
                    <span>
                      <strong>{t("introNavPartners")}</strong>
                      <small>{t("introWaiting")}</small>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </div>
                <figure className={styles.film}>
                  <div className={styles.filmHeading}>
                    <Play size={14} fill="currentColor" aria-hidden="true" />
                    <h2>{t("introVideoEyebrow")}</h2>
                    <span>REC</span>
                  </div>
                  <div className={styles.videoFrame}>
                    <video
                      ref={video}
                      width={480}
                      height={824}
                      controls
                      loop
                      playsInline
                      muted
                      preload="metadata"
                      poster="/assets/poke-lounge/video/gameplay-poster.jpg"
                      aria-label={t("introVideoLabel")}
                    >
                      <source src="/assets/poke-lounge/video/gameplay.mp4" type="video/mp4" />
                      <a href="/assets/poke-lounge/video/gameplay.mp4">{t("introVideoFallback")}</a>
                    </video>
                  </div>
                  <figcaption>{t("introVideoCaption")}</figcaption>
                  <p className={styles.videoDescription}>{t("introVideoDescription")}</p>
                </figure>
              </div>
            </section>
            <section
              id="intro-friends"
              hidden={screen !== "friends"}
              className={styles.screen}
              aria-label={t("introNavFriends")}
            >
              <div className={styles.friendsIntro}>
                <p className={styles.eyebrow}>{t("introFriendsEyebrow")}</p>
                <h2>{t("introFriendsTitle")}</h2>
                <p>{t("introFriendsCapacity")}</p>
              </div>
              <div className={styles.friendsLayout}>
                <dl className={styles.friendPoints}>
                  {friendPoints.map(({ icon: Icon, title: pointTitle, description }, index) => (
                    <div key={pointTitle}>
                      <span className={styles.friendNumber} aria-hidden="true">
                        0{index + 1}
                      </span>
                      <dt>
                        <Icon size={19} aria-hidden="true" />
                        {t(pointTitle)}
                      </dt>
                      <dd>{t(description)}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.friendsScene}>
                  <Image
                    src="/assets/poke-lounge/guide/world.webp"
                    alt={t("introWorldAlt")}
                    width={480}
                    height={823}
                    sizes="(max-width: 700px) 80vw, 300px"
                  />
                  <div className={styles.sceneCaption}>
                    <Map size={16} aria-hidden="true" />
                    {t("introFriendsExploreTitle")}
                  </div>
                </div>
              </div>
              <div className={styles.startStrip}>
                <div>
                  <h3>{t("introFinalTitle")}</h3>
                  <p>{t("introFinalDescription")}</p>
                </div>
                <Button asChild className={styles.primaryCta}>
                  <Link href="/game/poke-lounge">
                    {t("introPlayTogether")}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </section>
            <section
              id="intro-guide"
              hidden={screen !== "guide"}
              className={styles.screen}
              aria-label={t("introNavGuide")}
            >
              <IntroGamePreview activeIndex={activeScene} onSelect={setActiveScene} />
            </section>
            <section
              id="intro-partners"
              hidden={screen !== "partners"}
              className={styles.screen}
              aria-label={t("introNavPartners")}
            >
              <div className={styles.partnerIntro}>
                <h2>{t("introStarterPrompt")}</h2>
                <p>{t("introChoosePartner")}</p>
              </div>
              <IntroPartnerSelector />
              <p className={styles.partnerNote}>{t("introPartnerNote")}</p>
            </section>
            <footer className={styles.footer}>
              <span>POKE LOUNGE</span>
              <p>{t("introFanNotice")}</p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function IntroPartnerSelector() {
  const t = useTranslations("Game");
  const [selected, setSelected] = useState<(typeof partners)[number]>(partners[0]);

  return (
    <div className={styles.artwork} data-partner={selected.id}>
      <div className={styles.partnerStage}>
        <div className={styles.orbit} aria-hidden="true" />
        <div key={selected.id} className={styles.partnerReveal}>
          <span className={styles.partnerType}>
            No. {selected.sprite} / {t(selected.type)}
          </span>
          <div
            role="img"
            aria-label={t(selected.name)}
            className={styles.partnerPortrait}
            style={{ backgroundImage: `url(/assets/pokemon/front/${selected.sprite}.png)` }}
          />
          <p className={styles.partnerGreeting}>{t(selected.name)}</p>
          <p className={styles.partnerDescription}>{t(selected.description)}</p>
        </div>
      </div>
      <div className={styles.starters} role="group" aria-label={t("introStarterPrompt")}>
        {partners.map(partner => (
          <Button
            key={partner.id}
            variant="ghost"
            aria-pressed={selected.id === partner.id}
            aria-label={t("introSelectPartner", { name: t(partner.name) })}
            className={styles.partnerButton}
            onClick={() => setSelected(partner)}
          >
            <span className={`${styles.starter} ${styles[partner.id]}`} aria-hidden="true" />
            <span className={styles.partnerName}>
              {selected.id === partner.id && <Check size={12} aria-hidden="true" />}
              {t(partner.name)}
            </span>
          </Button>
        ))}
      </div>
      <p className={styles.artworkCaption} aria-live="polite">
        {t("introSelectedPartner", { name: t(selected.name) })}
      </p>
    </div>
  );
}

function IntroGamePreview({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("Game");
  const active = scenes[activeIndex];

  return (
    <div className={styles.previewExperience}>
      <div className={styles.previewSteps}>
        <h2 className={styles.guideTitle}>{t("introSectionTitle")}</h2>
        <p className={styles.previewHint}>{t("introPreviewHint")}</p>
        <div role="group" aria-label={t("introSectionTitle")}>
          {scenes.map((scene, index) => (
            <Button
              key={scene.image}
              variant="ghost"
              className={styles.previewStep}
              aria-pressed={index === activeIndex}
              aria-controls="intro-preview-screen"
              onClick={() => onSelect(index)}
            >
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span>{t(scene.title)}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          ))}
        </div>
        <div className={styles.previewDetail} aria-live="polite">
          <h3>{t(active.title)}</h3>
          <p>{t(active.description)}</p>
          <div className={styles.previewControls}>
            <Button
              variant="outline"
              size="icon"
              className={styles.previewArrow}
              aria-label={t("introPreviousScene")}
              disabled={activeIndex === 0}
              onClick={() => onSelect(activeIndex - 1)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
            <span>{String(activeIndex + 1).padStart(2, "0")} / 03</span>
            <Button
              variant="outline"
              size="icon"
              className={styles.previewArrow}
              aria-label={t("introNextScene")}
              disabled={activeIndex === scenes.length - 1}
              onClick={() => onSelect(activeIndex + 1)}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      <figure id="intro-preview-screen" className={styles.previewScreen}>
        <div className={styles.previewScreenHeading}>
          <span className={styles.previewLiveDot} aria-hidden="true" />
          <span>POKE LOUNGE</span>
          <span>{String(activeIndex + 1).padStart(2, "0")} / 03</span>
        </div>
        <div className={styles.previewScreenImage}>
          <Image
            key={active.image}
            src={`/assets/poke-lounge/guide/${active.image}.webp`}
            alt={t(active.alt)}
            width={active.width}
            height={active.height}
            sizes="(max-width: 700px) 80vw, 350px"
          />
        </div>
        <figcaption aria-live="polite">
          {t("introPreviewEyebrow")} · {t(active.title)}
        </figcaption>
      </figure>
    </div>
  );
}

import { ArrowDown, ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

import { IntroGamePreview, IntroPartnerSelector } from "./intro-experience";
import styles from "./page.module.css";

export default async function GamePage() {
  const t = await getTranslations("Game");
  const languageLabels = { "ko-KR": "한국어", "en-US": "English", "ja-JP": "日本語" };

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="intro-title">
        <header className={styles.header}>
          <Link href="/game" className={styles.brand} aria-label="Poke Lounge">
            <span className={styles.brandMark} aria-hidden="true" />
            POKE LOUNGE
          </Link>
          <nav className={styles.navigation} aria-label={t("introNavigation")}>
            <a href="#how-to-play" className={styles.aboutLink}>
              {t("introExplore")}
            </a>
            <Link href="/game/poke-lounge" className={styles.headerCta}>
              {t("playNow")} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        </header>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span aria-hidden="true" />
              {t("introEyebrow")}
            </p>
            <h1 id="intro-title" className={styles.title}>
              Poke
              <br />
              Lounge<span>.</span>
            </h1>
            <h2 className={styles.tagline}>{t("introTitle")}</h2>
            <p className={styles.description}>{t("pokeLoungeDesc")}</p>
            <div className={styles.heroActions}>
              <Link href="/game/poke-lounge" className={styles.primaryCta}>
                {t("playNow")} <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
              <p className={styles.playNote}>{t("introPlayNote")}</p>
            </div>
          </div>
          <IntroPartnerSelector />
        </div>
        <a href="#how-to-play" className={styles.scrollLink}>
          <span>{t("introExplore")}</span>
          <ArrowDown size={17} aria-hidden="true" />
        </a>
        <span className={styles.heroIndex} aria-hidden="true">
          A LITTLE WORLD. A NEW ADVENTURE.
        </span>
      </section>
      <section id="gameplay-film" className={styles.film} aria-labelledby="gameplay-film-title">
        <div className={styles.filmCopy}>
          <p className={styles.sectionEyebrow}>{t("introVideoEyebrow")}</p>
          <h2 id="gameplay-film-title">{t("introVideoTitle")}</h2>
          <p className={styles.sectionDescription}>{t("introVideoDescription")}</p>
          <Link href="/game/poke-lounge" className={styles.primaryCta}>
            {t("playNow")} <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>
        <figure className={styles.filmFrame}>
          <video
            className={styles.filmVideo}
            width={480}
            height={824}
            controls
            autoPlay
            playsInline
            muted
            preload="auto"
            poster="/assets/poke-lounge/video/gameplay-poster.jpg"
            aria-label={t("introVideoLabel")}
          >
            <source src="/assets/poke-lounge/video/gameplay.mp4" type="video/mp4" />
            <a href="/assets/poke-lounge/video/gameplay.mp4">{t("introVideoFallback")}</a>
          </video>
          <figcaption>{t("introVideoCaption")}</figcaption>
        </figure>
      </section>
      <section id="how-to-play" className={styles.gameplay} aria-labelledby="gameplay-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>{t("introSectionEyebrow")}</p>
          <h2 id="gameplay-title">{t("introSectionTitle")}</h2>
          <p className={styles.sectionDescription}>{t("introPreviewDescription")}</p>
        </div>
        <IntroGamePreview />
      </section>
      <section className={styles.finalCta} aria-labelledby="final-title">
        <p className={styles.eyebrow}>{t("introFinalEyebrow")}</p>
        <h2 id="final-title">{t("introFinalTitle")}</h2>
        <p>{t("introFinalDescription")}</p>
        <Link href="/game/poke-lounge" className={styles.primaryCta}>
          {t("playNow")} <ArrowUpRight size={20} aria-hidden="true" />
        </Link>
      </section>
      <footer className={styles.footer}>
        <div>
          <span className={styles.footerBrand}>POKE LOUNGE</span>
          <p>{t("introFanNotice")}</p>
        </div>
        <nav aria-label={t("introLanguages")}>
          {routing.locales.map(locale => (
            <Link key={locale} href="/game" locale={locale} hrefLang={locale}>
              {languageLabels[locale]}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}

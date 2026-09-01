import Image from "next/image";
import { getTranslations } from "next-intl/server";

import themeStyles from "@/components/poke-lounge/poke-lounge-theme.module.css";
import { Link } from "@/i18n/navigation";

import styles from "./page.module.css";

export default async function GamePage() {
  const t = await getTranslations("Game");
  const features = [
    { title: t("introWorldTitle"), description: t("introWorldDescription") },
    { title: t("introPartyTitle"), description: t("introPartyDescription") },
    { title: t("introMultiplayerTitle"), description: t("introMultiplayerDescription") },
  ];

  return (
    <main className={`${styles.page} ${themeStyles.theme}`}>
      <section className={styles.hero} aria-labelledby="poke-lounge-intro-title">
        <header className={styles.header}>
          <Link href="/game" className={styles.brand} aria-label="Poke Lounge">
            <span className={styles.brandMark} aria-hidden="true" />
            Poke Lounge
          </Link>
          <Link href="/game/poke-lounge" className={styles.headerCta}>
            {t("playNow")}
          </Link>
        </header>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{t("introEyebrow")}</p>
            <h1 id="poke-lounge-intro-title" className={styles.title}>
              <span>Poke Lounge</span>
              {t("introTitle")}
            </h1>
            <p className={styles.description}>{t("pokeLoungeDesc")}</p>
            <div className={styles.heroActions}>
              <Link href="/game/poke-lounge" className={styles.primaryCta}>
                {t("playNow")}
                <span aria-hidden="true">→</span>
              </Link>
              <span className={styles.playNote}>{t("introPlayNote")}</span>
            </div>
          </div>

          <div className={styles.starterStage} aria-label={t("introStarterLabel")}>
            <div className={`${styles.starter} ${styles.chikorita}`} aria-hidden="true" />
            <div className={`${styles.starter} ${styles.cyndaquil}`} aria-hidden="true" />
            <div className={`${styles.starter} ${styles.totodile}`} aria-hidden="true" />
            <p className={styles.starterPrompt}>{t("introStarterPrompt")}</p>
          </div>
        </div>
      </section>

      <section className={styles.preview} aria-labelledby="poke-lounge-preview-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>{t("introPreviewEyebrow")}</p>
          <div>
            <h2 id="poke-lounge-preview-title">{t("introPreviewTitle")}</h2>
            <p className={styles.previewDescription}>{t("introPreviewDescription")}</p>
          </div>
        </div>
        <figure className={styles.previewFrame}>
          <Image
            src="/assets/poke-lounge/game-intro-multiplayer.png"
            alt={t("introPreviewAlt")}
            width={1440}
            height={900}
            priority
            sizes="(max-width: 600px) calc(100vw - 36px), 1120px"
            className={styles.previewImage}
          />
        </figure>
      </section>

      <section className={styles.features} aria-labelledby="poke-lounge-features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>{t("introSectionEyebrow")}</p>
          <h2 id="poke-lounge-features-title">{t("introSectionTitle")}</h2>
        </div>
        <div className={styles.featureList}>
          {features.map(function mapFeature(feature, index) {
            return (
              <article key={feature.title} className={styles.feature}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="poke-lounge-final-title">
        <div>
          <p>{t("introFinalEyebrow")}</p>
          <h2 id="poke-lounge-final-title">{t("introFinalTitle")}</h2>
        </div>
        <Link href="/game/poke-lounge" className={styles.primaryCta}>
          {t("playNow")}
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}

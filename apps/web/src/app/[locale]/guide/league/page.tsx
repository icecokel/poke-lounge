import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { POKE_LOUNGE_SITE_NAME, resolveMetadataLocale } from "@/lib/seo/page-metadata";
import styles from "./page.module.css";

const guidePath = "/guide/league";
const assetRoot = "/assets/poke-lounge/guide/league";
const screenshots = {
  reception: [450, 269],
  starter: [456, 460],
  growth: [480, 360],
  badge: [480, 417],
  entry: [862, 544],
  battle: [862, 687],
  "match-score": [510, 218],
  ranking: [422, 498],
} as const;
const steps = ["starter", "growth", "badge", "entry", "battle"] as const;
const rules = ["level", "items", "recovery"] as const;

type ScreenshotName = keyof typeof screenshots;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveMetadataLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "LeagueGuide" });
  const title = `${t("title")} | ${POKE_LOUNGE_SITE_NAME}`;
  const description = t("summary");
  const canonical = `/${locale}${guidePath}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(
          routing.locales.map(language => [language, `/${language}${guidePath}`]),
        ),
        "x-default": `/${routing.defaultLocale}${guidePath}`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: POKE_LOUNGE_SITE_NAME,
      images: [{ url: `${assetRoot}/card.webp`, alt: t("media.battle") }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${assetRoot}/card.webp`],
    },
  };
}

function Screenshot({
  name,
  alt,
  priority,
}: {
  name: ScreenshotName;
  alt: string;
  priority?: boolean;
}) {
  const [width, height] = screenshots[name];

  return (
    <figure className={styles.capture}>
      <Image
        src={`${assetRoot}/${name}.webp`}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        unoptimized
      />
    </figure>
  );
}

export default async function LeagueGuidePage() {
  const [t, game, locale] = await Promise.all([
    getTranslations("LeagueGuide"),
    getTranslations("Game"),
    getLocale(),
  ]);

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#league-guide">
        {game("introSkipToContent")}
      </a>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Link href="/game" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            {game("introBrand")}
          </Link>
          <nav className={styles.languages} aria-label={game("introLanguages")}>
            {routing.locales.map(language => (
              <NextLink
                key={language}
                href={`/${language}${guidePath}`}
                hrefLang={language}
                aria-current={locale === language ? "page" : undefined}
              >
                {game(`introLanguage-${language}`)}
              </NextLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="league-guide" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="league-title">
          <div className={`${styles.shell} ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <h1 id="league-title">{t("title")}</h1>
              <p>{t("summary")}</p>
              <Button asChild className={styles.play}>
                <NextLink href={`/${locale}/league`} prefetch={false}>
                  {t("play")} <ArrowRight aria-hidden="true" />
                </NextLink>
              </Button>
            </div>
            <Screenshot name="reception" alt={t("media.reception")} priority />
          </div>
        </section>

        <section className={`${styles.shell} ${styles.section}`} aria-labelledby="league-route">
          <h2 id="league-route">{t("route")}</h2>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step} className={styles.step}>
                <div className={styles.stepCopy}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{t(`${step}Title`)}</h3>
                  <p>{t(`${step}Body`)}</p>
                </div>
                <Screenshot name={step} alt={t(`media.${step}`)} />
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.rules} aria-labelledby="league-rules">
          <div className={`${styles.shell} ${styles.section}`}>
            <h2 id="league-rules">{t("rulesTitle")}</h2>
            <dl className={styles.rulesList}>
              {rules.map(rule => (
                <div key={rule}>
                  <dt>{t(`${rule}Title`)}</dt>
                  <dd>{t(`${rule}Body`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className={`${styles.shell} ${styles.section}`}>
          <section className={styles.detail} aria-labelledby="league-score">
            <div className={styles.detailCopy}>
              <h2 id="league-score">{t("scoringTitle")}</h2>
              <p>{t("scoringBody")}</p>
            </div>
            <Screenshot name="match-score" alt={t("media.match-score")} />
          </section>
          <section className={styles.detail} aria-labelledby="league-rank">
            <div className={styles.detailCopy}>
              <h2 id="league-rank">{t("rankingTitle")}</h2>
              <p>{t("rankingBody")}</p>
              <p>{t("defenseBody")}</p>
              <p>{t("npcBody")}</p>
            </div>
            <Screenshot name="ranking" alt={t("media.ranking")} />
          </section>
        </div>

        <section className={styles.season} aria-labelledby="league-season">
          <div className={`${styles.shell} ${styles.section}`}>
            <h2 id="league-season">{t("seasonTitle")}</h2>
            <p>{t("seasonBody")}</p>
            <p>{t("officialBody")}</p>
          </div>
        </section>
      </main>
      <footer className={`${styles.shell} ${styles.footer}`}>
        <Link href="/game">
          <ArrowLeft size={16} aria-hidden="true" /> {t("intro")}
        </Link>
        <NextLink href={`/${locale}/guide/multiplayer`} prefetch={false}>
          {t("multiplayer")} <ArrowRight size={16} aria-hidden="true" />
        </NextLink>
      </footer>
    </div>
  );
}

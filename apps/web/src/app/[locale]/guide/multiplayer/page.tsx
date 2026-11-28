import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

import styles from "./page.module.css";

type Props = { params: Promise<{ locale: Locale }> };

const assetPath = "/assets/poke-lounge/guide/multiplayer";

const sections = [
  { id: "lobby", images: [{ id: "lobby", width: 464, height: 616 }] },
  { id: "starter", images: [{ id: "starter", width: 456, height: 802 }] },
  { id: "explore", images: [{ id: "wild", width: 480, height: 822 }] },
  {
    id: "tournament",
    images: [
      { id: "tournament", width: 444, height: 344 },
      { id: "battle", width: 480, height: 360 },
    ],
  },
  { id: "results", images: [{ id: "results", width: 480, height: 336 }] },
  { id: "controls", images: [{ id: "mobile", width: 390, height: 844 }] },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "MultiplayerGuide" });
  return { title: t("title"), description: t("summary") };
}

export default async function MultiplayerGuidePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MultiplayerGuide");
  const game = await getTranslations("Game");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.backLink} href="/game">
            <ArrowLeft size={16} aria-hidden="true" />
            {t("back")}
          </Link>
          {/* Reload the root layout so the document language follows the selected locale. */}
          <nav className={styles.languages} aria-label={game("introLanguages")}>
            {routing.locales.map(language => (
              <a
                key={language}
                href={`/${language}/guide/multiplayer`}
                hrefLang={language}
                aria-current={locale === language ? "page" : undefined}
              >
                {game(`introLanguage-${language}`)}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <h1>{t("title")}</h1>
            <p>{t("summary")}</p>
            <div className={styles.actions}>
              <Button asChild className={styles.start}>
                <Link href="/game/poke-lounge" prefetch={false}>
                  {t("start")} <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </Button>
              <a className={styles.textLink} href="#lobby">
                {t("lobby.title")} <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure className={styles.capture}>
            <Image
              src={`${assetPath}/field.webp`}
              alt={t("images.field")}
              width={480}
              height={360}
              loading="eager"
              unoptimized
            />
          </figure>
        </div>
        <div className={styles.sections}>
          {sections.map(section => (
            <section
              className={styles.section}
              id={section.id}
              key={section.id}
              aria-labelledby={`${section.id}-title`}
            >
              <div className={styles.copy}>
                <h2 id={`${section.id}-title`}>{t(`${section.id}.title`)}</h2>
                <p>{t(`${section.id}.description`)}</p>
                {section.id === "lobby" && (
                  <ul>
                    <li>{t("lobby.participants")}</li>
                    <li>{t("lobby.aiFill")}</li>
                    <li>{t("lobby.exploreTime")}</li>
                  </ul>
                )}
              </div>
              <div className={styles.media}>
                {section.images.map(capture => (
                  <figure key={capture.id} className={styles.capture}>
                    <Image
                      src={`${assetPath}/${capture.id}.webp`}
                      alt={t(`images.${capture.id}`)}
                      width={capture.width}
                      height={capture.height}
                      unoptimized
                    />
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className={styles.footer}>
          <Button asChild variant="outline" className={styles.secondary}>
            <NextLink href={`/${locale}/guide/league`} prefetch={false}>
              {t("league")} <ArrowRight size={16} aria-hidden="true" />
            </NextLink>
          </Button>
        </footer>
      </main>
    </div>
  );
}

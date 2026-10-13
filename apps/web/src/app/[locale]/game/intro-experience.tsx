"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

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

export function IntroPartnerSelector() {
  const t = useTranslations("Game");
  const [selected, setSelected] = useState<(typeof partners)[number]>(partners[0]);

  return (
    <div className={styles.artwork} data-partner={selected.id}>
      <div className={styles.partnerStage}>
        <div className={styles.orbit} aria-hidden="true" />
        <div key={selected.id} className={styles.partnerReveal}>
          <span className={styles.partnerType}>{t(selected.type)}</span>
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

export function IntroGamePreview() {
  const t = useTranslations("Game");
  const [activeIndex, setActiveIndex] = useState(0);
  const active = scenes[activeIndex];

  return (
    <div className={styles.previewExperience}>
      <div className={styles.previewSteps}>
        <p className={styles.previewHint}>{t("introPreviewHint")}</p>
        <div role="group" aria-label={t("introSectionTitle")}>
          {scenes.map((scene, index) => (
            <Button
              key={scene.image}
              variant="ghost"
              className={styles.previewStep}
              aria-pressed={index === activeIndex}
              aria-controls="intro-preview-screen"
              onClick={() => setActiveIndex(index)}
            >
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span>{t(scene.title)}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          ))}
        </div>
        <div className={styles.previewDetail}>
          <h3>{t(active.title)}</h3>
          <p>{t(active.description)}</p>
          <div className={styles.previewControls}>
            <Button
              variant="outline"
              size="icon"
              className={styles.previewArrow}
              aria-label={t("introPreviousScene")}
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex(activeIndex - 1)}
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
              onClick={() => setActiveIndex(activeIndex + 1)}
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

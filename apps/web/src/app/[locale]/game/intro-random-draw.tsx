"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { isRecord } from "@poke-lounge/battle/shared/is-record";
import { Button } from "@/components/ui/button";
import { MobilePokemonThumbnail } from "@/components/poke-lounge/mobile/mobile-selection-cards";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import {
  localizePokemonName,
  localizeTypeName,
} from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import styles from "./page.module.css";

const initialIds = [
  1, 4, 7, 10, 16, 37, 52, 58, 60, 63, 66, 74, 92, 133, 147, 152, 155, 158, 172, 175, 179, 187, 246,
  252, 255, 258, 280, 304, 328, 353, 355, 371, 374, 387, 390, 393, 403, 443, 447,
];
const evolvedIds = [6, 9, 94, 130, 149, 196, 197, 248, 282, 334, 350, 373, 376, 445, 448, 468];
const classicIds = [1, 4, 7, 152, 155, 158];
type Pokemon = { name: string; types: string[] };

function readCatalog(data: unknown): Record<number, Pokemon> {
  if (!isRecord(data) || !isRecord(data.species)) throw new Error("Invalid Pokemon catalog");
  const catalog: Record<number, Pokemon> = {};
  for (const id of [...initialIds, ...evolvedIds]) {
    const pokemon = data.species[id];
    if (
      !isRecord(pokemon) ||
      typeof pokemon.name !== "string" ||
      !pokemon.name ||
      !isRecord(pokemon.types) ||
      !Array.isArray(pokemon.types.names) ||
      !pokemon.types.names.length ||
      !pokemon.types.names.every(
        (type): type is string => typeof type === "string" && type.length > 0,
      )
    ) {
      throw new Error(`Missing Pokemon catalog entry: ${id}`);
    }
    catalog[id] = { name: pokemon.name, types: pokemon.types.names };
  }
  return catalog;
}

function drawCandidates() {
  const pool = [...initialIds];
  return Array.from(
    { length: 5 },
    () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
  );
}

export default function IntroRandomDraw() {
  const t = useTranslations("Game");
  const locale = useLocale();
  const [catalog, setCatalog] = useState<Record<number, Pokemon> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [candidates, setCandidates] = useState<number[]>([]);
  const [mystery, setMystery] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [drawVersion, setDrawVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch("/game-data/pokemon-data.json", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Pokemon catalog: ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setCatalog(readCatalog(data));
        setCandidates(drawCandidates());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  const name = (id: number) => localizePokemonName(catalog![id].name, locale);
  const types = (id: number) => catalog![id].types.map(type => localizeTypeName(type, locale));
  const redraw = () => {
    setCandidates(drawCandidates());
    setMystery(null);
    setSelected(null);
    setDrawVersion(version => version + 1);
    setAnnouncement(t("introRedrawAnnouncement"));
  };
  const reveal = () => {
    if (mystery !== null) {
      setMystery(null);
      setAnnouncement(t("introMysteryHidden"));
    } else {
      // Pick only on reveal, so no hidden species is rendered or requested beforehand.
      const id = evolvedIds[Math.floor(Math.random() * evolvedIds.length)];
      setMystery(id);
      setSelected(null);
      setAnnouncement(t("introMysteryRevealed", { name: name(id) }));
    }
  };

  return (
    <>
      <div className={styles.drawPanel}>
        <div className={styles.panelHeading}>
          <span>{t("introDrawPanelTitle")}</span>
          <span className={styles.brandMark} aria-hidden="true" />
        </div>
        <div className={styles.drawBody} aria-busy={!catalog && !error}>
          <div className={styles.rosterHeading}>
            <span>{t("introDrawRoster")}</span>
            <span>{t("introDrawCount")}</span>
          </div>
          {!catalog ? (
            <div className={styles.drawLoading}>
              <p role={error ? "alert" : "status"}>
                {t(error ? "introDrawError" : "introDrawLoading")}
              </p>
              {error && (
                <Button
                  className={styles.redrawButton}
                  onClick={() => setAttempt(value => value + 1)}
                >
                  {t("introRetry")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className={styles.cardGrid} role="group" aria-label={t("introDrawRoster")}>
                {candidates.map((id, index) => (
                  <button
                    key={index}
                    type="button"
                    className={styles.pokemonCard}
                    aria-pressed={selected === id}
                    aria-label={t("introCandidateLabel", {
                      name: name(id),
                      types: types(id).join(" · "),
                      level: 10,
                    })}
                    onClick={() => {
                      setSelected(id);
                      setAnnouncement(t("introCandidateSelected", { name: name(id) }));
                    }}
                  >
                    <span
                      key={`${drawVersion}-${id}`}
                      className={`${styles.cardFace} ${drawVersion > 0 ? styles.cardFlip : ""}`}
                    >
                      <span className={styles.pokemonSprite} role="img" aria-label={name(id)}>
                        <MobilePokemonThumbnail sprite={getBattlePokemonAssets(id).front} />
                      </span>
                      <strong>{name(id)}</strong>
                      <span className={styles.typeBadges}>
                        {types(id).map(type => (
                          <span className={styles.typeBadge} key={type}>
                            {type}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.pokemonCard} ${styles.mysteryCard}`}
                  onClick={reveal}
                  aria-pressed={mystery !== null}
                  aria-label={
                    mystery === null
                      ? t("introMysteryLabel")
                      : t("introMysteryClose", { name: name(mystery) })
                  }
                >
                  <span
                    key={`${drawVersion}-${mystery ?? "hidden"}`}
                    className={`${styles.cardFace} ${styles.cardFlip}`}
                  >
                    {mystery === null ? (
                      <>
                        <span className={styles.mysterySprite} aria-hidden="true">
                          {t("introQuestion")}
                        </span>
                        <strong>{t("introMysteryName")}</strong>
                        <span className={styles.typeBadge}>{t("introQuestion")}</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.levelBadge}>{t("introMysteryBadge")}</span>
                        <span
                          className={styles.pokemonSprite}
                          role="img"
                          aria-label={name(mystery)}
                        >
                          <MobilePokemonThumbnail sprite={getBattlePokemonAssets(mystery).front} />
                        </span>
                        <strong>{name(mystery)}</strong>
                        <span className={styles.typeBadges}>
                          {types(mystery).map(type => (
                            <span className={styles.typeBadge} key={type}>
                              {type}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </div>
              <Button type="button" className={styles.redrawButton} onClick={redraw}>
                <RotateCcw size={16} aria-hidden="true" />
                {t("introRedraw")}
              </Button>
              <p className={styles.mysteryHint}>{t("introMysteryHint")}</p>
            </>
          )}
        </div>
        <p className={styles.drawDisclaimer}>{t("introDrawDisclaimer")}</p>
        <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      </div>
      <div className={styles.classicStrip}>
        <div>
          <strong>{t("introClassicLabel")}</strong>
          <p>{catalog ? classicIds.map(id => name(id)).join(" · ") : t("introClassicNames")}</p>
        </div>
        {catalog && (
          <div className={styles.classicSprites}>
            {classicIds.map(id => (
              <span key={id} role="img" aria-label={name(id)}>
                <MobilePokemonThumbnail sprite={getBattlePokemonAssets(id).front} />
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

"use client";
import { useRef, useState } from "react";
import { getRuntimePokemonSpeciesSummary } from "@poke-lounge/battle/adventure/data/game-data-json";
import { localizePokemonName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale, SeasonView } from "../contract";
import { startLeagueGrowth, type GrowthStart } from "../api/growth";
import { LeagueApiError } from "../api/core";
import { ChevronRight } from "lucide-react";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { LeagueGuide } from "../shell/league-guide";
import { getGuideCopy } from "../shell/guide-copy";
import styles from "../shell/league-frame.module.css";
import type { GrowthCopy } from "./copy";
export function StarterSelect({
  season,
  locale,
  copy,
  onStarted,
  onRunChanged,
}: {
  season: SeasonView;
  locale: LeagueLocale;
  copy: GrowthCopy;
  onStarted(result: GrowthStart): void;
  onRunChanged(): void;
}) {
  const [selected, setSelected] = useState(season.starterSpeciesIds[0]!);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ species: number; key: string } | null>(null);
  const guide = getGuideCopy(locale);
  return (
    <>
      <LeagueGuide locale={locale} lead={guide.starterLead} line={guide.starterLine} />
      <div className={styles.content}>
        <div className={styles.starters} role="group" aria-label={copy.starter}>
          {season.starterSpeciesIds.map(id => {
            const sprite = getBattlePokemonAssets(id).front;
            const columns = sprite.columns ?? 16,
              rows = sprite.rows ?? 16;
            return (
              <PixelButton
                key={id}
                className={styles.starter}
                selected={selected === id}
                aria-pressed={selected === id}
                disabled={pending}
                onClick={() => setSelected(id)}
              >
                <span
                  aria-hidden="true"
                  className={styles.sprite}
                  style={{
                    backgroundImage: `url(${sprite.path})`,
                    backgroundSize: `${columns * 100}% ${rows * 100}%`,
                    backgroundPosition: `${((sprite.frame % columns) / (columns - 1)) * 100}% ${(Math.floor(sprite.frame / columns) / (rows - 1)) * 100}%`,
                  }}
                />
                {localizePokemonName(getRuntimePokemonSpeciesSummary(id)?.name ?? `#${id}`, locale)}
                <small>Lv.{season.starterLevel}</small>
              </PixelButton>
            );
          })}
        </div>
        {error && (
          <p role="alert" className={styles.message}>
            {error}
          </p>
        )}
        <PixelButton
          className={styles.primary}
          disabled={pending || season.phase !== "open"}
          onClick={async () => {
            if (request.current?.species !== selected)
              request.current = { species: selected, key: crypto.randomUUID() };
            setPending(true);
            setError("");
            try {
              onStarted(await startLeagueGrowth(selected, request.current.key));
            } catch (error) {
              if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_EXISTS")
                onRunChanged();
              else setError(copy.error);
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? copy.loading : copy.start}
          <ChevronRight size={18} aria-hidden="true" />
        </PixelButton>
      </div>
    </>
  );
}

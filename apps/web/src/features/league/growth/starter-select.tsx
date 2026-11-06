"use client";
import { useRef, useState } from "react";
import { getRuntimePokemonSpeciesSummary } from "@poke-lounge/battle/adventure/data/game-data-json";
import { localizePokemonName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale, SeasonView } from "../contract";
import { startLeagueGrowth, type GrowthStart } from "../api/growth";
import { LeagueApiError } from "../api/core";
import { Check, ChevronRight } from "lucide-react";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import { Button } from "@/components/ui/button";
import { MobilePokemonThumbnail } from "@/components/poke-lounge/mobile/mobile-selection-cards";
import starterStyles from "@/components/poke-lounge/runtime/game/ui/starter-selection-layout.module.css";
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
            return (
              <Button
                key={id}
                type="button"
                className={`group ${starterStyles.card}`}
                aria-pressed={selected === id}
                disabled={pending}
                onClick={() => setSelected(id)}
              >
                <span
                  className="invisible absolute top-[3px] right-[3px] grid size-[17px] place-items-center rounded-full bg-[#315d4b] text-[#fffdf0] group-aria-pressed:visible"
                  aria-hidden="true"
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span aria-hidden="true">
                  <MobilePokemonThumbnail sprite={sprite} />
                </span>
                <strong className="text-sm leading-[1.35]">
                  {localizePokemonName(
                    getRuntimePokemonSpeciesSummary(id)?.name ?? `#${id}`,
                    locale,
                  )}
                </strong>
                <small className="rounded border border-[#58614e] px-1.5 py-0.5 text-[11px] leading-[1.3]">
                  Lv.{season.starterLevel}
                </small>
              </Button>
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

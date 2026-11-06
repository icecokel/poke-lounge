"use client";
import { useRef, useState } from "react";
import { getRuntimePokemonSpeciesSummary } from "@poke-lounge/battle/adventure/data/game-data-json";
import type { LeagueLocale, SeasonView } from "../contract";
import { startLeagueGrowth, type GrowthStart } from "../api/growth";
import { LeagueApiError } from "../api/core";
import { getGen4TypeName } from "@poke-lounge/battle/adventure/battle/battle-rom-data";
import { localizeTypeName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import { getPokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";
import type { StarterPokemon } from "@/components/poke-lounge/runtime/types";
import { StarterSelectionPanel } from "@/components/poke-lounge/runtime/game/ui/starter-selection-panel";
import starterStyles from "@/components/poke-lounge/runtime/game/ui/starter-selection-layout.module.css";
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
  const starters: StarterPokemon[] = season.starterSpeciesIds.map(speciesId => {
    const species = getRuntimePokemonSpeciesSummary(speciesId);
    const name = species?.name ?? `#${speciesId}`;
    return {
      id: String(speciesId),
      speciesId,
      name,
      displayName: name,
      type: localizeTypeName(getGen4TypeName(species?.typeIds[0] ?? 0), "en-US"),
      assetPath: `/assets/pokemon/front/${speciesId}.png`,
    };
  });
  return (
    <section className={starterStyles.leagueScreen} data-screen="league-starter-selection">
      <StarterSelectionPanel
        copy={getPokeLoungeCopy(locale)}
        starters={starters}
        selected={starters.find(starter => starter.speciesId === selected) ?? null}
        level={season.starterLevel}
        confirming={pending}
        disabled={season.phase !== "open"}
        error={error}
        confirmLabel={copy.start}
        onChoose={starter => setSelected(starter.speciesId)}
        onConfirm={async () => {
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
      />
    </section>
  );
}

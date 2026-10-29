"use client";
import { useRef, useState } from "react";
import { getRuntimePokemonSpeciesSummary } from "@poke-lounge/battle/adventure/data/game-data-json";
import { localizePokemonName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale, SeasonView } from "../contract";
import { startLeagueGrowth, type GrowthStart } from "../api/growth";
import { LeagueApiError } from "../api/core";
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
  return (
    <div className="space-y-4">
      <h2>
        {copy.starter} · Lv{season.starterLevel}
      </h2>
      <div className="flex flex-wrap gap-3">
        {season.starterSpeciesIds.map(id => (
          <button
            key={id}
            className="rounded border px-4 py-3 aria-pressed:bg-slate-600"
            aria-pressed={selected === id}
            disabled={pending}
            onClick={() => setSelected(id)}
          >
            {localizePokemonName(getRuntimePokemonSpeciesSummary(id)?.name ?? `#${id}`, locale)}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        className="rounded border px-4 py-2"
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
      </button>
    </div>
  );
}

import { loadPokeLoungeRuntimeAssets } from "@/components/poke-lounge/runtime/game/assets/poke-lounge-runtime-assets";
import { loadRuntimeGameDataJson } from "@/components/poke-lounge/runtime/game/data/game-data-json";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";
import type { LeagueLocale, LeagueRuntime } from "../contract";

export async function loadLeagueRuntime(locale: LeagueLocale): Promise<LeagueRuntime> {
  const runtimeGameData = await loadRuntimeGameDataJson();
  const runtimeAssets = await loadPokeLoungeRuntimeAssets({ runtimeGameData });
  return { locale, runtimeAssets, engineVersion: LEAGUE_ENGINE_VERSION };
}

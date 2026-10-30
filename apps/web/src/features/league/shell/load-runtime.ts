import { loadPokeLoungeRuntimeAssets } from "@/components/poke-lounge/runtime/game/assets/poke-lounge-runtime-assets";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";
import type { LeagueLocale, LeagueRuntime } from "../contract";
import { loadLeagueGameData } from "./game-data";

export async function loadLeagueRuntime(locale: LeagueLocale): Promise<LeagueRuntime> {
  const runtimeGameData = await loadLeagueGameData();
  const runtimeAssets = await loadPokeLoungeRuntimeAssets({ runtimeGameData });
  return { locale, runtimeAssets, engineVersion: LEAGUE_ENGINE_VERSION };
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  registerLeagueGrowthData,
  type LeagueGrowthData,
} from "@poke-lounge/battle/league/growth/data";

const ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
export async function loadGrowthData(): Promise<void> {
  const root = resolve(process.env.LEAGUE_WEB_ROOT ?? "../web");
  let file = "";
  try {
    async function read<T>(path: string, rom: boolean): Promise<T> {
      file = path;
      const value = JSON.parse(await readFile(resolve(root, path), "utf8"));
      if (value.version !== 1 || (rom && value.source?.romSha1 !== ROM_SHA1))
        throw new Error("Invalid ROM metadata");
      return value as T;
    }
    const pokemon = await read<{
      species: Record<
        string,
        Omit<LeagueGrowthData["species"][number], "abilities"> & {
          abilities: { primary: number; secondary: number | null };
        }
      >;
    }>("public/game-data/pokemon-data.json", true);
    const moves = await read<{ species: LeagueGrowthData["levelUpMoves"] }>(
      "public/game-data/level-up-move-table.json",
      true,
    );
    const wild = await read<{ species: LeagueGrowthData["wildMoveSets"] }>(
      "public/game-data/wild-battle-move-sets.json",
      false,
    );
    const growth = await read<{ tables: Array<{ growth_rate: number; experience: number[] }> }>(
      "src/components/poke-lounge/runtime/game/battle/growthTable.json",
      true,
    );
    const species = Object.fromEntries(
      Object.entries(pokemon.species).map(([id, s]) => [
        id,
        {
          growthRate: s.growthRate,
          encounterable: s.encounterable,
          genderRatio: s.genderRatio,
          abilities: [
            ...new Set(
              [s.abilities.primary, s.abilities.secondary].filter((v): v is number => !!v),
            ),
          ],
          evolutions: s.evolutions,
        },
      ]),
    );
    const growthTable: number[][] = [];
    for (const table of growth.tables) {
      if (
        table.experience.length !== 101 ||
        table.experience.some(n => !Number.isSafeInteger(n) || n < 0)
      )
        throw new Error("Invalid growth table");
      growthTable[table.growth_rate] = table.experience;
    }
    if (Object.keys(species).length < 493 || !moves.species[1] || !species[1])
      throw new Error("Incomplete growth data");
    registerLeagueGrowthData({
      romSha1: ROM_SHA1,
      species,
      levelUpMoves: moves.species,
      wildMoveSets: wild.species,
      growthTable,
    });
    process.stdout.write(
      JSON.stringify({
        event: "league.judge.growth_data_loaded",
        heapUsedBytes: process.memoryUsage().heapUsed,
        rssBytes: process.memoryUsage().rss,
      }) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        event: "league.judge.growth_data_unavailable",
        file,
        reason: error instanceof Error ? error.message : "Unknown error",
      }) + "\n",
    );
  }
}

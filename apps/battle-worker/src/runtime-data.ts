import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { canonicalize } from "@poke-lounge/battle/canonical-json";
import { loadRuntimeGameDataJson } from "@poke-lounge/battle/adventure/data/game-data-json";
import { createWorldMapModel } from "@poke-lounge/battle/adventure/world/world-map-model";
import type { AiAdventureContext } from "@poke-lounge/battle/adventure/ai-world";

let context: Promise<AiAdventureContext> | undefined;
export function getContext(): Promise<AiAdventureContext> {
  context ??= load();
  return context;
}
async function load(): Promise<AiAdventureContext> {
  const webRoot = resolve(process.env.BATTLE_WEB_ROOT ?? "../web");
  const publicRoot = resolve(webRoot, "public");
  const readAsset = async (pathname: string): Promise<unknown> => {
    const file = resolve(publicRoot, `.${pathname}`);
    if (!file.startsWith(`${publicRoot}${sep}`)) throw new Error("Asset outside public root");
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  };
  const sources = [
    ["pokemon-data", "public/game-data/pokemon-data.json"],
    ["item-data", "public/game-data/item-data.json"],
    ["level-up-move-table", "public/game-data/level-up-move-table.json"],
    ["growth-table", "src/components/poke-lounge/runtime/game/battle/growthTable.json"],
  ] as const;
  const documents = await Promise.all(
    sources.map(async ([documentKey, path]) => {
      const payload = JSON.parse(await readFile(resolve(webRoot, path), "utf8")) as Record<
        string,
        unknown
      >;
      const source = payload.source as Record<string, unknown> | undefined;
      if (payload.version !== 1 || source?.romSha1 !== "5834fb3a2d751c48501d47d6a56898d7af6ccf9e")
        throw new Error("Invalid ROM metadata");
      return {
        documentKey,
        schemaVersion: 1,
        romSha1: source.romSha1,
        contentSha256: createHash("sha256").update(canonicalize(payload)).digest("hex"),
        payload,
      };
    }),
  );
  const data = await loadRuntimeGameDataJson(
    async input => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      return new Response(JSON.stringify(await readAsset(path)), { status: 200 });
    },
    async () => ({ documents }),
  );
  return {
    model: createWorldMapModel(await readAsset("/maps/pokemmo-reference/town.json")),
    encounterData: await readAsset("/game-data/wild-encounter-tables.json"),
    pokemonData: data.pokemonData as AiAdventureContext["pokemonData"],
    moveData: data.pokemonData as AiAdventureContext["moveData"],
  };
}

// Shared by generate-gen4-rom-catalog.ts (reads the ROM) and check-gen4-rom-catalog.mjs (ROM-free).
// Every generated field is derived from the checked-in game-data JSON: `rawHex` holds the exact ROM
// record bytes, which the ROM generator asserts before writing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const ROM_CATALOG_OUTPUT = resolve(
  REPO_ROOT,
  "packages/poke-lounge-battle/src/gen4/rom-catalog.generated.ts",
);
export const SPECIES_COUNT = 493;
export const MOVE_COUNT = 467;

export function readGameData() {
  const read = name =>
    JSON.parse(readFileSync(resolve(REPO_ROOT, "apps/web/public/game-data", name), "utf8"));
  return { data: read("pokemon-data.json"), items: read("item-data.json") };
}

export async function buildRomCatalog({ data, items, romSha1 }) {
  const species = {};
  for (let id = 1; id <= SPECIES_COUNT; id++) {
    const d = data.species[id];
    const p = Buffer.from(d.rawHex, "hex");
    const ev = p.readUInt16LE(10);
    species[id] = {
      name: d.name,
      abilities: [p[22], p[23]].filter((v, i, a) => v && a.indexOf(v) === i),
      evYield: {
        hp: ev & 3,
        attack: (ev >> 2) & 3,
        defense: (ev >> 4) & 3,
        speed: (ev >> 6) & 3,
        specialAttack: (ev >> 8) & 3,
        specialDefense: (ev >> 10) & 3,
      },
      heldItems: [p.readUInt16LE(12), p.readUInt16LE(14)],
      genderRatio: p[16],
    };
  }
  const moveNames = {};
  for (let id = 1; id <= MOVE_COUNT; id++) moveNames[id] = data.moves[id].name;
  const itemData = {};
  for (const [id, d] of Object.entries(items.items)) {
    itemData[id] = {
      name: d.name,
      holdEffect: d.holdEffect,
      ...(d.partyUseEffects ? { partyUseEffects: d.partyUseEffects } : {}),
    };
  }
  const content = `// Generated from Korean HGSS IPKK. Run scripts/poke-lounge/generate-gen4-rom-catalog.ts.\nexport const GEN4_ROM_SHA1 = ${JSON.stringify(romSha1)};\nexport const GEN4_ROM_SPECIES: Readonly<Record<number,{name:string;abilities:number[];evYield:import('./types').Gen4StatValues;heldItems:number[];genderRatio:number}>> = ${JSON.stringify(species)};\nexport const GEN4_ROM_MOVE_NAMES: Readonly<Record<number,string>> = ${JSON.stringify(moveNames)};\nexport const GEN4_ROM_ITEMS: Readonly<Record<number,{name:string;holdEffect:number;partyUseEffects?:Record<string,boolean|number>}>> = ${JSON.stringify(itemData)};\n`;
  const formatted = await format(content, {
    ...(await resolveConfig(ROM_CATALOG_OUTPUT)),
    filepath: ROM_CATALOG_OUTPUT,
  });
  return {
    formatted,
    speciesCount: Object.keys(species).length,
    moveCount: Object.keys(moveNames).length,
  };
}

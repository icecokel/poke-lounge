import { ROM_SHA1 } from "./rom-constants";
import { readFileSync, writeFileSync } from "node:fs";
import { AnimationRom, readNarc } from "./nds-animation-data";
import {
  buildRomCatalog,
  MOVE_COUNT,
  readGameData,
  REPO_ROOT,
  ROM_CATALOG_OUTPUT,
  SPECIES_COUNT,
} from "./gen4-rom-catalog-content.mjs";
// Verifies the checked-in game-data JSON against the actual ROM, then writes (or with --check
// compares) the catalog. CI has no ROM: it runs check-gen4-rom-catalog.mjs, which shares the builder.
async function main(): Promise<void> {
  const { data, items } = readGameData();
  const rom = new AnimationRom(readFileSync(`${REPO_ROOT}/data/roms/포켓몬스터 하트골드(K).nds`));
  const personal = readNarc(rom.file("a/0/0/2")),
    moves = readNarc(rom.file("a/0/1/1")),
    itemRecords = readNarc(rom.file("a/0/1/7"));
  if (rom.sha1 !== ROM_SHA1) throw Error("Unexpected Korean HGSS ROM revision");
  for (let id = 1; id <= SPECIES_COUNT; id++) {
    if (personal[id]!.toString("hex") !== data.species[id].rawHex)
      throw Error(`Personal data mismatch ${id}`);
  }
  for (let id = 1; id <= MOVE_COUNT; id++) {
    if (moves[id]!.toString("hex") !== data.moves[id].rawHex) throw Error(`Move mismatch ${id}`);
  }
  for (const [id, value] of Object.entries(items.items)) {
    if (itemRecords[+id]?.toString("hex") !== (value as { rawHex: string }).rawHex)
      throw Error(`Item mismatch ${id}`);
  }
  const { formatted, speciesCount, moveCount } = await buildRomCatalog({
    data,
    items,
    romSha1: rom.sha1,
  });
  if (process.argv.includes("--check")) {
    if (readFileSync(ROM_CATALOG_OUTPUT, "utf8") !== formatted)
      throw Error("Stale ROM gameplay catalog");
  } else writeFileSync(ROM_CATALOG_OUTPUT, formatted);
  console.log(
    `Verified actual ROM: ${moves.length} move records, ${personal.length} species records, ${itemRecords.length} item records; generated ${speciesCount} playable species and ${moveCount} moves.`,
  );
}
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { readFileSync, writeFileSync } from "node:fs";
import { AnimationRom, readNarc } from "./nds-animation-data";
import { format, resolveConfig } from "prettier";
async function main(): Promise<void> {
  const root = process.cwd();
  const data = JSON.parse(
    readFileSync(`${root}/apps/web/public/game-data/pokemon-data.json`, "utf8"),
  );
  const items = JSON.parse(
    readFileSync(`${root}/apps/web/public/game-data/item-data.json`, "utf8"),
  );
  const rom = new AnimationRom(readFileSync(`${root}/data/roms/포켓몬스터 하트골드(K).nds`));
  const personal = readNarc(rom.file("a/0/0/2")),
    moves = readNarc(rom.file("a/0/1/1")),
    itemRecords = readNarc(rom.file("a/0/1/7"));
  if (rom.sha1 !== "5834fb3a2d751c48501d47d6a56898d7af6ccf9e")
    throw Error("Unexpected Korean HGSS ROM revision");
  const species: Record<string, unknown> = {};
  for (let id = 1; id <= 493; id++) {
    const d = data.species[id],
      p = personal[id]!;
    if (p.toString("hex") !== d.rawHex) throw Error(`Personal data mismatch ${id}`);
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
  const moveNames: Record<string, string> = {};
  for (let id = 1; id <= 467; id++) {
    if (moves[id]!.toString("hex") !== data.moves[id].rawHex) throw Error(`Move mismatch ${id}`);
    moveNames[id] = data.moves[id].name;
  }
  const itemData: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(items.items)) {
    const d = value as {
      rawHex: string;
      name: string;
      holdEffect: number;
      partyUseEffects?: unknown;
    };
    if (itemRecords[+id]?.toString("hex") !== d.rawHex) throw Error(`Item mismatch ${id}`);
    itemData[id] = {
      name: d.name,
      holdEffect: d.holdEffect,
      ...(d.partyUseEffects ? { partyUseEffects: d.partyUseEffects } : {}),
    };
  }
  const content = `// Generated from Korean HGSS IPKK. Run scripts/poke-lounge/generate-gen4-rom-catalog.ts.\nexport const GEN4_ROM_SHA1 = ${JSON.stringify(rom.sha1)};\nexport const GEN4_ROM_SPECIES: Readonly<Record<number,{name:string;abilities:number[];evYield:import('./types').Gen4StatValues;heldItems:number[];genderRatio:number}>> = ${JSON.stringify(species)};\nexport const GEN4_ROM_MOVE_NAMES: Readonly<Record<number,string>> = ${JSON.stringify(moveNames)};\nexport const GEN4_ROM_ITEMS: Readonly<Record<number,{name:string;holdEffect:number;partyUseEffects?:Record<string,boolean|number>}>> = ${JSON.stringify(itemData)};\n`;
  const output = `${root}/packages/poke-lounge-battle/src/gen4/rom-catalog.generated.ts`;
  const formatted = await format(content, { ...(await resolveConfig(output)), filepath: output });
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== formatted) throw Error("Stale ROM gameplay catalog");
  } else writeFileSync(output, formatted);
  console.log(
    `Verified actual ROM: ${moves.length} move records, ${personal.length} species records, ${itemRecords.length} item records; generated ${Object.keys(species).length} playable species and ${Object.keys(moveNames).length} moves.`,
  );
}
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

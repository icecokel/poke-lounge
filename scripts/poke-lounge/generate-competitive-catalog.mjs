import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { format, resolveConfig } from "prettier";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(root, "apps/web/public/game-data/pokemon-data.json");
const outputDirectory = path.join(root, "packages/poke-lounge-battle/src");
const catalogPath = path.join(outputDirectory, "competitive-catalog.generated.ts");
const metadataPath = path.join(outputDirectory, "competitive-catalog-metadata.generated.ts");
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("Expected --write or --check");
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const species = Object.fromEntries(
  Object.values(source.species)
    .filter(
      entry =>
        Number.isSafeInteger(entry.speciesId) && entry.speciesId >= 1 && entry.speciesId <= 493,
    )
    .sort((left, right) => left.speciesId - right.speciesId)
    .map(entry => [
      entry.speciesId,
      {
        speciesId: entry.speciesId,
        baseStats: {
          hp: entry.baseStats.hp,
          attack: entry.baseStats.attack,
          defense: entry.baseStats.defense,
          specialAttack: entry.baseStats.specialAttack,
          specialDefense: entry.baseStats.specialDefense,
          speed: entry.baseStats.speed,
        },
        typeIds: entry.types.ids,
      },
    ]),
);
const moves = Object.fromEntries(
  Object.values(source.moves)
    .filter(entry => Number.isSafeInteger(entry.id) && entry.id >= 1 && entry.id <= 470)
    .sort((left, right) => left.id - right.id)
    .map(entry => [
      entry.id,
      {
        moveId: entry.id,
        typeId: entry.typeId,
        category: entry.category,
        power: entry.power,
        accuracy: entry.accuracy,
        effectCode: entry.effectCode,
        effectChance: entry.effectChance,
        priority: entry.priority,
        maxPp: entry.pp,
      },
    ]),
);
const canonicalCatalog = JSON.stringify({ moves, species });
const catalogHash = createHash("sha256").update(canonicalCatalog, "utf8").digest("hex");

const catalogSource = `// 이 파일은 scripts/poke-lounge/generate-competitive-catalog.mjs로 생성한다.\n\nexport interface CompetitiveSpeciesDefinition {\n  speciesId: number;\n  baseStats: {\n    hp: number;\n    attack: number;\n    defense: number;\n    specialAttack: number;\n    specialDefense: number;\n    speed: number;\n  };\n  typeIds: readonly [number] | readonly [number, number];\n}\n\nexport interface CompetitiveMoveDefinition {\n  moveId: number;\n  typeId: number;\n  category: \"physical\" | \"special\" | \"status\";\n  power: number;\n  accuracy: number;\n  effectCode: number;\n  effectChance: number;\n  priority: number;\n  maxPp: number;\n}\n\nexport const COMPETITIVE_SPECIES_CATALOG: Readonly<Record<number, CompetitiveSpeciesDefinition>> = ${JSON.stringify(species, null, 2)};\n\nexport const COMPETITIVE_MOVE_CATALOG: Readonly<Record<number, CompetitiveMoveDefinition>> = ${JSON.stringify(moves, null, 2)};\n\nexport const COMPETITIVE_CATALOG_HASH = \"${catalogHash}\";\n`;
const metadataSource = `// 이 파일은 scripts/poke-lounge/generate-competitive-catalog.mjs로 생성한다.\n\nexport const COMPETITIVE_CATALOG_HASH = \"${catalogHash}\";\nexport const COMPETITIVE_CATALOG_SPECIES_COUNT = ${Object.keys(species).length};\nexport const COMPETITIVE_CATALOG_MOVE_COUNT = ${Object.keys(moves).length};\n`;
const prettierConfig = (await resolveConfig(catalogPath)) ?? {};
const [catalogOutput, metadataOutput] = await Promise.all([
  format(catalogSource, { ...prettierConfig, filepath: catalogPath }),
  format(metadataSource, { ...prettierConfig, filepath: metadataPath }),
]);

const outputs = [
  [catalogPath, catalogOutput],
  [metadataPath, metadataOutput],
];

if (mode === "--write") {
  await Promise.all(outputs.map(([filePath, content]) => writeFile(filePath, content)));
} else {
  const current = await Promise.all(
    outputs.map(([filePath]) => readFile(filePath, "utf8").catch(() => "")),
  );
  const drifted = outputs
    .filter(([, content], index) => current[index] !== content)
    .map(([filePath]) => path.relative(root, filePath));
  if (drifted.length > 0) {
    throw new Error(`Competitive catalog is stale: ${drifted.join(", ")}`);
  }
}

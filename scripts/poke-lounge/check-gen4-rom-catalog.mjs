// ROM-free drift check for packages/poke-lounge-battle/src/gen4/rom-catalog.generated.ts.
// The ROM is not in the repository or CI, so this regenerates the catalog from the checked-in
// game-data JSON (whose rawHex bytes the ROM generator verifies) and compares it with the file.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  buildRomCatalog,
  readGameData,
  REPO_ROOT,
  ROM_CATALOG_OUTPUT,
} from "./gen4-rom-catalog-content.mjs";

try {
  // rom-constants.ts is TypeScript; read the literal so this check runs on plain node.
  const romSha1 = readFileSync(resolve(import.meta.dirname, "rom-constants.ts"), "utf8").match(
    /^export const ROM_SHA1 = "([0-9a-f]{40})";$/m,
  )?.[1];
  if (!romSha1) throw new Error("ROM_SHA1 not found in scripts/poke-lounge/rom-constants.ts");
  const { formatted, speciesCount, moveCount } = await buildRomCatalog({
    ...readGameData(),
    romSha1,
  });
  if (readFileSync(ROM_CATALOG_OUTPUT, "utf8") !== formatted) {
    throw new Error(
      relative(REPO_ROOT, ROM_CATALOG_OUTPUT) +
        " is stale against apps/web/public/game-data/{pokemon-data,item-data}.json. " +
        "Regenerate it with scripts/poke-lounge/generate-gen4-rom-catalog.ts (needs the ROM); do not edit it by hand.",
    );
  }
  console.log(`gen4 rom catalog ok (${speciesCount} species, ${moveCount} moves, ROM-free)`);
} catch (error) {
  console.error("Gen4 ROM catalog check failed:", error.message);
  process.exitCode = 1;
}

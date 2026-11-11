import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(
  import.meta.dirname,
  "../../apps/web/src/features/poke-lounge/presentation/battle",
);
const read = filename => JSON.parse(readFileSync(resolve(directory, filename), "utf8"));

try {
  const catalog = read("gen4-move-effects.json");
  const descriptions = [...new Set(Object.values(catalog))].sort();
  for (const language of ["ko", "ja"]) {
    const filename = `gen4-move-effects.${language}.json`;
    const translations = read(filename);
    assert.deepEqual(Object.keys(translations).sort(), descriptions, `${filename}: key mismatch`);
    for (const [original, translation] of Object.entries(translations)) {
      assert.equal(typeof translation, "string", `${filename}: invalid value for ${original}`);
      assert.ok(translation.trim(), `${filename}: empty translation for ${original}`);
      assert.notEqual(translation, original, `${filename}: untranslated description: ${original}`);
    }
  }
  console.log(
    `Move effects OK (${Object.keys(catalog).length} moves, ${descriptions.length} descriptions, ko/ja)`,
  );
} catch (error) {
  console.error("Move effects check failed:", error.message);
  process.exitCode = 1;
}

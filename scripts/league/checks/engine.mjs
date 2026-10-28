import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const battle = resolve(root, "packages/poke-lounge-battle");
const source = resolve(battle, "src");
const read = path => readFileSync(path, "utf8");
const fail = message => {
  throw new Error(message);
};
const revision = Number(
  /LEAGUE_ENGINE_REVISION\s*=\s*(\d+)\s*;/.exec(
    read(resolve(source, "league/engine-version.ts")),
  )?.[1],
);
if (!Number.isSafeInteger(revision) || revision < 1) fail("Invalid LEAGUE_ENGINE_REVISION");
const simVersion = JSON.parse(read(resolve(battle, "package.json"))).dependencies["@pkmn/sim"];
const installedVersion = JSON.parse(
  read(resolve(battle, "node_modules/@pkmn/sim/package.json")),
).version;
if (simVersion !== "0.10.11" || installedVersion !== simVersion)
  fail("Review the simulator version and engine-version.ts together");

const files = [
  "gen4/engine.ts",
  "gen4/flow.ts",
  "gen4/serialization.ts",
  "gen4/request.ts",
  "gen4/traits.ts",
  "ai-policy.ts",
  "ai-difficulty.ts",
  "competitive-ruleset-config.ts",
  "canonical-json.ts",
  "gen4-battle-math.ts",
  "gen4-type-chart.ts",
  "battle-stat-stages.ts",
  "gen4-pokemon-stats.ts",
  "competitive-catalog.generated.ts",
  "gen4/rom-catalog.generated.ts",
];
function leagueFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "roster") return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? leagueFiles(path)
      : entry.name.endsWith(".ts")
        ? [relative(source, path)]
        : [];
  });
}
files.push(...leagueFiles(resolve(source, "league")));
const fingerprint = {
  revision,
  simVersion,
  files: Object.fromEntries(
    files.sort().map(file => [
      `src/${file}`,
      createHash("sha256")
        .update(readFileSync(resolve(source, file)))
        .digest("hex"),
    ]),
  ),
};
const fingerprintPath = resolve(source, "league/engine-fingerprint.json");
const previous = existsSync(fingerprintPath) ? JSON.parse(read(fingerprintPath)) : null;
if (process.argv.includes("--write")) {
  if (previous && revision <= previous.revision)
    fail("Raise LEAGUE_ENGINE_REVISION above the recorded revision before --write");
  writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2) + "\n");
} else if (JSON.stringify(previous) !== JSON.stringify(fingerprint)) {
  fail(
    "League engine fingerprint changed. Raise LEAGUE_ENGINE_REVISION, then run node scripts/league/checks/engine.mjs --write, or revert the source changes. Deploy engine changes after season settlement (LEAGUE.md).",
  );
}

const visited = new Set();
function visit(path) {
  if (visited.has(path)) return;
  visited.add(path);
  const code = read(path);
  const dependencies = [];
  for (const match of code.matchAll(
    /\b(?:import|export)\s+(?!type\b)([\s\S]*?)\s+from\s*["']([^"']+)["']/g,
  )) {
    const bindings = match[1].trim();
    if (
      bindings.startsWith("{") &&
      bindings
        .slice(1, -1)
        .split(",")
        .filter(value => value.trim())
        .every(value => value.trim().startsWith("type "))
    )
      continue;
    dependencies.push(match[2]);
  }
  for (const match of code.matchAll(
    /\b(?:import\s*\(\s*|require\s*\(\s*|import\s*)["']([^"']+)["']/g,
  ))
    dependencies.push(match[1]);
  for (const dependency of dependencies) {
    if (dependency.startsWith("node:"))
      fail(`Node value import in browser graph: ${relative(root, path)} -> ${dependency}`);
    if (!dependency.startsWith(".")) continue;
    const base = resolve(dirname(path), dependency);
    const target = [base + ".ts", resolve(base, "index.ts"), base + ".json", base].find(
      candidate => existsSync(candidate) && !candidate.endsWith(".d.ts"),
    );
    if (!target) fail(`Unresolved browser import: ${path} -> ${dependency}`);
    if (target.endsWith(".ts")) visit(target);
  }
}
for (const file of ["match", "carry", "score", "party", "hash"])
  visit(resolve(source, `league/${file}.ts`));
const contract = read(resolve(source, "league/contract.ts"));
for (const [name, value] of [
  ["LEVEL_CAP", 50],
  ["PARTY_SIZE", 6],
  ["MATCH_COUNT", 5],
]) {
  if (!new RegExp(`export const LEAGUE_${name} = ${value};`).test(contract))
    fail(`League contract constant changed: ${name}`);
}
console.log(
  `League engine static checks passed (revision ${revision}, ${files.length} fingerprints, ${visited.size} browser sources).`,
);

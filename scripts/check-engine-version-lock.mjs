// Engine version lock. Run pnpm build:poke-lounge-battle first; this reads the built package.
//
// The engine version (gen4:<ruleset version>:<COMPETITIVE_RULESET_HASH>) is a hand-typed label:
// nothing recomputes it from the rules it names. The API <-> worker gate and the client's
// rulesetHash check only compare that label, so a behaviour change that keeps the label would pass
// both gates with different rules. This check records a fingerprint of the label's inputs and fails
// when the inputs change while the label stays the same.
//
//   node scripts/check-engine-version-lock.mjs          compare with the recorded lock
//   node scripts/check-engine-version-lock.mjs --write  re-record the lock
//
// Modelled on the league lock (scripts/league/checks/engine.mjs + league/engine-fingerprint.json,
// which guards LEAGUE_ENGINE_REVISION). That lock overlaps most of these files but is keyed to the
// league revision, omits gen4/canonical.ts, gen4/capture.ts and canonical-state.ts, and hashes raw
// bytes; this one guards the competitive engine version. It never touches the league lock.
//
// Fingerprinted inputs:
//   - competitive catalog hash and the canonical JSON of COMPETITIVE_RULESET_V2
//   - the @pkmn/sim version and integrity resolved in pnpm-lock.yaml
//   - packages/poke-lounge-battle/src/gen4/*.ts and every module they import at runtime, hashed
//     after TypeScript transpilation without comments. Formatting-only, comment-only and
//     type-only edits therefore do not change the fingerprint; renames and reordering do.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const battle = resolve(root, "packages/poke-lounge-battle");
const source = resolve(battle, "src");
const lockPath = resolve(root, "scripts/poke-lounge/engine-version.lock.json");
const battleRequire = createRequire(resolve(battle, "package.json"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(path, "utf8");

try {
  const ts = battleRequire("typescript");
  const ruleset = battleRequire("./dist/competitive-ruleset-config.js");
  const catalog = battleRequire("./dist/competitive-catalog.generated.js");
  const { canonicalize } = battleRequire("./dist/canonical-json.js");

  const engineVersion = read(resolve(root, "apps/api-rust/engine-version.txt")).trim();
  const tsEngineVersion =
    "gen4:" + ruleset.COMPETITIVE_RULESET_VERSION + ":" + ruleset.COMPETITIVE_RULESET_HASH;
  if (engineVersion !== tsEngineVersion) {
    throw new Error(
      "apps/api-rust/engine-version.txt (" +
        engineVersion +
        ") differs from the TS constants (" +
        tsEngineVersion +
        ")",
    );
  }

  // Same shape as packages/poke-lounge-battle/src/league/engine-fingerprint.json
  // ({ revision, simVersion, files }), keyed by the competitive engine version instead.
  const sim = readResolvedSim();
  const current = {
    engineVersion,
    simVersion: sim.version,
    simIntegrity: sim.integrity,
    competitiveCatalogHash: catalog.COMPETITIVE_CATALOG_HASH,
    rulesetConfigHash: sha256(canonicalize(ruleset.COMPETITIVE_RULESET_V2)),
    normalizer: "typescript@" + ts.version + " transpile, comments removed",
    files: fingerprintSources(ts),
  };

  if (process.argv.includes("--write")) {
    writeFileSync(lockPath, JSON.stringify(current, null, 2) + "\n");
    console.log(
      "engine version lock recorded for " +
        engineVersion +
        " (" +
        Object.keys(current.files).length +
        " sources)",
    );
  } else {
    if (!existsSync(lockPath)) throw new Error("Missing " + relative(root, lockPath));
    const recorded = JSON.parse(read(lockPath));
    const changes = diffInputs(recorded, current);
    if (recorded.engineVersion !== engineVersion) {
      throw new Error(
        "the engine version changed (" +
          recorded.engineVersion +
          " -> " +
          engineVersion +
          ") but the lock still records the old one. Record the new inputs with:\n" +
          "  pnpm build:poke-lounge-battle && node scripts/check-engine-version-lock.mjs --write",
      );
    }
    if (changes.length > 0) {
      throw new Error(
        "engine inputs changed while the engine version is still " +
          engineVersion +
          ":\n" +
          changes.map(change => "  - " + change).join("\n") +
          (recorded.normalizer !== current.normalizer
            ? "\n  (the normalizer also changed: " +
              recorded.normalizer +
              " -> " +
              current.normalizer +
              "; a TypeScript upgrade alone can change every source hash)"
            : "") +
          "\nIf battle results can differ, bump the engine version in both places " +
          "(COMPETITIVE_RULESET_HASH / COMPETITIVE_RULESET_VERSION in " +
          "packages/poke-lounge-battle/src/competitive-ruleset-config.ts and " +
          "apps/api-rust/engine-version.txt), then re-record. " +
          "If the change is behaviour-neutral, only re-record:\n" +
          "  pnpm build:poke-lounge-battle && node scripts/check-engine-version-lock.mjs --write",
      );
    }
    console.log(
      "engine version lock ok (" +
        engineVersion +
        ", " +
        Object.keys(current.files).length +
        " sources)",
    );
  }
} catch (error) {
  console.error("Engine version lock check failed:", error.message);
  process.exitCode = 1;
}

// The version pnpm actually installs for the battle package, not the range in package.json.
function readResolvedSim() {
  const lines = read(resolve(root, "pnpm-lock.yaml")).split("\n");
  const unquote = text => text.replace(/^["']|["']$/g, "");
  const importer = lines.findIndex(line => /^ {2}packages\/poke-lounge-battle:\s*$/.test(line));
  if (importer < 0) throw new Error("pnpm-lock.yaml has no packages/poke-lounge-battle importer");
  let version;
  for (let index = importer + 1; index < lines.length; index++) {
    if (/^ {0,2}\S/.test(lines[index])) break;
    if (unquote(lines[index].trim().replace(/:$/, "")) !== "@pkmn/sim") continue;
    for (let next = index + 1; next < lines.length; next++) {
      const match = /^\s+version:\s*(\S+)\s*$/.exec(lines[next]);
      if (match) {
        version = unquote(match[1]);
        break;
      }
      if (!/^\s+specifier:/.test(lines[next])) break;
    }
    break;
  }
  if (!version) throw new Error("pnpm-lock.yaml does not resolve @pkmn/sim for the battle package");
  const packageKey = "@pkmn/sim@" + version.replace(/\(.*$/, "");
  const entry = lines.findIndex(
    line => /^ {2}\S/.test(line) && unquote(line.trim().replace(/:$/, "")) === packageKey,
  );
  let integrity;
  for (let index = entry + 1; entry >= 0 && index < lines.length; index++) {
    if (/^ {0,2}\S/.test(lines[index])) break;
    const match = /integrity:\s*["']?(sha\d+-[A-Za-z0-9+/=]+)/.exec(lines[index]);
    if (match) {
      integrity = match[1];
      break;
    }
  }
  if (!integrity) throw new Error("pnpm-lock.yaml has no integrity for " + packageKey);
  return { version, integrity };
}

function fingerprintSources(ts) {
  const gen4 = resolve(source, "gen4");
  const pending = readdirSync(gen4)
    .filter(name => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .sort()
    .map(name => resolve(gen4, name));
  const hashes = {};
  while (pending.length > 0) {
    const path = pending.pop();
    const key = "src/" + relative(source, path).replaceAll("\\", "/");
    if (key in hashes) continue;
    if (path.endsWith(".json")) {
      hashes[key] = sha256(JSON.stringify(JSON.parse(read(path))));
      continue;
    }
    // Per-file transpilation drops comments, formatting, types and type-only imports.
    const output = ts.transpileModule(read(path), {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
        removeComments: true,
        newLine: ts.NewLineKind.LineFeed,
      },
    });
    if (output.diagnostics?.length) throw new Error("Cannot transpile " + key);
    hashes[key] = sha256(output.outputText);
    for (const match of output.outputText.matchAll(/\brequire\("(\.[^"]*)"\)/g)) {
      const base = resolve(dirname(path), match[1]);
      const target = [base + ".ts", resolve(base, "index.ts"), base].find(
        candidate => existsSync(candidate) && /\.(ts|json)$/.test(candidate),
      );
      if (!target) throw new Error("Unresolved engine import: " + key + " -> " + match[1]);
      pending.push(target);
    }
  }
  return Object.fromEntries(
    Object.entries(hashes).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

function diffInputs(recorded, current) {
  const changes = [];
  for (const name of ["competitiveCatalogHash", "rulesetConfigHash"]) {
    if (recorded[name] !== current[name]) changes.push(name);
  }
  if (
    recorded.simVersion !== current.simVersion ||
    recorded.simIntegrity !== current.simIntegrity
  ) {
    changes.push("@pkmn/sim " + (recorded.simVersion ?? "?") + " -> " + current.simVersion);
  }
  const before = recorded.files ?? {};
  for (const file of new Set([...Object.keys(before), ...Object.keys(current.files)])) {
    if (before[file] === current.files[file]) continue;
    const state = !(file in before) ? "added" : !(file in current.files) ? "removed" : "changed";
    changes.push("packages/poke-lounge-battle/" + file + " (" + state + ")");
  }
  return changes;
}

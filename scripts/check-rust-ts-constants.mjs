// Run pnpm build:poke-lounge-battle first; this check reads the built package, as CI does.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));

try {
  const timing = apiRequire("@poke-lounge/battle/timing");
  const ruleset = apiRequire("@poke-lounge/battle/competitive-ruleset-config");
  const { STARTER_SPECIES_IDS } = apiRequire("@poke-lounge/battle/party-acceptance");
  const tsValues = { ...timing, COMPETITIVE_RULESET_VERSION: ruleset.COMPETITIVE_RULESET_VERSION };
  const rust = readFileSync(resolve(root, "apps/api-rust/src/domain.rs"), "utf8");
  const pairs = [
    ["ROUND_DURATION_OPTIONS_MS", "ROUND_DURATION_OPTIONS_MS"],
    ["DEFAULT_ROUND_DURATION_MS", "DEFAULT_ROUND_DURATION_MS"],
    ["ROUND_START_COUNTDOWN_MS", "ROUND_START_COUNTDOWN_MS"],
    ["TURN_MS", "COMPETITIVE_TURN_DEADLINE_MS"],
    ["TOURNAMENT_BRIEFING_MS", "TOURNAMENT_BRIEFING_DURATION_MS"],
    ["TOURNAMENT_RESULT_MS", "TOURNAMENT_RESULT_DURATION_MS"],
    ["TOURNAMENT_PROGRESSION_MS", "TOURNAMENT_PROGRESSION_DEADLINE_MS"],
    ["SESSION_MAX_MS", "POKE_LOUNGE_SESSION_MAX_LIFETIME_MS"],
    ["ADMISSION_MS", "POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS"],
    ["PRESENCE_LEASE_MS", "PARTICIPANT_DISCONNECT_GRACE_MS"],
    ["CLOSED_RETENTION_MS", "POKE_LOUNGE_FINISHED_ROOM_RETENTION_MS"],
    ["COMPETITIVE_RULESET_VERSION", "COMPETITIVE_RULESET_VERSION"],
  ];

  for (const [rustName, tsName] of pairs) {
    const rustValue = readRustConstant(rust, rustName);
    const tsValue = tsValues[tsName];
    if (tsValue === undefined) throw new Error("Missing TS export " + tsName);
    compare(rustName + " / " + tsName, rustValue, tsValue);
  }

  const engineVersion = readFileSync(
    resolve(root, "apps/api-rust/engine-version.txt"),
    "utf8",
  ).trim();
  compare(
    "engine version",
    engineVersion,
    "gen4:" + ruleset.COMPETITIVE_RULESET_VERSION + ":" + ruleset.COMPETITIVE_RULESET_HASH,
  );
  const bootstrap = JSON.parse(
    readFileSync(resolve(root, "apps/web/public/game-data/bootstrap.json"), "utf8"),
  );
  const starterSpeciesIds = [...new Set(bootstrap.starters.map(starter => starter.speciesId))].sort(
    (left, right) => left - right,
  );
  const expectedStarterIds = [...new Set(STARTER_SPECIES_IDS)].sort((left, right) => left - right);
  if (JSON.stringify(starterSpeciesIds) !== JSON.stringify(expectedStarterIds)) {
    console.error(
      "Starter species differ: bootstrap=" +
        JSON.stringify(starterSpeciesIds) +
        ", TS=" +
        JSON.stringify(expectedStarterIds),
    );
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log("rust/ts constants ok");
} catch (error) {
  console.error("Rust/TS constants check failed:", error.message);
  process.exitCode = 1;
}

function readRustConstant(source, name) {
  const pattern = new RegExp(
    "^pub const " + name + ":\\s*(u64|usize|\\[u64;\\s*(\\d+)\\])\\s*=\\s*([^;]+);",
    "gm",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected exactly one Rust constant " + name);
  const [, type, length, expression] = matches[0];
  const value = expression.replaceAll("_", "").trim();
  if (type.startsWith("[")) {
    if (!value.startsWith("[") || !value.endsWith("]")) {
      throw new Error("Expected Rust array literal for " + name);
    }
    const items = value.slice(1, -1).trim().replace(/,$/, "").split(",").map(parseInteger);
    if (items.length !== Number(length)) throw new Error("Invalid array length for " + name);
    return items;
  }
  return parseInteger(value);
}

function parseInteger(text) {
  const value = Number(text.trim());
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(value)) {
    throw new Error("Expected a non-negative safe integer literal, received " + text);
  }
  return value;
}

function compare(name, rustValue, tsValue) {
  if (JSON.stringify(rustValue) !== JSON.stringify(tsValue)) {
    console.error(
      name + " differs: Rust=" + JSON.stringify(rustValue) + ", TS=" + JSON.stringify(tsValue),
    );
    process.exitCode = 1;
  }
}

// Run pnpm build:poke-lounge-battle first; this check reads the built package, as CI does.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// Any workspace package that depends on @poke-lounge/battle resolves the built dist.
const apiRequire = createRequire(resolve(root, "apps/battle-worker/package.json"));

try {
  const timing = apiRequire("@poke-lounge/battle/timing");
  const ruleset = apiRequire("@poke-lounge/battle/competitive-ruleset-config");
  const bracket = apiRequire("@poke-lounge/battle/tournament-bracket");
  const scoring = apiRequire("@poke-lounge/battle/tournament-scoring");
  const roundStart = apiRequire("@poke-lounge/battle/round-start");
  const { COMPETITIVE_TERMINAL_REASONS } = apiRequire("@poke-lounge/battle/competitive-contract");
  const { FIELD_MAP } = apiRequire("@poke-lounge/battle/adventure/world/field-map");
  const { STARTER_SPECIES_IDS } = apiRequire("@poke-lounge/battle/party-acceptance");
  const tsValues = {
    ...timing,
    ...bracket,
    ...roundStart,
    COMPETITIVE_TERMINAL_REASONS,
    FIELD_MAP_KEY: FIELD_MAP.key,
    DEFAULT_SPAWN_X: FIELD_MAP.fallbackSpawn.x,
    DEFAULT_SPAWN_Y: FIELD_MAP.fallbackSpawn.y,
    COMPETITIVE_RULESET_VERSION: ruleset.COMPETITIVE_RULESET_VERSION,
    // Rust keeps the score table as an array indexed by rank - 1.
    DEFAULT_TOURNAMENT_SCORE_BY_RANK: [1, 2, 3, 4, 5, 6].map(
      rank => scoring.DEFAULT_TOURNAMENT_SCORE_BY_RANK[rank],
    ),
  };
  const domain = readFileSync(resolve(root, "apps/api-rust/src/domain.rs"), "utf8");
  const tournament = readFileSync(resolve(root, "apps/api-rust/src/tournament.rs"), "utf8");
  // [Rust source, Rust constant name, TS export name]
  const pairs = [
    [domain, "ROUND_DURATION_OPTIONS_MS", "ROUND_DURATION_OPTIONS_MS"],
    [domain, "DEFAULT_ROUND_DURATION_MS", "DEFAULT_ROUND_DURATION_MS"],
    [domain, "ROUND_START_COUNTDOWN_MS", "ROUND_START_COUNTDOWN_MS"],
    [domain, "TURN_MS", "COMPETITIVE_TURN_DEADLINE_MS"],
    [domain, "TOURNAMENT_BRIEFING_MS", "TOURNAMENT_BRIEFING_DURATION_MS"],
    [domain, "TOURNAMENT_RESULT_MS", "TOURNAMENT_RESULT_DURATION_MS"],
    [domain, "TOURNAMENT_PROGRESSION_MS", "TOURNAMENT_PROGRESSION_DEADLINE_MS"],
    [domain, "SESSION_MAX_MS", "POKE_LOUNGE_SESSION_MAX_LIFETIME_MS"],
    [domain, "ADMISSION_MS", "POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS"],
    [domain, "PRESENCE_LEASE_MS", "PARTICIPANT_DISCONNECT_GRACE_MS"],
    [domain, "CLOSED_RETENTION_MS", "POKE_LOUNGE_FINISHED_ROOM_RETENTION_MS"],
    [domain, "COMPETITIVE_RULESET_VERSION", "COMPETITIVE_RULESET_VERSION"],
    [domain, "MAX_PARTICIPANTS", "TOURNAMENT_MAX_PARTICIPANT_COUNT"],
    [domain, "ROUND_COUNT", "GAME_ROUND_COUNT"],
    [domain, "TERMINAL_PAGE_SIZE", "TERMINAL_PROJECTION_PAGE_SIZE"],
    [domain, "FIELD_MAP_KEY", "FIELD_MAP_KEY"],
    [domain, "DEFAULT_SPAWN_X", "DEFAULT_SPAWN_X"],
    [domain, "DEFAULT_SPAWN_Y", "DEFAULT_SPAWN_Y"],
    [domain, "ROUND_SPAWN_BASE_X", "ROUND_SPAWN_BASE_X"],
    [domain, "ROUND_SPAWN_BASE_Y", "ROUND_SPAWN_BASE_Y"],
    [domain, "ROUND_SPAWN_START_Y_OFFSET", "ROUND_SPAWN_START_Y_OFFSET"],
    [domain, "ROUND_SPAWN_STEP", "ROUND_SPAWN_STEP"],
    [domain, "ROUND_SPAWN_COLUMNS", "ROUND_SPAWN_COLUMNS"],
    [domain, "TERMINAL_REASONS", "COMPETITIVE_TERMINAL_REASONS"],
    [tournament, "SEED_ORDER_2", "TOURNAMENT_SEED_ORDER_2"],
    [tournament, "SEED_ORDER_4", "TOURNAMENT_SEED_ORDER_4"],
    [tournament, "SEED_ORDER_8", "TOURNAMENT_SEED_ORDER_8"],
    [tournament, "SCORE_BY_RANK", "DEFAULT_TOURNAMENT_SCORE_BY_RANK"],
  ];

  for (const [rust, rustName, tsName] of pairs) {
    const rustValue = readRustConstant(rust, rustName);
    const tsValue = tsValues[tsName];
    if (tsValue === undefined) throw new Error("Missing TS export " + tsName);
    compare(rustName + " / " + tsName, rustValue, tsValue);
  }

  const roomEntry = readFileSync(
    resolve(root, "apps/web/src/components/poke-lounge/runtime/game/network/room-entry.ts"),
    "utf8",
  );
  const alphabetMatches = [...roomEntry.matchAll(/^const ROOM_CODE_ALPHABET = "([A-Z0-9]+)";/gm)];
  if (alphabetMatches.length !== 1) throw new Error("Expected exactly one TS ROOM_CODE_ALPHABET");
  compare(
    "ROOM_CODE_ALPHABET",
    readRustConstant(domain, "ROOM_CODE_ALPHABET"),
    alphabetMatches[0][1],
  );

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
    "^pub const " +
      name +
      ":\\s*(u64|usize|u8|&str|\\[(?:u64|usize|&str);\\s*(\\d+)\\]|&\\[u8;\\s*(\\d+)\\])\\s*=\\s*([^;]+);",
    "gm",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected exactly one Rust constant " + name);
  const [, type, length, byteLength, expression] = matches[0];
  if (type === "&str" || type.startsWith("&[")) {
    const literal = expression.trim().match(type === "&str" ? /^"([^"\\]*)"$/ : /^b"([^"\\]*)"$/);
    if (!literal) throw new Error("Expected Rust string literal for " + name);
    if (byteLength !== undefined && Buffer.byteLength(literal[1], "utf8") !== Number(byteLength)) {
      throw new Error("Invalid byte string length for " + name);
    }
    return literal[1];
  }
  if (type.startsWith("[&str;")) {
    const items = JSON.parse(expression.trim().replace(/,\s*\]$/, "]"));
    if (
      !Array.isArray(items) ||
      items.length !== Number(length) ||
      items.some(item => typeof item !== "string")
    ) {
      throw new Error("Invalid string array literal or length for " + name);
    }
    return items;
  }
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

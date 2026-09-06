import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalize } from "../../packages/poke-lounge-battle/src/canonical-json";
import { COMPETITIVE_CATALOG_HASH } from "../../packages/poke-lounge-battle/src/competitive-catalog.generated";
import {
  COMPETITIVE_RULESET_V3,
  COMPETITIVE_RULESET_HASH,
} from "../../packages/poke-lounge-battle/src/competitive-ruleset-config";
const hash = createHash("sha256")
  .update(canonicalize({ catalogHash: COMPETITIVE_CATALOG_HASH, ruleset: COMPETITIVE_RULESET_V3 }))
  .digest("hex");
if (process.argv.includes("--write")) {
  const path = "packages/poke-lounge-battle/src/competitive-ruleset-config.ts";
  const source = readFileSync(path, "utf8");
  const next = source.replace(
    /export const COMPETITIVE_RULESET_HASH =\s*"[a-f0-9]{64}";/,
    `export const COMPETITIVE_RULESET_HASH = "${hash}";`,
  );
  if (!next.includes(hash)) throw Error("Could not update ruleset hash");
  writeFileSync(path, next);
} else if (hash !== COMPETITIVE_RULESET_HASH)
  throw Error("V3 ruleset hash does not match current configuration");
console.log(`HGSS ruleset v3 ${hash}`);

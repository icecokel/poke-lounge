import { COMPETITIVE_RULESET_HASH } from "../competitive-ruleset-config";
import { LEAGUE_ROSTER_VERSION } from "./roster/index";

export const LEAGUE_ENGINE_REVISION = 7;
export const LEAGUE_ENGINE_VERSION = `league1:r${LEAGUE_ENGINE_REVISION}:sim0.10.11:${COMPETITIVE_RULESET_HASH.slice(0, 12)}:${LEAGUE_ROSTER_VERSION.slice(-12)}`;

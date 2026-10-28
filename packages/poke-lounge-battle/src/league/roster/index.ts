import type { LeagueComposition, LeagueSeasonRoster } from "../contract";

export const LEAGUE_ROSTER_VERSION = "roster0:000000000000";

export function seasonRoster(): LeagueSeasonRoster {
  throw new Error("ROSTER_NOT_READY");
}

export function defenseComposition(_c: LeagueComposition): LeagueComposition {
  throw new Error("ROSTER_NOT_READY");
}

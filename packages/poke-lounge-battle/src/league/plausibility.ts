import { getLeagueGrowthData } from "./growth/data";
import { checkLeaguePartyContextFree } from "./growth/plausibility";
import type { LeagueMintedMon, LeaguePartyClaim } from "./contract";

export class LeaguePlausibilityError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(reasons.join(", "));
  }
}

export function assertLeaguePartyPlausible(
  claim: LeaguePartyClaim,
  mons: readonly LeagueMintedMon[],
): void {
  const data = getLeagueGrowthData();
  if (!data) throw new LeaguePlausibilityError(["NOT_IMPLEMENTED"]);
  const reasons = checkLeaguePartyContextFree(claim, mons, data);
  if (reasons.length) throw new LeaguePlausibilityError(reasons);
}

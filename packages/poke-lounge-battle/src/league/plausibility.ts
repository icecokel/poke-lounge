import type { LeagueMintedMon, LeaguePartyClaim } from "./contract";

export class LeaguePlausibilityError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(reasons.join(", "));
  }
}

export function assertLeaguePartyPlausible(
  _claim: LeaguePartyClaim,
  _mons: readonly LeagueMintedMon[],
): void {
  throw new LeaguePlausibilityError(["NOT_IMPLEMENTED"]);
}

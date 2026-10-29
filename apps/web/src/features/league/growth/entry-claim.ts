import type { LeagueEntryClaimResult } from "../contract";

export function getLeagueEntryClaim(): LeagueEntryClaimResult {
  return { ok: false, reason: "NO_SAVE" };
}

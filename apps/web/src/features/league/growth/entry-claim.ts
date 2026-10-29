import type { LeagueEntryClaimResult } from "../contract";

export function getLeagueEntryClaim(_runId: string): LeagueEntryClaimResult {
  return { ok: false, reason: "NO_SAVE" };
}

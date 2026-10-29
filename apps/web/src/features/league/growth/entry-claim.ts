import type { LeagueEntryClaimResult } from "../contract";
import { readLeagueSave } from "./league-save";
import { buildLeaguePartyClaim } from "./claim";
export function getLeagueEntryClaim(runId: string): LeagueEntryClaimResult {
  const save = readLeagueSave(runId);
  if (!save) return { ok: false, reason: "NO_SAVE" };
  if (save.runId !== runId) return { ok: false, reason: "RUN_MISMATCH" };
  return buildLeaguePartyClaim(save, true);
}

import type {
  LeagueBattleParty,
  LeagueInput,
  LeagueMatchMeasure,
  LeagueMintedMon,
  LeaguePartyClaim,
  LeagueSeed,
} from "@poke-lounge/battle/league/contract";
import type { LeagueGrowthView, RunView } from "../contract";
import type { LeagueSaveEnvelope } from "../growth/league-save";
import { encodeLeagueSave, decodeLeagueSave } from "../growth/save-codec";
import { leagueRequest } from "./core";
export interface GrowthStart {
  run: RunView;
  starter: LeagueMintedMon;
  growth: LeagueGrowthView;
}
export interface GrowthSave {
  run: RunView;
  growth: LeagueGrowthView;
  starter: LeagueMintedMon;
  save: { rev: number; savedAtMs: number; data: LeagueSaveEnvelope } | null;
}
export interface BadgeBattleView {
  battleId: string;
  badgeIndex: number;
  npc: { npcKey: string; displayName: string; party: LeagueBattleParty };
  challengerParty: LeagueBattleParty;
  carryHash: string;
  seed: LeagueSeed;
  engineVersion: string;
  rulesVersion: number;
}
export interface BadgeSubmission {
  contractVersion: 1;
  engineVersion: string;
  leadSlot: number;
  startHash: string;
  inputs: LeagueInput[];
  client: { winner: 0 | 1 | null; turns: number; endHash: string };
}
export const startLeagueGrowth = (starterSpeciesId: number, requestKey: string) =>
  leagueRequest<GrowthStart>("/runs", { method: "POST", body: { starterSpeciesId, requestKey } });
export async function loadLeagueSave(runId: string): Promise<GrowthSave> {
  const result = await leagueRequest<GrowthSave>(`/runs/${runId}/save`);
  if (result.save) result.save.data = await decodeLeagueSave(result.save.data);
  return result;
}
export const uploadLeagueSave = async (
  runId: string,
  baseRev: number,
  data: LeagueSaveEnvelope,
  keepalive = false,
) =>
  leagueRequest<{ rev: number; savedAtMs: number }>(`/runs/${runId}/save`, {
    method: "PUT",
    body: { baseRev, data: await encodeLeagueSave(data, baseRev, keepalive) },
    keepalive,
  });
export const mintLeagueCapture = (
  runId: string,
  speciesId: number,
  level: number,
  requestKey: string,
) =>
  leagueRequest<LeagueMintedMon>(`/runs/${runId}/mints`, {
    method: "POST",
    body: { speciesId, level, requestKey },
  });
export const startLeagueBadge = (runId: string, party: LeaguePartyClaim, requestKey: string) =>
  leagueRequest<BadgeBattleView>(`/runs/${runId}/badge-battles`, {
    method: "POST",
    body: { party, requestKey },
  });
export const submitLeagueBadge = (battleId: string, body: BadgeSubmission) =>
  leagueRequest<{ status: "won" | "lost" | "draw"; measure: LeagueMatchMeasure; run: RunView }>(
    `/badge-battles/${battleId}/result`,
    { method: "POST", body },
  );

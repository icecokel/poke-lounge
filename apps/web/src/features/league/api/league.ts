import type {
  LeagueBattleParty,
  LeagueInput,
  LeagueMatchMeasure,
  LeagueOpponentMeta,
  LeaguePartyClaim,
  LeaguePublicMember,
  LeagueSeed,
} from "@poke-lounge/battle/league/contract";
import type { AttemptSummary, MeView, StatusView } from "../contract";
import { leagueRequest } from "./core";

export type StandingEntry = LeagueOpponentMeta & {
  score: number;
  publicParty: LeaguePublicMember[];
};
export interface StandingsView {
  seasonId: number | null;
  rev: number;
  entries: StandingEntry[];
}
export interface HallOfFameView {
  seasons: Array<{ seasonId: number; entries: StandingEntry[] }>;
}
export interface MySeasonRecord {
  seasonId: number;
  bestScore: number;
  bestRank: number | null;
  finalRank: number | null;
}
export interface MySeasonsView {
  seasons: MySeasonRecord[];
}
export interface CurrentMatch {
  index: number;
  seed: LeagueSeed;
  carryParty: LeagueBattleParty;
  carryHash: string;
}
export interface AttemptView extends AttemptSummary {
  engineVersion: string;
  rulesVersion: number;
  challengerParty: LeagueBattleParty;
  opponents: Array<{ meta: LeagueOpponentMeta; party: LeagueBattleParty }>;
  matches: Array<{ index: number; measure: LeagueMatchMeasure }>;
  current?: CurrentMatch;
}
export interface MatchSubmission {
  contractVersion: 1;
  engineVersion: string;
  leadSlot: number;
  startHash: string;
  inputs: readonly LeagueInput[];
  client: { winner: 0 | 1 | null; turns: number; endHash: string };
}
export interface FinalView {
  score: number;
  recorded: boolean;
  position: number | null;
  bestRank: number | null;
  runClosed: boolean;
}
export interface MatchResponse {
  measure: LeagueMatchMeasure;
  attempt: AttemptSummary;
  next?: CurrentMatch;
  final?: FinalView;
}
export const getStatus = () => leagueRequest<StatusView>("/status");
export const getMe = () => leagueRequest<MeView>("/me");
export const getStandings = () => leagueRequest<StandingsView>("/standings");
export const getHallOfFame = () => leagueRequest<HallOfFameView>("/hall-of-fame");
export const getMySeasons = () => leagueRequest<MySeasonsView>("/me/seasons");
export const getCurrentAttempt = () => leagueRequest<AttemptView | null>("/attempts/current");
export const enterAttempt = (runId: string, party: LeaguePartyClaim, entryKey: string) =>
  leagueRequest<AttemptView>("/attempts", { method: "POST", body: { runId, party, entryKey } });
export const submitMatch = (id: string, index: number, body: MatchSubmission) =>
  leagueRequest<MatchResponse>(`/attempts/${encodeURIComponent(id)}/matches/${index}`, {
    method: "POST",
    body,
  });
export const forfeitAttempt = (id: string) =>
  leagueRequest<{ attempt: AttemptSummary }>(`/attempts/${encodeURIComponent(id)}/forfeit`, {
    method: "POST",
    body: {},
  });

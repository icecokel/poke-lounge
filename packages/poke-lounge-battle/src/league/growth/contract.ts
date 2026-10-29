import type {
  LeagueBadgeNpc,
  LeagueBattleParty,
  LeagueComposition,
  LeagueInput,
  LeagueMatchMeasure,
  LeagueMintedMon,
  LeaguePartyClaim,
  LeagueSeed,
  LeagueStatValues,
} from "../contract";

export const LEAGUE_GROWTH_RULES_VERSION = 1;
export const LEAGUE_DEFAULT_EXP_MULTIPLIER_PERMILLE = 1500; // OQ10·OQ17: 원작 Gen4 식 × 1.5
export const LEAGUE_HAPPINESS = 70; // 리그 성장에는 친밀도 증가 수단이 없다(5.2절 R6)
export const LEAGUE_GROWTH_GRACE_LEVELS = 5;
export const LEAGUE_GROWTH_MS_PER_LEVEL_AT_DEFAULT = 60_000; // 배율 1.5일 때 1레벨/분. 실제 값 = 60000 × 1500 / expMultiplierPermille
export const LEAGUE_MAX_MINTS_PER_RUN = 400;
export const LEAGUE_SAVE_MAX_BYTES = 96 * 1024;

export interface LeagueGrowthView {
  rulesVersion: 1;
  expMultiplierPermille: number;
}
export interface LeagueMintRecord extends LeagueMintedMon {
  origin: "starter" | "capture";
  mintedAtMs: number;
}
export interface LeagueCheckpointEntry {
  speciesId: number;
  level: number;
  experience: number;
  effortValues: LeagueStatValues;
  atMs: number;
}
export interface LeagueGrowthCheckpoint {
  version: 1;
  growth: LeagueGrowthView; // 성장 시작 때 고정(시즌 중 배율 변경이 열린 run에 닿지 않게)
  mons: Record<string, LeagueCheckpointEntry>; // monId → 마지막으로 받아들인 상태
}
export interface LeagueRunContext {
  starterLevel: number;
  createdAtMs: number;
}

export type LeagueGrowthJudgeOp =
  | {
      kind: "mint";
      origin: "starter" | "capture";
      speciesId: number;
      level: number;
      random: string /* 64 hex */;
      run: LeagueRunContext;
      checkpoint: LeagueGrowthCheckpoint;
      nowMs: number;
    }
  | {
      kind: "check-party";
      purpose: "badge" | "entry";
      claim: LeaguePartyClaim;
      mons: LeagueMintRecord[];
      run: LeagueRunContext;
      checkpoint: LeagueGrowthCheckpoint;
      nowMs: number;
    }
  | {
      kind: "prepare-badge";
      badgeIndex: number;
      claim: LeaguePartyClaim;
      mons: LeagueMintRecord[];
      npc: LeagueBadgeNpc;
    }
  | {
      kind: "judge-badge";
      seed: LeagueSeed;
      challengerParty: LeagueBattleParty;
      npcParty: LeagueBattleParty;
      leadSlot: number;
      inputs: LeagueInput[];
    };

export type LeagueMintResult = Omit<LeagueMintedMon, "monId">;
export interface LeagueCheckPartyResult {
  checkpoint: LeagueGrowthCheckpoint;
} // 실패는 PARTY_IMPLAUSIBLE { reasons }
export interface LeaguePrepareBadgeResult {
  composition: LeagueComposition;
  challengerParty: LeagueBattleParty;
  npcParty: LeagueBattleParty;
  carryHash: string;
}
export interface LeagueJudgeBadgeResult {
  measure: LeagueMatchMeasure;
}

/** 실패 사유 문자열(PARTY_IMPLAUSIBLE.detail.reasons[]). 형식 `<규칙>:<slotIndex|->` */
export type LeaguePlausibilityRule =
  | "R1_OWNERSHIP"
  | "R2_SPECIES_CHAIN"
  | "R3_LEVEL_RANGE"
  | "R4_EXPERIENCE"
  | "R5_EFFORT"
  | "R6_HAPPINESS"
  | "R7_MOVES"
  | "R8_REGRESSION"
  | "R9_GROWTH_SPEED"
  | "R10_PARTY_SIZE"
  | "M1_SPECIES"
  | "M2_LEVEL"
  | "DATA_UNAVAILABLE";

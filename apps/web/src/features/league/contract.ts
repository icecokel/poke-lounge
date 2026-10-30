import type { ComponentType } from "react";
import type { PokeLoungeRuntimeAssets } from "@/components/poke-lounge/runtime/game/assets/poke-lounge-runtime-assets";
import type {
  LeagueBattleParty,
  LeagueMatchMeasure,
  LeagueMintedMon,
  LeaguePartyClaim,
  LeagueSeed,
} from "@poke-lounge/battle/league/contract";
import type { LeagueMatchInit, LeagueMatchProgress } from "@poke-lounge/battle/league/match";
import type { LeagueGrowthView } from "@poke-lounge/battle/league/growth/contract";

export type LeagueLocale = "ko-KR" | "en-US" | "ja-JP";
export interface LeagueRuntime {
  locale: LeagueLocale;
  runtimeAssets: PokeLoungeRuntimeAssets;
  engineVersion: string;
} // 실행 데이터 등록은 load-runtime(F5a)이 끝낸 상태
export type SeasonPhase = "scheduled" | "open" | "closing" | "settled";
export interface SeasonView {
  id: number;
  phase: SeasonPhase;
  startsAtMs: number;
  closesAtMs: number;
  settleDeadlineMs: number;
  starterSpeciesIds: number[];
  starterLevel: number;
}
export interface LeagueTestModeView {
  marker: string;
  starterLevel: number | null; // null = 테스트 대체 없음
  badgesRequired: number; // 0..8
  opponentLevelDrop: number; // 0..49
  accounts: number; // 1..8
  login: boolean; // Rust에 로그인 토큰이 있음
}
export interface StatusView {
  enabled: true;
  contractVersion: number;
  engineVersion: string | null;
  rulesVersion: number;
  nowMs: number;
  season: SeasonView | null;
  test?: LeagueTestModeView;
}
export interface RunView {
  id: string;
  status: "active" | "challenging" | "closed";
  starterSpeciesId: number;
  badges: number;
  createdAtMs: number;
}
export interface AttemptSummary {
  id: string;
  status: "active" | "completed" | "failed" | "expired" | "void";
  currentMatch: number;
  enteredAtMs: number;
  updatedAtMs: number;
  score: number | null;
  failReason: string | null;
}
export interface MeView {
  user: { displayName: string; nickname?: string | null; nicknameChangeableAtMs?: number | null }; // F2 병합 전에는 nickname 없음
  run: RunView | null;
  attempt: AttemptSummary | null;
  best: { score: number; bestRank: number | null; recordedAtMs: number } | null;
}
export type MintedMon = LeagueMintedMon;

export interface LeagueJudgedBattleProps {
  mode: "badge" | "league";
  runtime: LeagueRuntime;
  init: Omit<LeagueMatchInit, "leadSlot">;
  opponent: { displayName: string; className?: string };
  matchLabel?: string;
  onFinished(result: {
    progress: LeagueMatchProgress;
    leadSlot: number;
    participants: number[];
  }): void;
  onAbort(): void;
}
export interface LeagueGrowthScreenProps {
  runtime: LeagueRuntime;
  status: StatusView;
  me: MeView;
  JudgedBattle: ComponentType<LeagueJudgedBattleProps>; // 셸(F5a)이 LeagueJudgedBattle을 넘긴다
  onExit(reason: "home" | "run-changed"): void; // 홈으로. run-changed면 셸이 /me를 다시 읽음
}
export type LeagueEntryClaimResult =
  | {
      ok: true;
      claim: LeaguePartyClaim;
      preview: Array<{ slotIndex: number; speciesId: number; level: number; moveIds: number[] }>;
    }
  | {
      ok: false;
      reason: "NO_SAVE" | "PARTY_SIZE" | "PENDING_MINT" | "MINT_REJECTED" | "RUN_MISMATCH";
    };
export type { LeagueBattleParty, LeagueMatchMeasure, LeagueSeed, LeagueGrowthView };

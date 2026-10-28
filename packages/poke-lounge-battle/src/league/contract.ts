export const LEAGUE_CONTRACT_VERSION = 1;
export const LEAGUE_RULES_VERSION = 1;
export const LEAGUE_LEVEL_CAP = 50;
export const LEAGUE_PARTY_SIZE = 6;
export const LEAGUE_MATCH_COUNT = 5;
export const LEAGUE_MAX_INPUTS_PER_MATCH = 1000;
export const LEAGUE_TURN_LIMIT = 300; // 300턴을 넘기면 무승부(draw, 미완주). 판정 시간 상한을 지키기 위한 리그 규칙(OQ2: 미완주 종료)
export const LEAGUE_MAX_ADVANCES_PER_MATCH = 1200; // 턴 상한 + 교체 요청 여유
export const LEAGUE_AI_DIFFICULTY = "normal" as const;

export type LeagueGender = "male" | "female" | "genderless";
export interface LeagueStatValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

/** D4 등록 구성 = 입장 당시 파티 구성. 전투 상태(HP·PP·상태이상)는 없다. */
export interface LeagueCompositionMember {
  slotIndex: number; // 0..5
  monId?: string; // 플레이어 개체(F2 발급 UUID). NPC는 없음
  speciesId: number;
  level: number; // 원래 레벨(성장 레벨). 상한 적용 전
  natureId: number; // 0..24
  abilityId: number; // 종족 특성 목록 안의 값
  gender: LeagueGender;
  happiness: number; // 0..255
  individualValues: LeagueStatValues;
  effortValues: LeagueStatValues;
  heldItemId: number; // 플레이어 0, NPC는 ROM 값
  moves: Array<{ moveId: number; maxPp: number }>; // 1..4, 중복 없음
}
export interface LeagueComposition {
  version: 1;
  leadSlot: number;
  members: LeagueCompositionMember[];
}

/** 전투에 넣는 파티. 경기 사이 상태는 currentHp·status·pp로 표현한다. */
export interface LeagueBattleMember extends Omit<LeagueCompositionMember, "level" | "moves"> {
  level: number; // 실효 레벨(리그전은 min(원래, 50))
  originalLevel: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  currentHp: number; // 0이면 기절
  status: "normal" | "fainted"; // 경기 시작 시점에는 둘 중 하나뿐(경기 사이 상태이상 회복)
  moves: Array<{ moveId: number; pp: number; maxPp: number }>;
}
export interface LeagueBattleParty {
  version: 1;
  activeSlotIndex: number;
  members: LeagueBattleMember[];
}

export type LeagueSeed = [number, number, number, number]; // 각 0..65535
export type LeagueInput = ["m", number] | ["s", number];

export interface LeagueFraction {
  num: string;
  den: string;
} // BigInt 10진 문자열, den > 0, 기약분수
export interface LeagueMatchMeasure {
  status: "won" | "lost" | "draw";
  faintedNew: number; // F_i
  hpRatio: LeagueFraction; // H_i (생존자 없으면 0/1)
  turns: number; // T_i
  q: LeagueFraction; // 경기 점수 0..100
  qApprox: number; // 표시용 소수(판정에 쓰지 않음)
  endHash: string;
  luck: { critsFor: number; critsAgainst: number; missesFor: number; missesAgainst: number };
}

/** 4.1절 공개 API의 성장 관련 형식(F2가 채우지만 F1·F3가 1차에서 참조). */
export interface LeagueMintedMon {
  monId: string;
  speciesId: number;
  level: number;
  individualValues: LeagueStatValues;
  natureId: number;
  abilityId: number;
  gender: LeagueGender;
}
export interface LeaguePartyClaim {
  version: 1;
  leadSlot: number;
  members: Array<{
    slotIndex: number;
    monId: string;
    speciesId: number;
    level: number;
    experience: number;
    effortValues: LeagueStatValues;
    happiness: number;
    moveIds: number[];
  }>;
}

/** 상대 메타와 시즌 로스터(F4가 채우고 F3 판정 서비스·F1 시즌 행이 그대로 운반). */
export type LeagueNpcKey = "lance" | "karen" | "bruno" | "koga" | "will";
export interface LeagueOpponentMeta {
  kind: "npc" | "player";
  position: 1 | 2 | 3 | 4 | 5;
  displayName: string;
  npcKey?: LeagueNpcKey;
}
export interface LeaguePublicMember {
  speciesId: number;
  level: number;
  moveIds: number[];
}
export interface LeagueNpcSeed {
  npcKey: LeagueNpcKey;
  displayName: string;
  className: "챔피언" | "사천왕";
  order: 1 | 2 | 3 | 4 | 5;
  composition: LeagueComposition;
  publicParty: LeaguePublicMember[];
}
export interface LeagueBadgeNpc {
  npcKey: string;
  displayName: string;
  badgeIndex: number;
  composition: LeagueComposition;
}
export interface LeagueSeasonRoster {
  rosterVersion: string;
  npcSeeds: LeagueNpcSeed[];
  badgeNpcs: LeagueBadgeNpc[];
}

/** 4.2절 판정 서비스 계약. Rust(F1)는 이 형식을 serde_json::Value로 다루고 f1-store.md 13절의 필드만 읽는다. */
export const LEAGUE_JUDGE_PROTOCOL = "league-judge/1";
export type LeagueJudgeOp =
  | { kind: "season-roster" }
  | {
      kind: "prepare-entry";
      claim: LeaguePartyClaim;
      mons: LeagueMintedMon[];
      opponents: Array<{ meta: LeagueOpponentMeta; composition: LeagueComposition }>;
    }
  | {
      kind: "judge-match";
      seed: LeagueSeed;
      matchIndex: number;
      carryParty: LeagueBattleParty;
      opponent: LeagueBattleParty;
      leadSlot: number;
      inputs: LeagueInput[];
      previousQ: LeagueFraction[];
    };
export interface LeaguePrepareEntryResult {
  composition: LeagueComposition;
  challengerParty: LeagueBattleParty;
  carryHash: string;
  opponents: Array<{ meta: LeagueOpponentMeta; party: LeagueBattleParty }>;
}
export interface LeagueJudgeMatchResult {
  measure: LeagueMatchMeasure;
  carryParty?: LeagueBattleParty;
  carryHash?: string;
  final?: { score: number; detail: { q: LeagueFraction[]; total: LeagueFraction } };
}
export type LeagueJudgeErrorCode =
  | "ENGINE_VERSION_MISMATCH"
  | "INVALID_REQUEST"
  | "PARTY_INVALID"
  | "PARTY_IMPLAUSIBLE"
  | "PARTY_CHECK_UNAVAILABLE"
  | "ROSTER_NOT_READY"
  | "ROSTER_SOURCE_INVALID"
  | "ILLEGAL_INPUT"
  | "INCOMPLETE_INPUT"
  | "TRAILING_INPUT"
  | "TOO_LONG"
  | "ENGINE_STALL";

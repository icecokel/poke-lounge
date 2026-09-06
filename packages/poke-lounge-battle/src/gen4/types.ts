import type { BattleStatStages } from "../battle-stat-stages";

export type Gen4Status =
  | "normal"
  | "poisoned"
  | "badlyPoisoned"
  | "burned"
  | "paralyzed"
  | "asleep"
  | "frozen"
  | "fainted";
export interface Gen4StatValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}
export interface Gen4Traits {
  gender?: "male" | "female" | "genderless";
  natureId?: number;
  abilityId?: number;
  heldItemId?: number;
  effortValues?: Gen4StatValues;
  /** Sleep turns remaining; unlike temporary confusion, sleep survives leaving battle. */
  statusTurns?: number;
  happiness?: number;
}
export interface Gen4Member extends Gen4Traits {
  slotIndex: number;
  speciesId: number;
  name: string;
  level: number;
  gender?: "male" | "female" | "genderless";
  individualValues?: Gen4StatValues;
  maxHp?: number;
  currentHp?: number;
  status?: Gen4Status;
  attack?: number;
  defense?: number;
  specialAttack?: number;
  specialDefense?: number;
  speed?: number;
  statStages?: BattleStatStages;
  moves: Array<{ moveId: number; pp: number; maxPp?: number }>;
}
export interface Gen4ActionRequest {
  kind: "move" | "switch" | "wait" | "ended";
  moves: Array<{ moveId: number; pp: number; maxPp: number; disabled: boolean }>;
  switchSlots: number[];
  trapped: boolean;
  /** Charging, rampage or recharge: no new move may be selected. */
  forcedMoveId: number | null;
  recharge: boolean;
}
export type Gen4Action =
  | { kind: "move"; moveId: number | "struggle" }
  | { kind: "switch"; slotIndex: number }
  | { kind: "continue" }
  | { kind: "item"; itemId: number; slotIndex: number }
  | { kind: "wait" };
export interface Gen4Session {
  version: 1;
  /** Private! Must not be sent in server room projections. */ snapshot: string;
}
export interface Gen4Party {
  activeSlotIndex: number;
  members: Gen4Member[];
}
export interface Gen4Step {
  text: string;
  actorSide: 0 | 1;
  targetSide: 0 | 1;
  actorSlotIndex: number;
  targetSlotIndex: number;
  playerHp: number;
  opponentHp: number;
  playerStatus: Gen4Status;
  opponentStatus: Gen4Status;
  playerSlotIndex: number;
  opponentSlotIndex: number;
  moveId: number;
  kind: "move" | "status" | "message";
  hit: boolean;
  damage: number;
}
export interface Gen4Frame {
  escapedBy?: 0 | 1;
  session: Gen4Session;
  turn: number;
  parties: [Gen4Party, Gen4Party];
  requests: [Gen4ActionRequest, Gen4ActionRequest];
  steps: Gen4Step[];
  ended: boolean;
  winner: 0 | 1 | null;
  weather: string;
}
export const GEN4_STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "speed",
  "specialAttack",
  "specialDefense",
] as const;
export const GEN4_ZERO_EVS: Gen4StatValues = {
  hp: 0,
  attack: 0,
  defense: 0,
  speed: 0,
  specialAttack: 0,
  specialDefense: 0,
};
export const GEN4_NATURES = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky",
] as const;
export function validGen4EffortValues(value: unknown): value is Gen4StatValues {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    GEN4_STAT_KEYS.every(
      k => Number.isInteger(v[k]) && (v[k] as number) >= 0 && (v[k] as number) <= 255,
    ) && GEN4_STAT_KEYS.reduce((sum, k) => sum + (v[k] as number), 0) <= 510
  );
}

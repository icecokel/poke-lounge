import { createHash } from "node:crypto";
import { canonicalize } from "./canonical-json";
import type { BattleStatStages } from "./battle-stat-stages";
import type { CompetitivePersistentStatus } from "./competitive-party";

export { canonicalize } from "./canonical-json";

export type CanonicalBattleStatus = CompetitivePersistentStatus;

export type CanonicalIdRecord<T> = Readonly<Record<string, T>>;

export function createCanonicalIdRecord<T>(
  entries: Iterable<readonly [string, T]>,
): CanonicalIdRecord<T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

export interface CanonicalMoveState {
  moveId: number;
  pp: number;
}

export interface CanonicalCombatantState {
  slotIndex: number;
  speciesId: number;
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  typeIds: readonly [number] | readonly [number, number];
  statStages: BattleStatStages;
  status: CanonicalBattleStatus;
  moves: readonly CanonicalMoveState[];
}

export interface CanonicalPlayerState {
  playerId: string;
  activeSlotIndex: number;
  team: readonly CanonicalCombatantState[];
}

export interface CanonicalTerminalResult {
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: "faint" | "forfeit" | "timeout";
  scoreByPlayerId: CanonicalIdRecord<50 | 100>;
}

export interface CanonicalBattleState {
  rulesetVersion: 2;
  turn: number;
  participantIds: readonly [string, string];
  playersById: CanonicalIdRecord<CanonicalPlayerState>;
  terminal: CanonicalTerminalResult | null;
}

export function hashCanonicalState(state: CanonicalBattleState): string {
  return createHash("sha256").update(canonicalize(state), "utf8").digest("hex");
}

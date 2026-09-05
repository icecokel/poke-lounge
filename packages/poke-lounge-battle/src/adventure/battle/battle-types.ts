import type { PlayerPokemonSlot } from "../player/player-types";
import type { BattleStatStages } from "../../battle-stat-stages";
import type { Gen4BaseStats } from "./gen4-pokemon-stats";
import type { PokemonIndividualValues } from "./individual-values";
import type { PokemonGender } from "./pokemon-gender";

export type BattlePhase =
  | "intro"
  | "command"
  | "move-select"
  | "move-replace-select"
  | "party-select"
  | "bag-select"
  | "resolving"
  | "ended";
export type BattleKind = "sample" | "wild" | "trainer";
export type BattlePokemonStatus = "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";
export type BattleResultReason = "faint" | "timeout" | "forfeit" | "run" | "capture";
export type BattleCommand = "fight" | "bag" | "pokemon" | "run";

export interface BattleSpriteRef {
  assetKey: string;
  path: string;
  frame: number;
  width?: number;
  height?: number;
  columns?: number;
  rows?: number;
}

export type BattleMoveCategory = "physical" | "special" | "status";

export interface BattleMove {
  id: number;
  name: string;
  pp: number;
  maxPp: number;
  type: string;
  typeId: number;
  category: BattleMoveCategory;
  effectCode: number;
  effectChance?: number;
  priority?: number;
  accuracy: number;
  power: number;
  competitiveEffectSupport?: "unsupported-primary" | "unsupported-secondary";
}

export interface BattlePokemon {
  speciesId: number;
  name: string;
  level: number;
  gender?: PokemonGender;
  catchRate: number;
  baseExpYield: number;
  growthRate: number;
  experience: number;
  baseStats: Gen4BaseStats;
  individualValues: PokemonIndividualValues;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  statStages: BattleStatStages;
  typeIds: number[];
  status: BattlePokemonStatus;
  frontSprite: BattleSpriteRef;
  backSprite: BattleSpriteRef;
  moves: BattleMove[];
}

export type BattlePartySlot = PlayerPokemonSlot<BattlePokemon>;

export interface BattleParticipant {
  playerId: string;
  displayName: string;
  pokemon: BattlePokemon;
  party: BattlePartySlot[];
  activePartySlotIndex: number;
}

export interface BattleResult {
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: BattleResultReason;
  capturedPokemon?: BattlePokemon;
  experienceGained?: number;
  levelsGained?: number;
  rewardPokeDollars?: number;
}

export interface BattleExperienceReward {
  message: string;
  pokemon: BattlePokemon;
  party?: BattlePartySlot[];
}

export interface BattleCaptureAttempt {
  ballItemId: string;
  caught: boolean;
  shakes: number;
}

export interface BattleReturnToWorld {
  mapKey: string;
  x: number;
  y: number;
  facing: "front" | "back" | "left" | "right";
}

export interface BattleMessageHpSnapshot {
  playerCurrentHp: number;
  playerStatus: BattlePokemonStatus;
  opponentCurrentHp: number;
  opponentStatus: BattlePokemonStatus;
  attackHitTarget: "player" | "opponent" | null;
}

export interface BattleScreenState {
  battleKind: BattleKind;
  sharePartyExperience?: boolean;
  phase: BattlePhase;
  roundIndex: number;
  matchIndex: number;
  turn: number;
  runAttemptCount: number;
  player: BattleParticipant;
  opponent: BattleParticipant;
  messageQueue: string[];
  messageHpSnapshots?: BattleMessageHpSnapshot[];
  pendingExperienceReward?: BattleExperienceReward | null;
  selectedMoveId: number | null;
  usedInventoryItemId?: string | null;
  captureAttempt?: BattleCaptureAttempt | null;
  tournamentMatchId?: string;
  result: BattleResult | null;
  returnToWorld?: BattleReturnToWorld;
}

export interface BattleAssetManifestEntry {
  key: string;
  path: string;
  role: string;
  sourceArchivePath: string;
  candidate: boolean;
  notes: string[];
}

export interface BattleAssetManifest {
  version: number;
  logicalSize: { width: number; height: number };
  assets: BattleAssetManifestEntry[];
}

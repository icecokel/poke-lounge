import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "./competitive-catalog.generated";
import {
  COMPETITIVE_RULESET_V2,
  isCompetitiveMoveEffectSelectable,
} from "./competitive-ruleset-config";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";

export const COMPETITIVE_PARTY_SNAPSHOT_VERSION = 2;
export const COMPETITIVE_PARTY_SLOT_COUNT = 6;
export const COMPETITIVE_MOVE_COUNT_MAX = 4;
export const COMPETITIVE_POKEMON_LEVEL_MIN = 1;
export const COMPETITIVE_POKEMON_LEVEL_MAX = 100;

export const COMPETITIVE_SUPPORTED_PRIMARY_STATUS_EFFECT_CODES =
  COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes;

export interface CompetitiveIndividualValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export type CompetitivePersistentStatus =
  "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";

export interface CompetitivePartyMemberInput {
  slotIndex: number;
  speciesId: number;
  level: number;
  currentHp: number;
  status: CompetitivePersistentStatus;
  individualValues: CompetitiveIndividualValues;
  moves: Array<{
    moveId: number;
    pp: number;
  }>;
}

export interface CompetitivePartyInput {
  version: 2;
  activeSlotIndex: number;
  members: CompetitivePartyMemberInput[];
}

export interface NormalizedCompetitivePartyMember {
  slotIndex: number;
  speciesId: number;
  level: number;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  typeIds: readonly [number] | readonly [number, number];
  status: CompetitivePersistentStatus;
  individualValues: CompetitiveIndividualValues;
  moves: readonly {
    moveId: number;
    pp: number;
  }[];
}

export interface NormalizedCompetitiveParty {
  version: 2;
  activeSlotIndex: number;
  members: readonly NormalizedCompetitivePartyMember[];
}

export type CompetitivePartyValidationReason =
  | "party-empty"
  | "party-too-large"
  | "slot-out-of-range"
  | "duplicate-slot"
  | "active-slot-missing"
  | "active-pokemon-fainted"
  | "species-unsupported"
  | "level-out-of-range"
  | "iv-out-of-range"
  | "hp-out-of-range"
  | "status-hp-mismatch"
  | "move-count-out-of-range"
  | "duplicate-move"
  | "move-unsupported"
  | "pp-out-of-range"
  | "no-battle-ready-pokemon";

export class CompetitivePartyValidationError extends Error {
  readonly reason: CompetitivePartyValidationReason;

  constructor(reason: CompetitivePartyValidationReason) {
    super("Competitive party snapshot is invalid");
    this.name = "CompetitivePartyValidationError";
    this.reason = reason;
  }
}

export function normalizeCompetitiveParty(
  party: CompetitivePartyInput,
): NormalizedCompetitiveParty {
  if (party.members.length === 0) {
    throw new CompetitivePartyValidationError("party-empty");
  }
  if (party.members.length > COMPETITIVE_PARTY_SLOT_COUNT) {
    throw new CompetitivePartyValidationError("party-too-large");
  }
  if (!isPartySlot(party.activeSlotIndex)) {
    throw new CompetitivePartyValidationError("slot-out-of-range");
  }

  const seenSlots = new Set<number>();
  const members = party.members.map(member => {
    if (!isPartySlot(member.slotIndex)) {
      throw new CompetitivePartyValidationError("slot-out-of-range");
    }
    if (seenSlots.has(member.slotIndex)) {
      throw new CompetitivePartyValidationError("duplicate-slot");
    }
    seenSlots.add(member.slotIndex);

    const species = COMPETITIVE_SPECIES_CATALOG[member.speciesId];
    if (!species) {
      throw new CompetitivePartyValidationError("species-unsupported");
    }
    if (
      !Number.isSafeInteger(member.level) ||
      member.level < COMPETITIVE_POKEMON_LEVEL_MIN ||
      member.level > COMPETITIVE_POKEMON_LEVEL_MAX
    ) {
      throw new CompetitivePartyValidationError("level-out-of-range");
    }
    if (!isValidIndividualValues(member.individualValues)) {
      throw new CompetitivePartyValidationError("iv-out-of-range");
    }

    const stats = calculateGen4BattleStats(
      species.baseStats,
      member.level,
      member.individualValues,
    );
    if (
      !Number.isSafeInteger(member.currentHp) ||
      member.currentHp < 0 ||
      member.currentHp > stats.maxHp
    ) {
      throw new CompetitivePartyValidationError("hp-out-of-range");
    }
    if (!hasMatchingStatusAndHp(member.status, member.currentHp)) {
      throw new CompetitivePartyValidationError("status-hp-mismatch");
    }
    if (member.moves.length < 1 || member.moves.length > COMPETITIVE_MOVE_COUNT_MAX) {
      throw new CompetitivePartyValidationError("move-count-out-of-range");
    }

    const seenMoveIds = new Set<number>();
    const moves = member.moves.map(move => {
      if (seenMoveIds.has(move.moveId)) {
        throw new CompetitivePartyValidationError("duplicate-move");
      }
      seenMoveIds.add(move.moveId);

      const definition = COMPETITIVE_MOVE_CATALOG[move.moveId];
      if (!definition) {
        throw new CompetitivePartyValidationError("move-unsupported");
      }
      if (!Number.isSafeInteger(move.pp) || move.pp < 0 || move.pp > definition.maxPp) {
        throw new CompetitivePartyValidationError("pp-out-of-range");
      }
      return { moveId: move.moveId, pp: move.pp };
    });

    return {
      slotIndex: member.slotIndex,
      speciesId: member.speciesId,
      level: member.level,
      currentHp: member.currentHp,
      ...stats,
      typeIds: species.typeIds,
      status: member.status,
      individualValues: { ...member.individualValues },
      moves,
    };
  });

  const active = members.find(member => member.slotIndex === party.activeSlotIndex);
  if (!active) {
    throw new CompetitivePartyValidationError("active-slot-missing");
  }
  if (active.currentHp === 0) {
    throw new CompetitivePartyValidationError("active-pokemon-fainted");
  }
  if (!members.some(member => member.currentHp > 0)) {
    throw new CompetitivePartyValidationError("no-battle-ready-pokemon");
  }

  return {
    version: COMPETITIVE_PARTY_SNAPSHOT_VERSION,
    activeSlotIndex: party.activeSlotIndex,
    members: members.sort((left, right) => left.slotIndex - right.slotIndex),
  };
}

export function restoreCompetitiveParty(
  party: NormalizedCompetitiveParty,
): NormalizedCompetitiveParty {
  return {
    ...party,
    members: party.members.map(member => ({
      ...member,
      currentHp: member.maxHp,
      status: "normal",
      moves: member.moves.map(move => ({
        ...move,
        pp: getCompetitiveMoveMaxPp(move.moveId),
      })),
    })),
  };
}

function getCompetitiveMoveMaxPp(moveId: number): number {
  const move = COMPETITIVE_MOVE_CATALOG[moveId];
  if (!move) {
    throw new Error("Normalized competitive party contains an unsupported move");
  }

  return move.maxPp;
}

export function isCompetitiveMoveSelectable(moveId: number): boolean {
  const definition = COMPETITIVE_MOVE_CATALOG[moveId];
  return Boolean(definition && isCompetitiveMoveEffectSelectable(definition));
}

export function canUseCompetitiveStruggle(
  moves: readonly { moveId: number; pp: number }[],
): boolean {
  return moves.every(move => move.pp === 0 || !isCompetitiveMoveSelectable(move.moveId));
}

function isPartySlot(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < COMPETITIVE_PARTY_SLOT_COUNT;
}

function isValidIndividualValues(values: CompetitiveIndividualValues): boolean {
  return Object.values(values).every(
    value => Number.isSafeInteger(value) && value >= 0 && value <= 31,
  );
}

function hasMatchingStatusAndHp(status: CompetitivePersistentStatus, currentHp: number): boolean {
  if (currentHp === 0) {
    return status === "fainted";
  }
  return ["normal", "poisoned", "burned", "paralyzed"].includes(status);
}

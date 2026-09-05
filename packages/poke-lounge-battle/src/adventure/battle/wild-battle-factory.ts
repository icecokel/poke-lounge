import type { WildEncounterCandidate } from "../world/wild-encounters";
import type { PlayerPokemon, PlayerPokemonMove } from "../player/pokemon-types";
import type { PlayerPokemonSlot } from "../player/player-types";
import { getRuntimeWildBattleMoveSets } from "../data/game-data-json";
import type { RuntimeRomMoveRecord } from "./battle-rom-data";
import { createDefaultBattleStatStages } from "../../battle-stat-stages";
import { BATTLE_PARTY_SLOT_COUNT, createBattleParty } from "./battle-party";
import { getBattlePokemonAssets } from "./battle-pokemon-assets";
import { getExperienceForLevel } from "./experience";
import {
  createBattleMoveFromRom,
  getMoveIdsForSpeciesAtLevel,
  MAX_POKEMON_MOVE_COUNT,
} from "./level-up-moves";
import { normalizeIndividualValues } from "./individual-values";
import type {
  BattlePartySlot,
  BattleMove,
  BattlePokemon,
  BattleReturnToWorld,
  BattleScreenState,
} from "./battle-types";
import { calculateGen4BattleStats, type Gen4BaseStats } from "./gen4-pokemon-stats";
import { createPokemonGenderFromRatio, type PokemonGender } from "./pokemon-gender";

export interface RomPersonalRecord {
  index: number;
  catch_rate: number;
  base_exp: number;
  growth_rate: number;
  gender_ratio?: number;
  base_stats: Gen4BaseStats;
  types: {
    primary: number;
    secondary?: number | null;
  };
}

export interface RomPersonalRecordCollection {
  records?: RomPersonalRecord[];
  species?: Record<string, unknown>;
}

export interface RomRefinedMoveCollection {
  moves: Record<string, RuntimeRomMoveRecord> | RuntimeRomMoveRecord[];
}

export interface CreateWildBattleStateInput {
  encounter: WildEncounterCandidate;
  personalRecords: RomPersonalRecordCollection;
  moveRecords: RomRefinedMoveCollection;
  playerPokemon?: PlayerPokemon;
  playerParty?: Array<PlayerPokemonSlot<PlayerPokemon>>;
  activePartySlotIndex?: number;
  returnToWorld?: BattleReturnToWorld;
}

const PLAYER_SPECIES_ID = 152;
const PLAYER_NAME = "치코리타";
const PLAYER_LEVEL = 10;

export function createWildBattleState({
  encounter,
  moveRecords,
  personalRecords,
  playerParty: storedPlayerParty,
  playerPokemon: storedPlayerPokemon,
  activePartySlotIndex: storedActivePartySlotIndex,
  returnToWorld,
}: CreateWildBattleStateInput): BattleScreenState {
  const playerBattleSetup = createPlayerBattleSetup({
    activePartySlotIndex: storedActivePartySlotIndex,
    moveRecords,
    personalRecords,
    playerParty: storedPlayerParty,
    playerPokemon: storedPlayerPokemon,
  });
  const opponentPokemon = createBattlePokemon({
    level: encounter.level,
    moveIds: resolveWildBattleMoveIds(encounter.speciesId, encounter.level),
    moveRecords,
    name: encounter.name,
    personalRecords,
    speciesId: encounter.speciesId,
  });

  return {
    battleKind: "wild",
    phase: "intro",
    roundIndex: 0,
    matchIndex: 0,
    turn: 1,
    runAttemptCount: 0,
    player: {
      playerId: "player-1",
      displayName: "Player 1",
      pokemon: playerBattleSetup.pokemon,
      party: playerBattleSetup.party,
      activePartySlotIndex: playerBattleSetup.activePartySlotIndex,
    },
    opponent: {
      playerId: "wild",
      displayName: `야생 ${encounter.name}`,
      pokemon: opponentPokemon,
      party: createBattleParty(opponentPokemon),
      activePartySlotIndex: 0,
    },
    messageQueue: [
      formatWildAppearedMessage(opponentPokemon.name),
      `가랏! ${playerBattleSetup.pokemon.name}!`,
    ],
    selectedMoveId: null,
    result: null,
    ...(returnToWorld ? { returnToWorld } : {}),
  };
}

function createPlayerBattleSetup({
  activePartySlotIndex,
  moveRecords,
  personalRecords,
  playerParty,
  playerPokemon,
}: {
  activePartySlotIndex?: number;
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  playerParty?: Array<PlayerPokemonSlot<PlayerPokemon>>;
  playerPokemon?: PlayerPokemon;
}): { pokemon: BattlePokemon; party: BattlePartySlot[]; activePartySlotIndex: number } {
  if (
    playerParty?.some(function testItem(slot) {
      return slot.pokemon;
    })
  ) {
    const resolvedActivePartySlotIndex = resolveStoredActivePartySlotIndex(
      playerParty,
      activePartySlotIndex,
    );
    const party = createStoredBattleParty({
      moveRecords,
      personalRecords,
      playerParty,
    });
    const pokemon = party.find(function findItem(slot) {
      return slot.slotIndex === resolvedActivePartySlotIndex;
    })?.pokemon;

    if (pokemon) {
      return {
        pokemon,
        party,
        activePartySlotIndex: resolvedActivePartySlotIndex,
      };
    }
  }

  const pokemon = createBattlePokemon({
    currentHp: playerPokemon?.currentHp,
    gender: playerPokemon?.gender,
    individualValues: playerPokemon?.individualValues,
    storedExperience: playerPokemon?.experience,
    storedMoves: playerPokemon?.moves,
    level: playerPokemon?.level ?? PLAYER_LEVEL,
    moveRecords,
    name: playerPokemon?.name ?? PLAYER_NAME,
    personalRecords,
    speciesId: playerPokemon?.speciesId ?? PLAYER_SPECIES_ID,
    status: playerPokemon?.status,
  });

  return {
    pokemon,
    party: createBattleParty(pokemon),
    activePartySlotIndex: 0,
  };
}

function createStoredBattleParty({
  moveRecords,
  personalRecords,
  playerParty,
}: {
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  playerParty: Array<PlayerPokemonSlot<PlayerPokemon>>;
}): BattlePartySlot[] {
  return Array.from({ length: BATTLE_PARTY_SLOT_COUNT }, function callback(_, slotIndex) {
    const storedPokemon = playerParty.find(function findItem(slot) {
      return slot.slotIndex === slotIndex;
    })?.pokemon;

    return {
      slotIndex,
      pokemon: storedPokemon
        ? createStoredBattlePokemon({
            moveRecords,
            personalRecords,
            pokemon: storedPokemon,
          })
        : null,
    };
  });
}

export function createStoredBattlePokemon({
  moveRecords,
  personalRecords,
  pokemon,
}: {
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  pokemon: PlayerPokemon;
}): BattlePokemon {
  return createBattlePokemon({
    currentHp: pokemon.currentHp,
    gender: pokemon.gender,
    individualValues: normalizeIndividualValues(pokemon.individualValues, function callback() {
      return 0.5;
    }),
    storedExperience: pokemon.experience,
    storedMoves: pokemon.moves,
    level: pokemon.level,
    moveRecords,
    name: pokemon.name,
    personalRecords,
    speciesId: pokemon.speciesId,
    status: pokemon.status,
  });
}

function resolveStoredActivePartySlotIndex(
  playerParty: Array<PlayerPokemonSlot<PlayerPokemon>>,
  activePartySlotIndex?: number,
): number {
  if (
    typeof activePartySlotIndex === "number" &&
    Number.isInteger(activePartySlotIndex) &&
    activePartySlotIndex >= 0 &&
    activePartySlotIndex < BATTLE_PARTY_SLOT_COUNT &&
    playerParty.some(function testItem(slot) {
      return slot.slotIndex === activePartySlotIndex && slot.pokemon;
    })
  ) {
    return activePartySlotIndex;
  }

  return (
    playerParty.find(function findItem(slot) {
      return slot.pokemon;
    })?.slotIndex ?? 0
  );
}

function createBattlePokemon({
  level,
  currentHp,
  gender: storedGender,
  individualValues: storedIndividualValues,
  storedExperience,
  storedMoves,
  moveRecords,
  name,
  personalRecords,
  speciesId,
  status,
  moveIds,
}: {
  level: number;
  currentHp?: number;
  gender?: PokemonGender;
  individualValues?: PlayerPokemon["individualValues"];
  storedExperience?: number;
  storedMoves?: PlayerPokemonMove[];
  moveIds?: number[];
  moveRecords: RomRefinedMoveCollection;
  name: string;
  personalRecords: RomPersonalRecordCollection;
  speciesId: number;
  status?: PlayerPokemon["status"];
}): BattlePokemon {
  const personalRecord = findRomPersonalRecord(personalRecords, speciesId);
  if (!personalRecord) {
    throw new Error(`Missing ROM personal record for species ${speciesId}`);
  }
  const individualValues = normalizeIndividualValues(storedIndividualValues);
  const stats = calculateGen4BattleStats(personalRecord.base_stats, level, individualValues);
  const assets = getBattlePokemonAssets(speciesId);
  const growthRate = personalRecord.growth_rate;
  const resolvedCurrentHp = clampHp(currentHp ?? stats.maxHp, stats.maxHp);

  return {
    speciesId,
    name,
    level,
    gender: storedGender ?? createPokemonGenderFromRatio(personalRecord.gender_ratio),
    catchRate: personalRecord.catch_rate,
    baseExpYield: personalRecord.base_exp,
    growthRate,
    experience: resolveBattleExperience(level, growthRate, storedExperience),
    baseStats: personalRecord.base_stats,
    individualValues,
    maxHp: stats.maxHp,
    currentHp: resolvedCurrentHp,
    attack: stats.attack,
    defense: stats.defense,
    specialAttack: stats.specialAttack,
    specialDefense: stats.specialDefense,
    speed: stats.speed,
    statStages: createDefaultBattleStatStages(),
    typeIds: uniqueTypeIds(personalRecord.types.primary, personalRecord.types.secondary),
    status: status === "fainted" || resolvedCurrentHp === 0 ? "fainted" : (status ?? "normal"),
    frontSprite: assets.front,
    backSprite: assets.back,
    moves: createBattleMovesForPokemon({
      canonicalMoveIds: moveIds ?? resolveWildBattleMoveIds(speciesId, level),
      legacyDefaultMoveIds: resolveDefaultBattleMoveIds(speciesId),
      moveRecords,
      storedMoves,
    }),
  };
}

function resolveBattleExperience(
  level: number,
  growthRate: number,
  storedExperience?: number,
): number {
  return typeof storedExperience === "number" && Number.isFinite(storedExperience)
    ? storedExperience
    : getExperienceForLevel(level, growthRate);
}

function clampHp(currentHp: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, currentHp));
}

function createBattleMovesForPokemon({
  canonicalMoveIds,
  legacyDefaultMoveIds,
  moveRecords,
  storedMoves,
}: {
  canonicalMoveIds: number[];
  legacyDefaultMoveIds: number[];
  moveRecords: RomRefinedMoveCollection;
  storedMoves?: PlayerPokemonMove[];
}): BattleMove[] {
  const seenStoredMoveIds = new Set<number>();
  const normalizedStoredMoves = (storedMoves ?? [])
    .filter(function filterItem(move) {
      if (seenStoredMoveIds.has(move.id)) {
        return false;
      }

      seenStoredMoveIds.add(move.id);
      return true;
    })
    .slice(0, MAX_POKEMON_MOVE_COUNT);
  const shouldMigrateLegacyMoveSet =
    normalizedStoredMoves.length > 0 &&
    normalizedStoredMoves.length < Math.min(MAX_POKEMON_MOVE_COUNT, canonicalMoveIds.length) &&
    normalizedStoredMoves.length === legacyDefaultMoveIds.length &&
    normalizedStoredMoves.every(function testItem(move, index) {
      return move.id === legacyDefaultMoveIds[index];
    });

  if (normalizedStoredMoves.length > 0 && !shouldMigrateLegacyMoveSet) {
    const restoredMoves = normalizedStoredMoves
      .map(function mapItem(move) {
        return restoreStoredBattleMove(move, moveRecords);
      })
      .filter(function filterItem(move): move is BattleMove {
        return move !== null;
      });

    if (restoredMoves.length === normalizedStoredMoves.length) {
      return restoredMoves;
    }
  }

  const storedMoveById = new Map(
    normalizedStoredMoves.map(function mapItem(move) {
      return [move.id, move] as const;
    }),
  );

  return canonicalMoveIds.map(function mapItem(moveId) {
    const move = createBattleMoveFromRom(moveId, moveRecords);
    const storedMove = storedMoveById.get(moveId);

    return storedMove ? restoreBattleMovePp(move, storedMove) : move;
  });
}

function restoreStoredBattleMove(
  storedMove: PlayerPokemonMove,
  moveRecords: RomRefinedMoveCollection,
): BattleMove | null {
  try {
    return restoreBattleMovePp(createBattleMoveFromRom(storedMove.id, moveRecords), storedMove);
  } catch {
    return null;
  }
}

function restoreBattleMovePp(move: BattleMove, storedMove: PlayerPokemonMove): BattleMove {
  const pp = Number.isFinite(storedMove.pp)
    ? Math.max(0, Math.min(move.maxPp, Math.trunc(storedMove.pp)))
    : move.pp;

  return {
    ...move,
    pp,
  };
}

function resolveWildBattleMoveIds(speciesId: number, level: number): number[] {
  const levelUpMoveIds = getMoveIdsForSpeciesAtLevel(speciesId, level);

  if (levelUpMoveIds.length > 0) {
    return levelUpMoveIds;
  }

  return resolveDefaultBattleMoveIds(speciesId);
}

function resolveDefaultBattleMoveIds(speciesId: number): number[] {
  return getRuntimeWildBattleMoveSets()[speciesId] ?? [];
}

export function findRomPersonalRecord(
  collection: RomPersonalRecordCollection,
  speciesId: number,
): RomPersonalRecord | null {
  const legacyRecord = collection.records?.find(function findItem(candidate) {
    return candidate.index === speciesId;
  });
  if (legacyRecord) {
    return legacyRecord;
  }

  const record = collection.species?.[String(speciesId)];
  if (!isRecord(record) || !isRecord(record.baseStats) || !isRecord(record.types)) {
    return null;
  }

  const baseStats = record.baseStats;
  const primaryType = readNonNegativeInteger(record.types.primary);
  const secondaryType = readOptionalNonNegativeInteger(record.types.secondary);
  const catchRate = readNonNegativeInteger(record.catchRate);
  const baseExp = readNonNegativeInteger(record.baseExpYield);
  const growthRate = readNonNegativeInteger(record.growthRate);
  const genderRatio = readNonNegativeInteger(record.genderRatio);
  const hp = readPositiveInteger(baseStats.hp);
  const attack = readPositiveInteger(baseStats.attack);
  const defense = readPositiveInteger(baseStats.defense);
  const specialAttack = readPositiveInteger(baseStats.specialAttack);
  const specialDefense = readPositiveInteger(baseStats.specialDefense);
  const speed = readPositiveInteger(baseStats.speed);

  if (
    readPositiveInteger(record.speciesId) !== speciesId ||
    primaryType === null ||
    secondaryType === undefined ||
    catchRate === null ||
    baseExp === null ||
    growthRate === null ||
    genderRatio === null ||
    !hp ||
    !attack ||
    !defense ||
    !specialAttack ||
    !specialDefense ||
    !speed
  ) {
    return null;
  }

  return {
    index: speciesId,
    catch_rate: catchRate,
    base_exp: baseExp,
    growth_rate: growthRate,
    gender_ratio: genderRatio,
    base_stats: {
      hp,
      attack,
      defense,
      special_attack: specialAttack,
      special_defense: specialDefense,
      speed,
    },
    types: {
      primary: primaryType,
      secondary: secondaryType,
    },
  };
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readOptionalNonNegativeInteger(value: unknown): number | null | undefined {
  return value === null ? null : (readNonNegativeInteger(value) ?? undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatWildAppearedMessage(name: string): string {
  return `야생 ${name}${getSubjectParticle(name)} 나타났다!`;
}

function getSubjectParticle(name: string): "이" | "가" {
  const lastCharacter = name[name.length - 1];

  if (!lastCharacter) {
    return "가";
  }

  const hangulOffset = lastCharacter.charCodeAt(0) - 0xac00;

  if (hangulOffset < 0 || hangulOffset > 11171) {
    return "가";
  }

  return hangulOffset % 28 === 0 ? "가" : "이";
}

function uniqueTypeIds(primary: number, secondary?: number | null): number[] {
  return [primary, secondary].filter(function filterItem(typeId, index, typeIds): typeId is number {
    return typeof typeId === "number" && typeIds.indexOf(typeId) === index;
  });
}

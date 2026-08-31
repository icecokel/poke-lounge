import { getBattlePokemonAssets } from "./battlePokemonAssets";
import type { BattlePokemon, BattleSpriteRef } from "./battleTypes";
import { calculateGen4BattleStats, type Gen4BaseStats } from "./gen4PokemonStats";
import { normalizeIndividualValues } from "./individual-values";
import { EVOLUTION_STONE_CATALOG, type EvolutionStoneItemId } from "../items/evolution-stones";
import { getRuntimeGameItem } from "../items/runtime-items";
import type { PlayerPokemon } from "../state/gameStateStore";
import { findRomPersonalRecord, type RomPersonalRecordCollection } from "./wildBattleFactory";
import { createRomEvolutionMessages } from "./evolution-presentation";

export const LEVEL_UP_EVOLUTION_METHOD = 4;
export const ITEM_EVOLUTION_METHOD = 7;
export const MALE_ITEM_EVOLUTION_METHOD = 16;
export const FEMALE_ITEM_EVOLUTION_METHOD = 17;
export const ITEM_EVOLUTION_METHODS = [
  ITEM_EVOLUTION_METHOD,
  MALE_ITEM_EVOLUTION_METHOD,
  FEMALE_ITEM_EVOLUTION_METHOD,
] as const;

export interface PokemonEvolutionRule {
  method: number;
  parameter: number;
  targetSpeciesId: number;
  targetSpeciesName?: string;
}

export type PokemonEvolutionTable = Record<number, PokemonEvolutionRule[]>;

export interface ApplyLevelUpEvolutionInput {
  pokemon: BattlePokemon;
  previousLevel: number;
  currentLevel?: number;
  evolutionTable: PokemonEvolutionTable;
  personalRecords: RomPersonalRecordCollection;
}

export interface ApplyLevelUpEvolutionResult {
  pokemon: BattlePokemon;
  messages: string[];
  evolved: boolean;
}

export interface ApplyEvolutionStoneInput<TPokemon extends PlayerPokemon> {
  pokemon: TPokemon;
  itemId: EvolutionStoneItemId;
  pokemonData: unknown;
}

export interface ApplyPlayerLevelUpEvolutionInput<TPokemon extends PlayerPokemon> {
  pokemon: TPokemon;
  previousLevel: number;
  currentLevel?: number;
  pokemonData: unknown;
}

export interface ApplyPlayerLevelUpStatsInput<TPokemon extends PlayerPokemon> {
  pokemon: TPokemon;
  previousLevel: number;
  pokemonData: unknown;
}

export interface ApplyEvolutionStoneResult<TPokemon extends PlayerPokemon> {
  pokemon: TPokemon;
  messages: string[];
  evolved: boolean;
}

export function normalizePokemonEvolutionTable(data: unknown): PokemonEvolutionTable {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return {};
  }

  const speciesNames = Object.entries(data.species).reduce<Record<number, string>>(
    (accumulator, [speciesIdKey, value]) => {
      const speciesId =
        readPositiveInteger(speciesIdKey) ?? readPositiveInteger(value, "speciesId");
      const speciesName = readNonEmptyString(value, "name");

      if (speciesId && speciesName) {
        accumulator[speciesId] = speciesName;
      }

      return accumulator;
    },
    {},
  );

  return Object.entries(data.species).reduce<PokemonEvolutionTable>(
    (accumulator, [speciesIdKey, value]) => {
      const speciesId =
        readPositiveInteger(speciesIdKey) ?? readPositiveInteger(value, "speciesId");

      if (!speciesId || !isRecord(value)) {
        return accumulator;
      }

      const evolutions = normalizePokemonEvolutionRules(value.evolutions, speciesNames);

      if (evolutions.length > 0) {
        accumulator[speciesId] = evolutions;
      }

      return accumulator;
    },
    {},
  );
}

export function applyLevelUpEvolution({
  currentLevel,
  evolutionTable,
  personalRecords,
  pokemon,
  previousLevel,
}: ApplyLevelUpEvolutionInput): ApplyLevelUpEvolutionResult {
  const rule = findLevelUpEvolutionRule(
    evolutionTable[pokemon.speciesId] ?? [],
    previousLevel,
    currentLevel ?? pokemon.level,
  );

  if (!rule) {
    return { pokemon, messages: [], evolved: false };
  }

  const targetRecord = findRomPersonalRecord(personalRecords, rule.targetSpeciesId);

  if (!targetRecord) {
    return { pokemon, messages: [], evolved: false };
  }

  const evolvedName = getPokemonSpeciesDisplayName(rule);
  const evolvedStats = calculateGen4BattleStats(
    targetRecord.base_stats,
    pokemon.level,
    pokemon.individualValues,
  );
  const maxHpIncrease = Math.max(0, evolvedStats.maxHp - pokemon.maxHp);
  const assets = resolveBattlePokemonAssets(rule.targetSpeciesId, pokemon);

  return {
    pokemon: {
      ...pokemon,
      speciesId: rule.targetSpeciesId,
      name: evolvedName,
      catchRate: targetRecord.catch_rate,
      baseExpYield: targetRecord.base_exp,
      growthRate: targetRecord.growth_rate,
      baseStats: targetRecord.base_stats,
      maxHp: evolvedStats.maxHp,
      currentHp: Math.min(evolvedStats.maxHp, pokemon.currentHp + maxHpIncrease),
      attack: evolvedStats.attack,
      defense: evolvedStats.defense,
      specialAttack: evolvedStats.specialAttack,
      specialDefense: evolvedStats.specialDefense,
      speed: evolvedStats.speed,
      typeIds: uniqueTypeIds(targetRecord.types.primary, targetRecord.types.secondary),
      frontSprite: assets.front,
      backSprite: assets.back,
    },
    messages: createRomEvolutionMessages(pokemon.name, evolvedName),
    evolved: true,
  };
}

export function applyEvolutionStone<TPokemon extends PlayerPokemon>({
  itemId,
  pokemon,
  pokemonData,
}: ApplyEvolutionStoneInput<TPokemon>): ApplyEvolutionStoneResult<TPokemon> {
  const stone = EVOLUTION_STONE_CATALOG[itemId];
  const item = getRuntimeGameItem(itemId);
  if (!item) {
    return { pokemon, messages: [], evolved: false };
  }
  const evolutionTable = normalizePokemonEvolutionTable(pokemonData);
  const rule =
    (evolutionTable[pokemon.speciesId] ?? []).find(
      candidate =>
        stone.evolutionMethods.some(method => method === candidate.method) &&
        candidate.parameter === stone.evolutionParameter &&
        isEvolutionStoneRuleCompatibleWithGender(candidate, pokemon.gender),
    ) ?? null;

  if (!rule) {
    return { pokemon, messages: [], evolved: false };
  }

  return applyPlayerPokemonEvolution({
    pokemon,
    pokemonData,
    rule,
    createMessages: evolvedName => [
      `${pokemon.name}에게 ${item.name}을 사용했다!`,
      ...createRomEvolutionMessages(pokemon.name, evolvedName),
    ],
  });
}

function isEvolutionStoneRuleCompatibleWithGender(
  rule: PokemonEvolutionRule,
  gender: PlayerPokemon["gender"],
): boolean {
  if (rule.method === ITEM_EVOLUTION_METHOD) {
    return true;
  }

  if (rule.method === MALE_ITEM_EVOLUTION_METHOD) {
    return gender === "male";
  }

  if (rule.method === FEMALE_ITEM_EVOLUTION_METHOD) {
    return gender === "female";
  }

  return false;
}

export function applyPlayerLevelUpEvolution<TPokemon extends PlayerPokemon>({
  pokemon,
  previousLevel,
  currentLevel,
  pokemonData,
}: ApplyPlayerLevelUpEvolutionInput<TPokemon>): ApplyEvolutionStoneResult<TPokemon> {
  const evolutionTable = normalizePokemonEvolutionTable(pokemonData);
  const rule = findLevelUpEvolutionRule(
    evolutionTable[pokemon.speciesId] ?? [],
    previousLevel,
    currentLevel ?? pokemon.level,
  );

  if (!rule) {
    return { pokemon, messages: [], evolved: false };
  }

  return applyPlayerPokemonEvolution({
    pokemon,
    pokemonData,
    rule,
    createMessages: evolvedName => createRomEvolutionMessages(pokemon.name, evolvedName),
  });
}

export function applyPlayerLevelUpStats<TPokemon extends PlayerPokemon>({
  pokemon,
  previousLevel,
  pokemonData,
}: ApplyPlayerLevelUpStatsInput<TPokemon>): TPokemon {
  const species = readPokemonDataSpecies(pokemonData, pokemon.speciesId);

  if (!species) {
    return pokemon;
  }

  const individualValues = normalizeIndividualValues(pokemon.individualValues, () => 0);
  const previousStats = calculateGen4BattleStats(
    species.baseStats,
    Math.max(1, previousLevel),
    individualValues,
  );
  const nextStats = calculateGen4BattleStats(species.baseStats, pokemon.level, individualValues);
  const previousMaxHp = normalizePositiveHp(pokemon.maxHp) ?? previousStats.maxHp;
  const previousCurrentHp = normalizeNonNegativeHp(pokemon.currentHp) ?? previousMaxHp;
  const maxHpIncrease = Math.max(0, nextStats.maxHp - previousMaxHp);

  return {
    ...pokemon,
    currentHp:
      pokemon.status === "fainted" || previousCurrentHp === 0
        ? 0
        : Math.min(nextStats.maxHp, previousCurrentHp + maxHpIncrease),
    maxHp: nextStats.maxHp,
    growthRate: species.growthRate,
    individualValues,
  };
}

function applyPlayerPokemonEvolution<TPokemon extends PlayerPokemon>({
  pokemon,
  pokemonData,
  rule,
  createMessages,
}: {
  pokemon: TPokemon;
  pokemonData: unknown;
  rule: PokemonEvolutionRule;
  createMessages(evolvedName: string): string[];
}): ApplyEvolutionStoneResult<TPokemon> {
  const targetSpecies = readPokemonDataSpecies(pokemonData, rule.targetSpeciesId);
  if (!targetSpecies) {
    return { pokemon, messages: [], evolved: false };
  }

  const currentSpecies = readPokemonDataSpecies(pokemonData, pokemon.speciesId);
  const individualValues = normalizeIndividualValues(pokemon.individualValues, () => 0);
  const evolvedStats = calculateGen4BattleStats(
    targetSpecies.baseStats,
    pokemon.level,
    individualValues,
  );
  const currentCalculatedMaxHp = currentSpecies
    ? calculateGen4BattleStats(currentSpecies.baseStats, pokemon.level, individualValues).maxHp
    : evolvedStats.maxHp;
  const currentMaxHp = normalizePositiveHp(pokemon.maxHp) ?? currentCalculatedMaxHp;
  const currentHp = normalizeNonNegativeHp(pokemon.currentHp) ?? currentMaxHp;
  const maxHpIncrease = Math.max(0, evolvedStats.maxHp - currentMaxHp);
  const evolvedCurrentHp =
    pokemon.status === "fainted" || currentHp === 0
      ? 0
      : Math.min(evolvedStats.maxHp, currentHp + maxHpIncrease);
  const evolvedName = rule.targetSpeciesName ?? targetSpecies.name;

  return {
    pokemon: {
      ...pokemon,
      speciesId: rule.targetSpeciesId,
      name: evolvedName,
      maxHp: evolvedStats.maxHp,
      currentHp: evolvedCurrentHp,
      growthRate: targetSpecies.growthRate,
      individualValues,
    },
    messages: createMessages(evolvedName),
    evolved: true,
  };
}

function normalizePokemonEvolutionRules(
  data: unknown,
  speciesNames: Readonly<Record<number, string>>,
): PokemonEvolutionRule[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(value => normalizePokemonEvolutionRule(value, speciesNames))
    .filter((rule): rule is PokemonEvolutionRule => rule !== null);
}

function normalizePokemonEvolutionRule(
  data: unknown,
  speciesNames: Readonly<Record<number, string>>,
): PokemonEvolutionRule | null {
  if (!isRecord(data)) {
    return null;
  }

  const method = readPositiveInteger(data, "method");
  const parameter = readNonNegativeInteger(data, "parameter");
  const targetSpeciesId = readPositiveInteger(data, "targetSpeciesId");

  if (!method || parameter === null || !targetSpeciesId) {
    return null;
  }

  return {
    method,
    parameter,
    targetSpeciesId,
    targetSpeciesName: speciesNames[targetSpeciesId],
  };
}

function findLevelUpEvolutionRule(
  rules: PokemonEvolutionRule[],
  previousLevel: number,
  currentLevel: number,
): PokemonEvolutionRule | null {
  return (
    rules
      .filter(
        rule =>
          rule.method === LEVEL_UP_EVOLUTION_METHOD &&
          previousLevel < currentLevel &&
          currentLevel >= rule.parameter,
      )
      .sort((left, right) => left.parameter - right.parameter)[0] ?? null
  );
}

function getPokemonSpeciesDisplayName(rule: PokemonEvolutionRule): string {
  return rule.targetSpeciesName ?? `포켓몬 #${rule.targetSpeciesId}`;
}

function resolveBattlePokemonAssets(
  speciesId: number,
  fallbackPokemon: BattlePokemon,
): { front: BattleSpriteRef; back: BattleSpriteRef } {
  try {
    return getBattlePokemonAssets(speciesId);
  } catch {
    return {
      front: fallbackPokemon.frontSprite,
      back: fallbackPokemon.backSprite,
    };
  }
}

function readPositiveInteger(value: unknown, key?: string): number | null {
  const candidate = key && isRecord(value) ? value[key] : value;
  const numberValue =
    typeof candidate === "string" && candidate.trim().length > 0
      ? Number.parseInt(candidate, 10)
      : candidate;

  return typeof numberValue === "number" && Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

function readNonNegativeInteger(value: unknown, key?: string): number | null {
  const candidate = key && isRecord(value) ? value[key] : value;
  const numberValue =
    typeof candidate === "string" && candidate.trim().length > 0
      ? Number.parseInt(candidate, 10)
      : candidate;

  return typeof numberValue === "number" && Number.isInteger(numberValue) && numberValue >= 0
    ? numberValue
    : null;
}

function readNonEmptyString(value: unknown, key: string): string | null {
  const candidate = isRecord(value) ? value[key] : undefined;

  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readPokemonDataSpecies(
  data: unknown,
  speciesId: number,
): { name: string; growthRate: number; baseStats: Gen4BaseStats } | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const value = data.species[String(speciesId)];
  if (!isRecord(value)) {
    return null;
  }

  const name = readNonEmptyString(value, "name");
  const growthRate = readNonNegativeInteger(value, "growthRate");
  const baseStats = readGen4BaseStats(value.baseStats);

  return name && growthRate !== null && baseStats ? { name, growthRate, baseStats } : null;
}

function readGen4BaseStats(value: unknown): Gen4BaseStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const hp = readPositiveInteger(value, "hp");
  const attack = readPositiveInteger(value, "attack");
  const defense = readPositiveInteger(value, "defense");
  const specialAttack = readPositiveInteger(value, "specialAttack");
  const specialDefense = readPositiveInteger(value, "specialDefense");
  const speed = readPositiveInteger(value, "speed");

  return hp && attack && defense && specialAttack && specialDefense && speed
    ? {
        hp,
        attack,
        defense,
        special_attack: specialAttack,
        special_defense: specialDefense,
        speed,
      }
    : null;
}

function normalizePositiveHp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function normalizeNonNegativeHp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function uniqueTypeIds(primary: number, secondary?: number | null): number[] {
  return [primary, secondary].filter(
    (typeId, index, typeIds): typeId is number =>
      typeof typeId === "number" && typeIds.indexOf(typeId) === index,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

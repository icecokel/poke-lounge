import {
  calculateGen4BattleStats as calculateSharedGen4BattleStats,
  type Gen4BattleStats,
} from "@poke-lounge/battle/gen4-pokemon-stats";
import { MAX_POKEMON_INDIVIDUAL_VALUE, type PokemonIndividualValues } from "./individual-values";

export const DEFAULT_GEN4_IV = 31;
export const DEFAULT_GEN4_EV = 0;
export const DEFAULT_GEN4_IVS: Readonly<PokemonIndividualValues> = Object.freeze({
  hp: MAX_POKEMON_INDIVIDUAL_VALUE,
  attack: MAX_POKEMON_INDIVIDUAL_VALUE,
  defense: MAX_POKEMON_INDIVIDUAL_VALUE,
  specialAttack: MAX_POKEMON_INDIVIDUAL_VALUE,
  specialDefense: MAX_POKEMON_INDIVIDUAL_VALUE,
  speed: MAX_POKEMON_INDIVIDUAL_VALUE,
});
export const DEFAULT_GEN4_EVS: Readonly<PokemonIndividualValues> = Object.freeze({
  hp: DEFAULT_GEN4_EV,
  attack: DEFAULT_GEN4_EV,
  defense: DEFAULT_GEN4_EV,
  specialAttack: DEFAULT_GEN4_EV,
  specialDefense: DEFAULT_GEN4_EV,
  speed: DEFAULT_GEN4_EV,
});

export interface Gen4BaseStats {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
}

export function calculateGen4BattleStats(
  baseStats: Gen4BaseStats,
  level: number,
  iv: PokemonStatValuesInput = DEFAULT_GEN4_IVS,
  ev: PokemonStatValuesInput = DEFAULT_GEN4_EVS,
): Gen4BattleStats {
  return calculateSharedGen4BattleStats(
    {
      hp: baseStats.hp,
      attack: baseStats.attack,
      defense: baseStats.defense,
      specialAttack: baseStats.special_attack,
      specialDefense: baseStats.special_defense,
      speed: baseStats.speed,
    },
    level,
    toStatValues(iv, DEFAULT_GEN4_IV),
    toStatValues(ev, DEFAULT_GEN4_EV),
  );
}

type PokemonStatValuesInput = number | Partial<PokemonIndividualValues>;

function resolveStatValue(
  input: PokemonStatValuesInput,
  stat: keyof PokemonIndividualValues,
  fallback: number,
): number {
  if (typeof input === "number") {
    return input;
  }

  return input[stat] ?? fallback;
}

function toStatValues(input: PokemonStatValuesInput, fallback: number): PokemonIndividualValues {
  return {
    hp: resolveStatValue(input, "hp", fallback),
    attack: resolveStatValue(input, "attack", fallback),
    defense: resolveStatValue(input, "defense", fallback),
    specialAttack: resolveStatValue(input, "specialAttack", fallback),
    specialDefense: resolveStatValue(input, "specialDefense", fallback),
    speed: resolveStatValue(input, "speed", fallback),
  };
}

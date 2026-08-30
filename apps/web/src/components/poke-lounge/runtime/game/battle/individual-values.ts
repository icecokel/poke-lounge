export const MIN_POKEMON_INDIVIDUAL_VALUE = 0;
export const MAX_POKEMON_INDIVIDUAL_VALUE = 31;

export interface PokemonIndividualValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export const POKEMON_INDIVIDUAL_VALUE_KEYS = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
] as const satisfies ReadonlyArray<keyof PokemonIndividualValues>;

export const MAX_POKEMON_INDIVIDUAL_VALUES: Readonly<PokemonIndividualValues> = Object.freeze({
  hp: MAX_POKEMON_INDIVIDUAL_VALUE,
  attack: MAX_POKEMON_INDIVIDUAL_VALUE,
  defense: MAX_POKEMON_INDIVIDUAL_VALUE,
  specialAttack: MAX_POKEMON_INDIVIDUAL_VALUE,
  specialDefense: MAX_POKEMON_INDIVIDUAL_VALUE,
  speed: MAX_POKEMON_INDIVIDUAL_VALUE,
});

export function createMaxIndividualValues(): PokemonIndividualValues {
  return { ...MAX_POKEMON_INDIVIDUAL_VALUES };
}

export function createRandomIndividualValues(
  random: () => number = Math.random,
): PokemonIndividualValues {
  return {
    hp: rollIndividualValue(random),
    attack: rollIndividualValue(random),
    defense: rollIndividualValue(random),
    specialAttack: rollIndividualValue(random),
    specialDefense: rollIndividualValue(random),
    speed: rollIndividualValue(random),
  };
}

export function normalizeIndividualValues(
  value: unknown,
  random: () => number = Math.random,
): PokemonIndividualValues {
  if (!isRecord(value)) {
    return createRandomIndividualValues(random);
  }

  return {
    hp: normalizeIndividualValue(value.hp, random),
    attack: normalizeIndividualValue(value.attack, random),
    defense: normalizeIndividualValue(value.defense, random),
    specialAttack: normalizeIndividualValue(value.specialAttack, random),
    specialDefense: normalizeIndividualValue(value.specialDefense, random),
    speed: normalizeIndividualValue(value.speed, random),
  };
}

function normalizeIndividualValue(value: unknown, random: () => number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return rollIndividualValue(random);
  }

  return Math.max(
    MIN_POKEMON_INDIVIDUAL_VALUE,
    Math.min(MAX_POKEMON_INDIVIDUAL_VALUE, Math.floor(value)),
  );
}

function rollIndividualValue(random: () => number): number {
  const normalizedRandom = Math.max(0, Math.min(0.999999999, random()));

  return Math.floor(normalizedRandom * (MAX_POKEMON_INDIVIDUAL_VALUE + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

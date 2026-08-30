export const MIN_SUPPORTED_POKEMON_SPECIES_ID = 1;
export const MAX_SUPPORTED_POKEMON_SPECIES_ID = 493;

export const isSupportedPokemonSpeciesId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= MIN_SUPPORTED_POKEMON_SPECIES_ID &&
  value <= MAX_SUPPORTED_POKEMON_SPECIES_ID;

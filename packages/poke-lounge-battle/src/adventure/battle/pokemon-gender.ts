export type PokemonGender = "male" | "female" | "genderless";

const MALE_ONLY_GENDER_RATIO = 0;
const FEMALE_ONLY_GENDER_RATIO = 254;
const GENDERLESS_RATIO = 255;
const GENDER_RANDOM_VALUE_COUNT = 256;

export function createPokemonGenderFromRatio(
  genderRatio: unknown,
  random: () => number = Math.random,
): PokemonGender | undefined {
  if (
    typeof genderRatio !== "number" ||
    !Number.isInteger(genderRatio) ||
    genderRatio < MALE_ONLY_GENDER_RATIO ||
    genderRatio > GENDERLESS_RATIO
  ) {
    return undefined;
  }

  if (genderRatio === MALE_ONLY_GENDER_RATIO) {
    return "male";
  }

  if (genderRatio === FEMALE_ONLY_GENDER_RATIO) {
    return "female";
  }

  if (genderRatio === GENDERLESS_RATIO) {
    return "genderless";
  }

  const randomValue = random();
  const normalizedRandomValue = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
    : 0;
  const personalityGenderValue = Math.floor(normalizedRandomValue * GENDER_RANDOM_VALUE_COUNT);

  return personalityGenderValue < genderRatio ? "female" : "male";
}

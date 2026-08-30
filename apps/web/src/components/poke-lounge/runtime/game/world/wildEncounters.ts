import type { CompletedTileStep } from "./tileSteps";

export const WILD_ENCOUNTER_RATE = 0.15;
export const MIN_POKEMON_LEVEL = 1;
export const MAX_POKEMON_LEVEL = 100;
export const WILD_ENCOUNTER_LEVEL_OFFSET = 5;

export interface WildEncounterSlot {
  speciesId: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  weight: number;
}

export interface WildEncounterCandidate {
  mapKey: string;
  step: CompletedTileStep;
  speciesId: number;
  name: string;
  level: number;
}

export interface WildEncounterLevelRange {
  minLevel: number;
  maxLevel: number;
}

export interface RollWildEncounterInput {
  mapKey: string;
  step: CompletedTileStep;
  random: () => number;
  levelRange?: WildEncounterLevelRange;
  rate?: number;
  slots?: ReadonlyArray<WildEncounterSlot>;
}

export const DEFAULT_WILD_ENCOUNTER_SLOTS = [
  { speciesId: 152, name: "치코리타", minLevel: 5, maxLevel: 7, weight: 1 },
  { speciesId: 155, name: "브케인", minLevel: 5, maxLevel: 7, weight: 1 },
  { speciesId: 158, name: "리아코", minLevel: 5, maxLevel: 7, weight: 1 },
] satisfies ReadonlyArray<WildEncounterSlot>;

export const shouldStartWildEncounter = (
  random: () => number,
  rate = WILD_ENCOUNTER_RATE,
): boolean => random() < rate;

export const pickWeightedEncounterSlot = (
  slots: ReadonlyArray<WildEncounterSlot>,
  random: () => number,
): WildEncounterSlot => {
  const totalWeight = slots.reduce((total, slot) => total + slot.weight, 0);
  const targetWeight = random() * totalWeight;
  let cumulativeWeight = 0;

  for (const slot of slots) {
    cumulativeWeight += slot.weight;

    if (targetWeight < cumulativeWeight) {
      return slot;
    }
  }

  return slots[slots.length - 1];
};

export const createWildEncounterLevelRange = (
  averageLevel: number,
  lowerLevelOffset = WILD_ENCOUNTER_LEVEL_OFFSET,
): WildEncounterLevelRange =>
  normalizeLevelRange({
    minLevel: averageLevel - lowerLevelOffset,
    maxLevel: averageLevel,
  });

export const rollWildEncounter = ({
  levelRange,
  mapKey,
  random,
  rate = WILD_ENCOUNTER_RATE,
  slots = DEFAULT_WILD_ENCOUNTER_SLOTS,
  step,
}: RollWildEncounterInput): WildEncounterCandidate | null => {
  if (!shouldStartWildEncounter(random, rate)) {
    return null;
  }

  const slot = pickWeightedEncounterSlot(slots, random);
  const effectiveLevelRange = normalizeLevelRange(
    levelRange ?? {
      minLevel: slot.minLevel,
      maxLevel: slot.maxLevel,
    },
  );
  const levelRangeSize = effectiveLevelRange.maxLevel - effectiveLevelRange.minLevel + 1;
  const level = effectiveLevelRange.minLevel + Math.floor(random() * levelRangeSize);

  return {
    mapKey,
    step,
    speciesId: slot.speciesId,
    name: slot.name,
    level,
  };
};

function normalizeLevelRange({
  minLevel,
  maxLevel,
}: WildEncounterLevelRange): WildEncounterLevelRange {
  const roundedMin = Math.round(minLevel);
  const roundedMax = Math.round(maxLevel);

  return {
    minLevel: clampLevel(Math.min(roundedMin, roundedMax)),
    maxLevel: clampLevel(Math.max(roundedMin, roundedMax)),
  };
}

function clampLevel(level: number): number {
  return Math.max(MIN_POKEMON_LEVEL, Math.min(MAX_POKEMON_LEVEL, level));
}

import { GEN4_ROM_SPECIES } from "./rom-catalog.generated";
import {
  GEN4_ZERO_EVS,
  GEN4_STAT_KEYS,
  validGen4EffortValues,
  type Gen4Traits,
  type Gen4StatValues,
} from "./types";

/** Deterministic old-save migration; loading a Pokémon never rerolls its traits. */
export function normalizeGen4Traits(speciesId: number, input: Gen4Traits = {}) {
  const abilities = GEN4_ROM_SPECIES[speciesId]?.abilities ?? [];
  return {
    ...(["male", "female", "genderless"].includes(input.gender ?? "")
      ? { gender: input.gender }
      : {}),
    natureId:
      Number.isInteger(input.natureId) && input.natureId! >= 0 && input.natureId! < 25
        ? input.natureId!
        : 0,
    abilityId: abilities.includes(input.abilityId ?? 0) ? input.abilityId! : (abilities[0] ?? 0),
    heldItemId:
      Number.isInteger(input.heldItemId) && input.heldItemId! >= 0 && input.heldItemId! <= 536
        ? input.heldItemId!
        : 0,
    effortValues: {
      ...(validGen4EffortValues(input.effortValues) ? input.effortValues : GEN4_ZERO_EVS),
    },
    happiness: Number.isFinite(input.happiness)
      ? Math.max(0, Math.min(255, Math.floor(input.happiness!)))
      : 70,
    ...(input.statusTurns !== undefined
      ? { statusTurns: Math.max(0, Math.min(7, Math.floor(input.statusTurns))) }
      : {}),
  };
}
export function createGen4Traits(
  speciesId: number,
  random: () => number = Math.random,
): Gen4Traits {
  const abilities = GEN4_ROM_SPECIES[speciesId]?.abilities ?? [0];
  return {
    ...normalizeGen4Traits(speciesId),
    natureId: Math.min(24, Math.floor(random() * 25)),
    abilityId: abilities[Math.min(abilities.length - 1, Math.floor(random() * abilities.length))],
  };
}
export function awardGen4EffortValues(
  values: Gen4StatValues | undefined,
  defeatedSpeciesId: number,
): Gen4StatValues {
  const current = { ...(validGen4EffortValues(values) ? values : GEN4_ZERO_EVS) };
  const reward = GEN4_ROM_SPECIES[defeatedSpeciesId]?.evYield ?? GEN4_ZERO_EVS;
  let remaining = 510 - GEN4_STAT_KEYS.reduce((total, key) => total + current[key], 0);
  for (const key of GEN4_STAT_KEYS) {
    const gain = Math.max(0, Math.min(reward[key], 255 - current[key], remaining));
    current[key] += gain;
    remaining -= gain;
  }
  return current;
}

/** HGSS pokemon.c WildMonSetRandomHeldItem: none/common/rare 45/50/5; Compound Eyes 20/60/20. */
export function sampleGen4WildHeldItem(
  speciesId: number,
  compoundEyes = false,
  random: () => number = Math.random,
): number {
  const [common = 0, rare = 0] = GEN4_ROM_SPECIES[speciesId]?.heldItems ?? [];
  if (common === rare && common !== 0) return common;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error("Invalid held-item RNG");
  const roll = Math.floor(value * 100),
    first = compoundEyes ? 20 : 45,
    second = compoundEyes ? 80 : 95;
  return roll < first ? 0 : roll < second ? common : rare;
}
export function evolvedGen4Ability(
  fromSpecies: number,
  toSpecies: number,
  abilityId: number | undefined,
): number {
  const old = GEN4_ROM_SPECIES[fromSpecies]?.abilities ?? [];
  const next = GEN4_ROM_SPECIES[toSpecies]?.abilities ?? [];
  return next[Math.max(0, old.indexOf(abilityId ?? 0))] ?? next[0] ?? 0;
}

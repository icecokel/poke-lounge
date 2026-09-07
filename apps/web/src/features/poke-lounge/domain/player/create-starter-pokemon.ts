import { getExperienceForLevel } from "@poke-lounge/battle/adventure/battle/experience";
import { createRandomIndividualValues } from "@poke-lounge/battle/adventure/battle/individual-values";
import { createPlayerPokemonMovesForLevel } from "@poke-lounge/battle/adventure/battle/level-up-moves";
import { createPokemonGenderFromRatio } from "@poke-lounge/battle/adventure/battle/pokemon-gender";
import {
  getRuntimePokemonSpeciesGenderRatio,
  getRuntimePokemonSpeciesSummary,
} from "@poke-lounge/battle/adventure/data/game-data-json";
import { calculateGen4BattleStats } from "@poke-lounge/battle/gen4-pokemon-stats";
import type { PlayerPokemon } from "../../contracts/game-state";
export function createStarterPlayerPokemon(
  starter: { speciesId: number },
  level = 10,
  random: () => number = Math.random,
): PlayerPokemon {
  const gender = createPokemonGenderFromRatio(
    getRuntimePokemonSpeciesGenderRatio(starter.speciesId),
    random,
  );

  const individualValues = createRandomIndividualValues();
  const species = getRuntimePokemonSpeciesSummary(starter.speciesId);
  if (!species) {
    throw new Error(`Starter species ${starter.speciesId} is missing from runtime game data`);
  }
  const stats = calculateGen4BattleStats(species.baseStats, level, individualValues);

  return {
    speciesId: starter.speciesId,
    name: species.name,
    level,
    growthRate: species.growthRate,
    experience: getExperienceForLevel(level, species.growthRate),
    ...(gender ? { gender } : {}),
    individualValues,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    status: "normal",
    moves: createPlayerPokemonMovesForLevel(starter.speciesId, level),
  };
}

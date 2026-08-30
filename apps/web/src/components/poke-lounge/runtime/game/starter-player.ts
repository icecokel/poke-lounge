import { calculateGen4BattleStats } from "@poke-lounge/battle";
import type { StarterPokemon } from "../types";
import { createRandomIndividualValues } from "./battle/individual-values";
import { createPlayerPokemonMovesForLevel } from "./battle/levelUpMoves";
import { createPokemonGenderFromRatio } from "./battle/pokemon-gender";
import {
  getRuntimePokemonSpeciesGenderRatio,
  getRuntimePokemonSpeciesSummary,
} from "./data/game-data-json";
import type { PlayerPokemon } from "./state/gameStateStore";

export function createStarterPlayerPokemon(
  starter: StarterPokemon,
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
    name: starter.displayName,
    level,
    ...(gender ? { gender } : {}),
    individualValues,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    status: "normal",
    moves: createPlayerPokemonMovesForLevel(starter.speciesId, level),
  };
}

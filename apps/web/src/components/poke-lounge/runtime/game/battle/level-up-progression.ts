import type { PlayerPokemon, PlayerPokemonMove } from "../state/gameStateStore";
import type { BattleMove, BattlePokemon } from "./battleTypes";
import { planLevelUpBattleMoves, planLevelUpPlayerMoves } from "./levelUpMoves";
import {
  applyLevelUpEvolution,
  applyPlayerLevelUpEvolution,
  type PokemonEvolutionTable,
} from "./pokemon-evolution";
import type { RomPersonalRecordCollection, RomRefinedMoveCollection } from "./wildBattleFactory";

export interface PendingBattleMoveLearning {
  pokemonName: string;
  newMove: BattleMove;
}

export interface PlanLevelUpBattleProgressionResult {
  pokemon: BattlePokemon;
  pendingMoveLearnings: PendingBattleMoveLearning[];
  messages: string[];
  evolved: boolean;
}

export interface PlanLevelUpPlayerProgressionResult<
  TPokemon extends PlayerPokemon = PlayerPokemon,
> {
  pokemon: TPokemon;
  pendingMoveReplacements: PlayerPokemonMove[];
  messages: string[];
  evolved: boolean;
}

export function planLevelUpBattleProgression({
  evolutionTable,
  moveRecords,
  personalRecords,
  pokemon,
  previousLevel,
}: {
  evolutionTable: PokemonEvolutionTable;
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  pokemon: BattlePokemon;
  previousLevel: number;
}): PlanLevelUpBattleProgressionResult {
  let nextPokemon = pokemon;
  const pendingMoveLearnings: PendingBattleMoveLearning[] = [];
  const messages: string[] = [];
  const knownMoveIds = new Set(pokemon.moves.map(move => move.id));
  let evolved = false;

  for (let currentLevel = previousLevel + 1; currentLevel <= pokemon.level; currentLevel += 1) {
    const processedSpeciesIds = new Set<number>();

    while (!processedSpeciesIds.has(nextPokemon.speciesId)) {
      processedSpeciesIds.add(nextPokemon.speciesId);

      const moveLearningResult = planLevelUpBattleMoves({
        currentLevel,
        pokemon: nextPokemon,
        previousLevel: currentLevel - 1,
        moveRecords,
      });
      nextPokemon = moveLearningResult.pokemon;
      nextPokemon.moves.forEach(move => knownMoveIds.add(move.id));
      messages.push(...moveLearningResult.messages);

      moveLearningResult.pendingMoves.forEach(move => {
        if (knownMoveIds.has(move.id)) {
          return;
        }

        knownMoveIds.add(move.id);
        pendingMoveLearnings.push({
          pokemonName: nextPokemon.name,
          newMove: move,
        });
      });

      const evolutionResult = applyLevelUpEvolution({
        currentLevel,
        evolutionTable,
        personalRecords,
        pokemon: nextPokemon,
        previousLevel: currentLevel - 1,
      });

      if (!evolutionResult.evolved) {
        break;
      }

      evolved = true;
      nextPokemon = evolutionResult.pokemon;
      messages.push(...evolutionResult.messages);
    }
  }

  return {
    pokemon: nextPokemon,
    pendingMoveLearnings,
    messages,
    evolved,
  };
}

export function planLevelUpPlayerProgression<TPokemon extends PlayerPokemon>({
  pokemon,
  pokemonData,
  previousLevel,
}: {
  pokemon: TPokemon;
  pokemonData: unknown;
  previousLevel: number;
}): PlanLevelUpPlayerProgressionResult<TPokemon> {
  let nextPokemon = pokemon;
  const pendingMoveReplacements: PlayerPokemonMove[] = [];
  const messages: string[] = [];
  const knownMoveIds = new Set((pokemon.moves ?? []).map(move => move.id));
  let evolved = false;

  for (let currentLevel = previousLevel + 1; currentLevel <= pokemon.level; currentLevel += 1) {
    const processedSpeciesIds = new Set<number>();

    while (!processedSpeciesIds.has(nextPokemon.speciesId)) {
      processedSpeciesIds.add(nextPokemon.speciesId);

      const moveLearningResult = planLevelUpPlayerMoves({
        currentLevel,
        pokemon: nextPokemon,
        previousLevel: currentLevel - 1,
      });
      nextPokemon = moveLearningResult.pokemon;
      nextPokemon.moves?.forEach(move => knownMoveIds.add(move.id));
      messages.push(...moveLearningResult.messages);

      moveLearningResult.pendingMoves.forEach(move => {
        if (knownMoveIds.has(move.id)) {
          return;
        }

        knownMoveIds.add(move.id);
        pendingMoveReplacements.push(move);
      });

      const evolutionResult = applyPlayerLevelUpEvolution({
        currentLevel,
        pokemon: nextPokemon,
        pokemonData,
        previousLevel: currentLevel - 1,
      });

      if (!evolutionResult.evolved) {
        break;
      }

      evolved = true;
      nextPokemon = evolutionResult.pokemon;
      messages.push(...evolutionResult.messages);
    }
  }

  return {
    pokemon: nextPokemon,
    pendingMoveReplacements,
    messages,
    evolved,
  };
}

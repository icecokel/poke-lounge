import type { PlayerPokemon, PlayerPokemonMove } from "../state/game-state-store";
import { isCompetitiveMoveEffectSelectable } from "@poke-lounge/battle/competitive-ruleset-config";
import {
  getRuntimeLevelUpMoveTable,
  getRuntimeMoveName,
  getRuntimePokemonMoveSummary,
} from "../data/game-data-json";
import { normalizeRomMoveRecord, type RuntimeRomMoveRecord } from "./battle-rom-data";
import type { BattleMove, BattlePokemon } from "./battle-types";
import type { RomRefinedMoveCollection } from "./wild-battle-factory";

export const MAX_POKEMON_MOVE_COUNT = 4;

export interface LevelUpMoveDefinition {
  level: number;
  moveId: number;
  name: string;
}

export type LevelUpMoveChange<TMove> =
  | {
      kind: "learned";
      move: TMove;
    }
  | {
      kind: "replaced";
      move: TMove;
      replacedMove: TMove;
    };

export interface ApplyLevelUpMovesResult<TPokemon, TMove> {
  pokemon: TPokemon;
  changes: Array<LevelUpMoveChange<TMove>>;
  messages: string[];
}

export interface PlanLevelUpBattleMovesResult {
  pokemon: BattlePokemon;
  pendingMoves: BattleMove[];
  messages: string[];
}

export interface PlanLevelUpPlayerMovesResult<TPokemon extends PlayerPokemon = PlayerPokemon> {
  pokemon: TPokemon;
  pendingMoves: PlayerPokemonMove[];
  messages: string[];
}

interface ApplyMoveListLearningInput<TMove extends { id: number; name: string }> {
  pokemonName: string;
  moves: TMove[];
  moveDefinitions: LevelUpMoveDefinition[];
  createMove(moveId: number): TMove;
}

export function getLevelUpMovesForSpecies(
  speciesId: number,
  previousLevel: number,
  currentLevel: number,
): LevelUpMoveDefinition[] {
  if (currentLevel <= previousLevel) {
    return [];
  }

  const levelUpMoveTable = getRuntimeLevelUpMoveTable();

  return (levelUpMoveTable[speciesId] ?? [])
    .filter(function filterItem(move) {
      return move.level > previousLevel && move.level <= currentLevel;
    })
    .map(function mapItem(move) {
      return moveAtLevel(move.level, move.moveId);
    });
}

export function getMoveIdsForSpeciesAtLevel(speciesId: number, level: number): number[] {
  const uniqueMoveIds: number[] = [];

  for (const move of getLevelUpMovesForSpecies(speciesId, 0, level)) {
    const existingIndex = uniqueMoveIds.indexOf(move.moveId);

    if (existingIndex >= 0) {
      uniqueMoveIds.splice(existingIndex, 1);
    }

    uniqueMoveIds.push(move.moveId);
  }

  return uniqueMoveIds.slice(-MAX_POKEMON_MOVE_COUNT);
}

export function createPlayerPokemonMovesForLevel(
  speciesId: number,
  level: number,
): PlayerPokemonMove[] {
  return getMoveIdsForSpeciesAtLevel(speciesId, level).map(createPlayerPokemonMoveFromRuntimeData);
}

export function createBattleMoveFromRom(
  moveId: number,
  moveRecords: RomRefinedMoveCollection,
): BattleMove {
  const normalized = normalizeRomMoveRecord(
    findMoveRecord(moveRecords, moveId),
    getRuntimeMoveName(moveId),
  );

  const move: BattleMove = {
    id: normalized.id,
    name: normalized.name,
    pp: normalized.pp,
    maxPp: normalized.maxPp,
    type: normalized.typeName,
    typeId: normalized.typeId,
    category: normalized.category,
    effectCode: normalized.effectCode,
    effectChance: normalized.effectChance,
    priority: normalized.priority,
    accuracy: normalized.accuracy,
    power: normalized.power,
  };

  return !isCompetitiveMoveEffectSelectable(move)
    ? {
        ...move,
        competitiveEffectSupport: "unsupported-primary",
      }
    : move;
}

export function createPlayerPokemonMoveFromRom(
  moveId: number,
  moveRecords: RomRefinedMoveCollection,
): PlayerPokemonMove {
  const move = createBattleMoveFromRom(moveId, moveRecords);

  return {
    id: move.id,
    name: move.name,
    pp: move.pp,
    maxPp: move.maxPp,
  };
}

export function applyLevelUpBattleMoves({
  pokemon,
  previousLevel,
  moveRecords,
}: {
  pokemon: BattlePokemon;
  previousLevel: number;
  moveRecords: RomRefinedMoveCollection;
}): ApplyLevelUpMovesResult<BattlePokemon, BattleMove> {
  const learning = applyMoveListLearning({
    pokemonName: pokemon.name,
    moves: pokemon.moves,
    moveDefinitions: getLevelUpMovesForSpecies(pokemon.speciesId, previousLevel, pokemon.level),
    createMove: moveId => createBattleMoveFromRom(moveId, moveRecords),
  });

  return {
    pokemon: {
      ...pokemon,
      moves: learning.moves,
    },
    changes: learning.changes,
    messages: learning.messages,
  };
}

export function planLevelUpBattleMoves({
  currentLevel,
  pokemon,
  previousLevel,
  moveRecords,
}: {
  currentLevel?: number;
  pokemon: BattlePokemon;
  previousLevel: number;
  moveRecords: RomRefinedMoveCollection;
}): PlanLevelUpBattleMovesResult {
  const planning = planMoveListLearning({
    pokemonName: pokemon.name,
    moves: pokemon.moves,
    moveDefinitions: getLevelUpMovesForSpecies(
      pokemon.speciesId,
      previousLevel,
      currentLevel ?? pokemon.level,
    ),
    createMove: moveId => createBattleMoveFromRom(moveId, moveRecords),
  });

  return {
    pokemon: {
      ...pokemon,
      moves: planning.moves,
    },
    pendingMoves: planning.pendingMoves,
    messages: planning.messages,
  };
}

export function applyLevelUpPlayerMoves({
  pokemon,
  previousLevel,
  moveRecords,
}: {
  pokemon: PlayerPokemon;
  previousLevel: number;
  moveRecords: RomRefinedMoveCollection;
}): ApplyLevelUpMovesResult<PlayerPokemon, PlayerPokemonMove> {
  const learning = applyMoveListLearning({
    pokemonName: pokemon.name,
    moves: pokemon.moves ?? [],
    moveDefinitions: getLevelUpMovesForSpecies(pokemon.speciesId, previousLevel, pokemon.level),
    createMove: moveId => createPlayerPokemonMoveFromRom(moveId, moveRecords),
  });

  return {
    pokemon: {
      ...pokemon,
      moves: learning.moves,
    },
    changes: learning.changes,
    messages: learning.messages,
  };
}

export function planLevelUpPlayerMoves<TPokemon extends PlayerPokemon>({
  currentLevel,
  pokemon,
  previousLevel,
}: {
  currentLevel?: number;
  pokemon: TPokemon;
  previousLevel: number;
}): PlanLevelUpPlayerMovesResult<TPokemon> {
  const planning = planMoveListLearning({
    pokemonName: pokemon.name,
    moves: pokemon.moves ?? [],
    moveDefinitions: getLevelUpMovesForSpecies(
      pokemon.speciesId,
      previousLevel,
      currentLevel ?? pokemon.level,
    ),
    createMove: createPlayerPokemonMoveFromRuntimeData,
  });

  return {
    pokemon: {
      ...pokemon,
      moves: planning.moves,
    },
    pendingMoves: planning.pendingMoves,
    messages: planning.messages,
  };
}

function applyMoveListLearning<TMove extends { id: number; name: string }>({
  pokemonName,
  moves: initialMoves,
  moveDefinitions,
  createMove,
}: ApplyMoveListLearningInput<TMove>): {
  moves: TMove[];
  changes: Array<LevelUpMoveChange<TMove>>;
  messages: string[];
} {
  let moves = initialMoves.slice(0, MAX_POKEMON_MOVE_COUNT);
  const changes: Array<LevelUpMoveChange<TMove>> = [];
  const messages: string[] = [];

  for (const definition of moveDefinitions) {
    if (
      moves.some(function testItem(move) {
        return move.id === definition.moveId;
      })
    ) {
      continue;
    }

    const move = createMove(definition.moveId);

    if (moves.length < MAX_POKEMON_MOVE_COUNT) {
      moves = [...moves, move];
      changes.push({ kind: "learned", move });
      messages.push(formatLearnedMoveMessage(pokemonName, move.name));
      continue;
    }

    const [replacedMove, ...remainingMoves] = moves;

    if (!replacedMove) {
      moves = [move];
      changes.push({ kind: "learned", move });
      messages.push(formatLearnedMoveMessage(pokemonName, move.name));
      continue;
    }

    moves = [...remainingMoves, move];
    changes.push({ kind: "replaced", move, replacedMove });
    messages.push(formatReplacedMoveMessage(pokemonName, replacedMove.name, move.name));
  }

  return {
    moves,
    changes,
    messages,
  };
}

function planMoveListLearning<TMove extends { id: number; name: string }>({
  pokemonName,
  moves: initialMoves,
  moveDefinitions,
  createMove,
}: ApplyMoveListLearningInput<TMove>): {
  moves: TMove[];
  pendingMoves: TMove[];
  messages: string[];
} {
  let moves = initialMoves.slice(0, MAX_POKEMON_MOVE_COUNT);
  const pendingMoves: TMove[] = [];
  const messages: string[] = [];

  for (const definition of moveDefinitions) {
    if (
      moves.some(function testItem(move) {
        return move.id === definition.moveId;
      }) ||
      pendingMoves.some(function testItem(move) {
        return move.id === definition.moveId;
      })
    ) {
      continue;
    }

    const move = createMove(definition.moveId);

    if (moves.length < MAX_POKEMON_MOVE_COUNT) {
      moves = [...moves, move];
      messages.push(formatLearnedMoveMessage(pokemonName, move.name));
      continue;
    }

    pendingMoves.push(move);
  }

  return {
    moves,
    pendingMoves,
    messages,
  };
}

function moveAtLevel(level: number, moveId: number): LevelUpMoveDefinition {
  return {
    level,
    moveId,
    name: getRuntimeMoveName(moveId),
  };
}

function findMoveRecord(
  collection: RomRefinedMoveCollection,
  moveId: number,
): RuntimeRomMoveRecord {
  const { moves } = collection;
  const record = Array.isArray(moves)
    ? moves.find(function findItem(candidate) {
        return ("id" in candidate ? candidate.id : candidate.index) === moveId;
      })
    : moves[String(moveId)];

  if (!record) {
    throw new Error(`Missing ROM move record for move ${moveId}`);
  }

  return record;
}

function createPlayerPokemonMoveFromRuntimeData(moveId: number): PlayerPokemonMove {
  const move = getRuntimePokemonMoveSummary(moveId);

  if (!move) {
    throw new Error(`Missing runtime move record for move ${moveId}`);
  }

  return {
    id: move.id,
    name: move.name,
    pp: move.pp,
    maxPp: move.pp,
  };
}

function formatLearnedMoveMessage(pokemonName: string, moveName: string): string {
  return `${pokemonName}${topicParticle(pokemonName)} ${moveName}${objectParticle(moveName)} 배웠다!`;
}

export function formatReplacedMoveMessage(
  pokemonName: string,
  replacedMoveName: string,
  moveName: string,
): string {
  return `${pokemonName}${topicParticle(pokemonName)} ${replacedMoveName}${objectParticle(replacedMoveName)} 잊고 ${moveName}${objectParticle(moveName)} 배웠다!`;
}

export function formatSkippedMoveMessage(pokemonName: string, moveName: string): string {
  return `${pokemonName}${topicParticle(pokemonName)} ${moveName}${objectParticle(moveName)} 배우지 않았다!`;
}

function topicParticle(value: string): "은" | "는" {
  return hasFinalConsonant(value) ? "은" : "는";
}

function objectParticle(value: string): "을" | "를" {
  return hasFinalConsonant(value) ? "을" : "를";
}

function hasFinalConsonant(value: string): boolean {
  const lastCharacter = value[value.length - 1];

  if (!lastCharacter) {
    return false;
  }

  const hangulOffset = lastCharacter.charCodeAt(0) - 0xac00;

  if (hangulOffset < 0 || hangulOffset > 11171) {
    return false;
  }

  return hangulOffset % 28 !== 0;
}

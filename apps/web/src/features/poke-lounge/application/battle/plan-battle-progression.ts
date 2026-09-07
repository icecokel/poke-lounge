import { BATTLE_END_CONFIRM_MESSAGE } from "@poke-lounge/battle/adventure/battle/battle-logic";
import type {
  BattleMove,
  BattlePartySlot,
  BattlePokemon,
  BattleScreenState,
} from "@poke-lounge/battle/adventure/battle/battle-types";
import {
  planLevelUpBattleProgression,
  type LearnedBattleMove,
  type PendingBattleMoveLearning,
} from "@poke-lounge/battle/adventure/battle/level-up-progression";
import type { PokemonEvolutionTable } from "@poke-lounge/battle/adventure/battle/pokemon-evolution";
import type {
  RomPersonalRecordCollection,
  RomRefinedMoveCollection,
} from "@poke-lounge/battle/adventure/battle/wild-battle-factory";
import type { PlayerPokemon } from "@poke-lounge/battle/adventure/player/pokemon-types";
export interface PendingMoveLearning {
  slotIndex: number;
  pokemonName: string;
  newMove: BattleMove;
}
export interface BattleEvolutionTransition {
  fromPokemon: BattlePokemon;
  toPokemon: BattlePokemon;
}
export interface PostBattleProgression {
  state: BattleScreenState;
  pendingMoveLearnings: PendingMoveLearning[];
  learnedMoves: LearnedBattleMove[];
  evolutionTransitions: BattleEvolutionTransition[];
}
export function planPostBattleProgression({
  state,
  localPlayer,
  moveRecords,
  personalRecords,
  evolutionTable,
}: {
  state: BattleScreenState;
  localPlayer: {
    playerId: string;
    party: Array<{ slotIndex: number; pokemon: PlayerPokemon | null }>;
  };
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  evolutionTable: PokemonEvolutionTable;
}): PostBattleProgression {
  const pendingMoveLearnings: PendingMoveLearning[] = [],
    learnedMoves: LearnedBattleMove[] = [];
  if (
    state.battleKind !== "wild" ||
    state.result?.reason !== "faint" ||
    (state.result.experienceGained ?? 0) <= 0 ||
    state.result.winnerPlayerId !== localPlayer.playerId
  )
    return { state, pendingMoveLearnings, learnedMoves, evolutionTransitions: [] };
  const previousPokemonBySlotIndex = new Map(
    localPlayer.party
      .filter(function filterItem(slot) {
        return slot.pokemon;
      })
      .map(function mapItem(slot) {
        return [
          slot.slotIndex,
          {
            level: slot.pokemon?.level ?? 1,
            speciesId: slot.pokemon?.speciesId ?? 0,
          },
        ] as const;
      }),
  );
  const learningMessages: string[] = [];
  let activePokemon = state.player.pokemon;
  let activeSlotSeen = false;
  const evolutionTransitions: BattleEvolutionTransition[] = [];
  const finish = (state: BattleScreenState): PostBattleProgression => ({
    state,
    pendingMoveLearnings,
    learnedMoves,
    evolutionTransitions,
  });

  const party = state.player.party.map(function mapItem(slot: BattlePartySlot): BattlePartySlot {
    if (!slot.pokemon) {
      return slot;
    }

    if (slot.slotIndex === state.player.activePartySlotIndex) {
      activeSlotSeen = true;
    }

    const previousLevel = resolvePreviousBattleLevel({
      activePartySlotIndex: state.player.activePartySlotIndex,
      fallbackLevelsGained: state.result?.levelsGained ?? 0,
      pokemon: slot.pokemon,
      previousPokemon: previousPokemonBySlotIndex.get(slot.slotIndex),
      slotIndex: slot.slotIndex,
    });

    if (previousLevel >= slot.pokemon.level) {
      return slot;
    }

    const progression = planLevelUpBattleProgression({
      evolutionTable,
      moveRecords,
      personalRecords,
      pokemon: slot.pokemon,
      previousLevel,
    });

    if (progression.messages.length === 0 && progression.pendingMoveLearnings.length === 0) {
      return slot;
    }

    for (const learned of progression.learnedMoves) {
      learnedMoves.push(learned);
    }
    learningMessages.push(...progression.messages);
    progression.pendingMoveLearnings.forEach(function visitItem({
      newMove,
    }: PendingBattleMoveLearning): void {
      pendingMoveLearnings.push({
        slotIndex: slot.slotIndex,
        pokemonName: progression.pokemon.name,
        newMove,
      });
    });

    if (slot.slotIndex === state.player.activePartySlotIndex) {
      activePokemon = progression.pokemon;
    }
    if (progression.evolved && slot.pokemon.speciesId !== progression.pokemon.speciesId) {
      evolutionTransitions.push({ fromPokemon: slot.pokemon, toPokemon: progression.pokemon });
    }

    return {
      ...slot,
      pokemon: progression.pokemon,
    };
  });

  if (!activeSlotSeen) {
    const previousLevel = Math.max(
      1,
      state.player.pokemon.level - (state.result.levelsGained ?? 0),
    );
    const progression = planLevelUpBattleProgression({
      evolutionTable,
      moveRecords,
      personalRecords,
      pokemon: state.player.pokemon,
      previousLevel,
    });

    for (const learned of progression.learnedMoves) {
      learnedMoves.push(learned);
    }
    if (progression.messages.length > 0) {
      activePokemon = progression.pokemon;
      learningMessages.push(...progression.messages);
    }
    if (progression.evolved && state.player.pokemon.speciesId !== progression.pokemon.speciesId) {
      evolutionTransitions.push({
        fromPokemon: state.player.pokemon,
        toPokemon: progression.pokemon,
      });
    }

    progression.pendingMoveLearnings.forEach(function visitItem({
      newMove,
    }: PendingBattleMoveLearning): void {
      pendingMoveLearnings.push({
        slotIndex: state.player.activePartySlotIndex,
        pokemonName: progression.pokemon.name,
        newMove,
      });
    });
  }

  if (learningMessages.length === 0 && pendingMoveLearnings.length === 0) {
    return finish(state);
  }

  const nextState = {
    ...state,
    player: {
      ...state.player,
      pokemon: activePokemon,
      party,
    },
    messageQueue: insertMessagesBeforeBattleEndConfirm(state.messageQueue, learningMessages),
  };

  if (pendingMoveLearnings.length > 0) {
    return finish({
      ...nextState,
      phase: "move-replace-select" as const,
      messageQueue: removeBattleEndConfirmMessage(nextState.messageQueue),
    });
  }

  return finish(nextState);
}
function resolvePreviousBattleLevel({
  activePartySlotIndex,
  fallbackLevelsGained,
  pokemon,
  previousPokemon,
  slotIndex,
}: {
  activePartySlotIndex: number;
  fallbackLevelsGained: number;
  pokemon: BattlePokemon;
  previousPokemon?: Pick<PlayerPokemon, "level" | "speciesId">;
  slotIndex: number;
}): number {
  if (previousPokemon?.speciesId === pokemon.speciesId && Number.isFinite(previousPokemon.level)) {
    return previousPokemon.level;
  }

  if (slotIndex === activePartySlotIndex && fallbackLevelsGained > 0) {
    return Math.max(1, pokemon.level - fallbackLevelsGained);
  }

  return pokemon.level;
}
function insertMessagesBeforeBattleEndConfirm(
  messageQueue: string[],
  messages: string[],
): string[] {
  const confirmMessageIndex = messageQueue.lastIndexOf(BATTLE_END_CONFIRM_MESSAGE);

  if (confirmMessageIndex === -1) {
    return [...messageQueue, ...messages];
  }

  return [
    ...messageQueue.slice(0, confirmMessageIndex),
    ...messages,
    ...messageQueue.slice(confirmMessageIndex),
  ];
}
function removeBattleEndConfirmMessage(messages: string[]): string[] {
  return messages.filter(function filterItem(message) {
    return message !== BATTLE_END_CONFIRM_MESSAGE;
  });
}

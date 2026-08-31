import type { BattleParticipant, BattlePokemon } from "./battle-types";
import type {
  AddPokemonToPartyResult,
  GameStateStore,
  LocalPlayerState,
  PlayerPokemon,
} from "../state/game-state-store";

interface PersistBattlePartyToWorldInput {
  completedCompetitiveBattle: boolean;
  gameStateStore: Pick<
    GameStateStore,
    "setActivePartySlot" | "updateActivePokemon" | "updatePokemonInPartySlot"
  >;
  localPlayer: Pick<LocalPlayerState, "activePartySlotIndex" | "party">;
  participant: Pick<BattleParticipant, "activePartySlotIndex" | "party" | "pokemon">;
}

interface PersistCapturedPokemonToWorldInput {
  capturedPokemon: BattlePokemon | null | undefined;
  gameStateStore: Pick<GameStateStore, "addPokemonToParty">;
}

export function persistBattlePartyToWorld({
  completedCompetitiveBattle,
  gameStateStore,
  localPlayer,
  participant,
}: PersistBattlePartyToWorldInput): void {
  if (completedCompetitiveBattle) {
    return;
  }

  if (localPlayer.party.length === 0) {
    gameStateStore.updateActivePokemon(toPlayerPokemon(participant.pokemon));
    return;
  }

  participant.party.forEach(function visitItem(slot) {
    if (slot.pokemon) {
      gameStateStore.updatePokemonInPartySlot(slot.slotIndex, toPlayerPokemon(slot.pokemon));
    }
  });

  const activePartySlot = participant.party.find(function findItem(slot) {
    return slot.slotIndex === participant.activePartySlotIndex;
  });
  if (
    localPlayer.activePartySlotIndex !== participant.activePartySlotIndex &&
    activePartySlot?.pokemon?.status !== "fainted"
  ) {
    gameStateStore.setActivePartySlot(participant.activePartySlotIndex);
  }
}

export function persistCapturedPokemonToWorld({
  capturedPokemon,
  gameStateStore,
}: PersistCapturedPokemonToWorldInput): AddPokemonToPartyResult | null {
  if (!capturedPokemon) {
    return null;
  }

  return gameStateStore.addPokemonToParty(toPlayerPokemon(capturedPokemon));
}

export function toPlayerPokemon(pokemon: BattlePokemon): PlayerPokemon {
  return {
    speciesId: pokemon.speciesId,
    name: pokemon.name,
    level: pokemon.level,
    gender: pokemon.gender,
    maxHp: pokemon.maxHp,
    currentHp: pokemon.currentHp,
    attack: pokemon.attack,
    defense: pokemon.defense,
    speed: pokemon.speed,
    experience: pokemon.experience,
    growthRate: pokemon.growthRate,
    status: pokemon.status,
    individualValues: { ...pokemon.individualValues },
    moves: pokemon.moves.map(function mapItem(move) {
      return {
        id: move.id,
        name: move.name,
        pp: move.pp,
        maxPp: move.maxPp,
      };
    }),
  };
}

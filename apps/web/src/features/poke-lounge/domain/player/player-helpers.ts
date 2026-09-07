import { healPokemon } from "@poke-lounge/battle/adventure/player/heal-pokemon";
import {
  PLAYER_PARTY_SLOT_COUNT,
  type PlayerPokemonSlot,
} from "@poke-lounge/battle/adventure/player/player-types";
import type { LocalPlayerState, PlayerPokemon } from "../../contracts/game-state";
export function normalizePokeDollars(pokeDollars: number): number {
  if (!Number.isFinite(pokeDollars)) {
    return 0;
  }

  return Math.max(0, Math.floor(pokeDollars));
}

export function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

export function isValidPartySlotIndex(slotIndex: number): boolean {
  return (
    Number.isFinite(slotIndex) &&
    Number.isInteger(slotIndex) &&
    slotIndex >= 0 &&
    slotIndex < PLAYER_PARTY_SLOT_COUNT
  );
}

export function isValidMoveIndex(moveIndex: number): boolean {
  return (
    Number.isFinite(moveIndex) && Number.isInteger(moveIndex) && moveIndex >= 0 && moveIndex < 4
  );
}

export function getPartySlot(
  localPlayer: LocalPlayerState,
  slotIndex: number,
): PlayerPokemonSlot<PlayerPokemon> | undefined {
  return localPlayer.party.find(function findItem(slot) {
    return slot.slotIndex === slotIndex;
  });
}

export function compactPartySlots(
  party: Array<PlayerPokemonSlot<PlayerPokemon>>,
): Array<PlayerPokemonSlot<PlayerPokemon>> {
  return party
    .filter(function filterItem(slot): slot is PlayerPokemonSlot<PlayerPokemon> & {
      pokemon: PlayerPokemon;
    } {
      return Boolean(slot.pokemon);
    })
    .slice(0, PLAYER_PARTY_SLOT_COUNT)
    .map(function mapItem(slot, slotIndex) {
      return {
        ...slot,
        slotIndex,
      };
    });
}

export function normalizeBoxIndex(boxIndex: number): number | null {
  if (!Number.isFinite(boxIndex) || !Number.isInteger(boxIndex) || boxIndex < 0) {
    return null;
  }

  return boxIndex;
}

export function healLocalPlayer(localPlayer: LocalPlayerState): LocalPlayerState {
  return {
    ...localPlayer,
    party: localPlayer.party.map(function mapItem(slot) {
      return {
        ...slot,
        pokemon: slot.pokemon ? healPokemon(slot.pokemon) : slot.pokemon,
      };
    }),
  };
}

export function setActivePartyPokemon(
  localPlayer: LocalPlayerState,
  pokemon: PlayerPokemon,
): LocalPlayerState {
  if (localPlayer.party.length === 0) {
    return {
      ...localPlayer,
      activePartySlotIndex: 0,
      party: [
        {
          slotIndex: 0,
          pokemon,
        },
      ],
    };
  }

  if (localPlayer.party.length > PLAYER_PARTY_SLOT_COUNT) {
    throw new Error(`Local player party exceeds ${PLAYER_PARTY_SLOT_COUNT} slots`);
  }

  return {
    ...localPlayer,
    party: localPlayer.party.map(function mapItem(slot) {
      return slot.slotIndex === localPlayer.activePartySlotIndex ? { ...slot, pokemon } : slot;
    }),
  };
}

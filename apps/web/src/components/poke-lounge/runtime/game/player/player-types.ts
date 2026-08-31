export const PLAYER_PARTY_SLOT_COUNT = 6;

export type PlayerFacing = "front" | "back" | "left" | "right";

export interface PlayerPosition {
  mapKey: string;
  x: number;
  y: number;
  facing: PlayerFacing;
}

export interface PlayerPokemonSlot<TPokemon> {
  slotIndex: number;
  pokemon: TPokemon | null;
}

export interface Player<TPokemon> {
  id: string;
  displayName: string;
  party: Array<PlayerPokemonSlot<TPokemon>>;
  activePartySlotIndex: number;
  position: PlayerPosition;
}

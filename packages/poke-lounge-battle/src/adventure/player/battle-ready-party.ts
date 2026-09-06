import type { PlayerPokemonSlot } from "./player-types";

interface PartyHealth {
  currentHp?: number;
  status?: string;
}
/** Missing HP in legacy saves is initialized from ROM stats; explicit zero never is. */
export function isPartyPokemonBattleReady(pokemon: PartyHealth | null | undefined): boolean {
  return Boolean(
    pokemon &&
    pokemon.status !== "fainted" &&
    (pokemon.currentHp === undefined ||
      (Number.isFinite(pokemon.currentHp) && pokemon.currentHp > 0)),
  );
}

/** Keep a healthy lead, otherwise select a living reserve without healing or reordering the party. */
export function findBattleReadyPartySlot<T extends PartyHealth>(
  party: ReadonlyArray<PlayerPokemonSlot<T>>,
  preferredSlotIndex?: number,
): PlayerPokemonSlot<T> | null {
  const preferred = party.find(slot => slot.slotIndex === preferredSlotIndex);
  if (isPartyPokemonBattleReady(preferred?.pokemon)) return preferred!;
  return party.find(slot => isPartyPokemonBattleReady(slot.pokemon)) ?? null;
}

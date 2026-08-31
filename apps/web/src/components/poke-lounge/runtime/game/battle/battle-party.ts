import { PLAYER_PARTY_SLOT_COUNT } from "../player/player-types";
import type { BattleParticipant, BattlePartySlot, BattlePokemon } from "./battle-types";

export const BATTLE_PARTY_SLOT_COUNT = PLAYER_PARTY_SLOT_COUNT;

export function createBattleParty(
  activePokemon: BattlePokemon,
  activePartySlotIndex = 0,
): BattlePartySlot[] {
  if (activePartySlotIndex < 0 || activePartySlotIndex >= BATTLE_PARTY_SLOT_COUNT) {
    throw new Error(`Invalid active party slot index ${activePartySlotIndex}`);
  }

  return Array.from({ length: BATTLE_PARTY_SLOT_COUNT }, function callback(_, slotIndex) {
    return {
      slotIndex,
      pokemon: slotIndex === activePartySlotIndex ? activePokemon : null,
    };
  });
}

export function syncActivePartyPokemon<TParticipant extends BattleParticipant>(
  participant: TParticipant,
  pokemon: BattlePokemon,
): TParticipant {
  return {
    ...participant,
    pokemon,
    party: participant.party.map(function mapItem(slot) {
      return slot.slotIndex === participant.activePartySlotIndex ? { ...slot, pokemon } : slot;
    }),
  };
}

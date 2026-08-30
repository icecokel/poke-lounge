import type { CompetitivePartyInput } from "@poke-lounge/battle";
import type { PlayerSnapshot } from "./localPreviewRoom";

export function createCompetitivePartySnapshot(snapshot: PlayerSnapshot): CompetitivePartyInput {
  if (snapshot.activePartySlotIndex === undefined) {
    throw new Error("Competitive party snapshot requires an active party slot");
  }

  return {
    version: 2,
    activeSlotIndex: snapshot.activePartySlotIndex,
    members: (snapshot.party ?? []).flatMap(slot => {
      const pokemon = slot.pokemon;
      if (!pokemon) {
        return [];
      }
      if (
        pokemon.currentHp === undefined ||
        pokemon.status === undefined ||
        pokemon.individualValues === undefined ||
        pokemon.moves === undefined
      ) {
        throw new Error("Competitive party member is missing persisted battle state");
      }

      return [
        {
          slotIndex: slot.slotIndex,
          speciesId: pokemon.speciesId,
          level: pokemon.level,
          currentHp: pokemon.currentHp,
          status: pokemon.status,
          individualValues: { ...pokemon.individualValues },
          moves: pokemon.moves.map(move => ({
            moveId: move.id,
            pp: move.pp,
          })),
        },
      ];
    }),
  };
}

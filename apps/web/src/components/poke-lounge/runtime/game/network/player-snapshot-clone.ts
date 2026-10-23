import type { PlayerSnapshot } from "./local-preview-room";

export function clonePlayerSnapshot(snapshot: PlayerSnapshot): PlayerSnapshot {
  return {
    ...snapshot,
    activePokemon: snapshot.activePokemon ? { ...snapshot.activePokemon } : undefined,
    party: cloneSnapshotParty(snapshot.party),
  };
}

export function cloneSnapshotParty(
  party: PlayerSnapshot["party"] | undefined,
): PlayerSnapshot["party"] | undefined {
  return party?.map(function mapItem(slot) {
    return {
      slotIndex: slot.slotIndex,
      pokemon: slot.pokemon
        ? {
            ...slot.pokemon,
            moves: slot.pokemon.moves?.map(function mapItem(move) {
              return { ...move };
            }),
          }
        : null,
    };
  });
}

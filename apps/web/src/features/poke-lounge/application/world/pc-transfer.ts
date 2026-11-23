import type { GameStateStore } from "../../contracts/game-state";
export type PcTransferPort = Pick<
  GameStateStore,
  | "getCurrentLocalPlayer"
  | "movePartyPokemonToBox"
  | "moveBoxPokemonToParty"
  | "swapPartyPokemonWithBox"
>;
export type PcTransferResult =
  | { kind: "deposited"; name: string; boxIndex: number; slotIndex: number }
  | { kind: "withdrawn"; name: string; boxIndex: number; slotIndex: number }
  | { kind: "swapped"; name: string }
  /** The party is full: the player must pick which party Pokémon goes to the box. */
  | { kind: "choose-party"; name: string; boxIndex: number }
  | {
      kind: "rejected";
      reason:
        | "last-pokemon"
        | "empty-party"
        | "empty-box"
        | "invalid-box"
        | "select-party"
        | "select-box"
        | "fainted-active-replacement";
    };
export function transferPcPokemon(
  store: PcTransferPort,
  selection: {
    focus: "party" | "box";
    partySlot: number;
    boxIndex: number;
    /** Box Pokémon waiting to be swapped into the chosen party slot. */
    swapBoxIndex?: number | null;
  },
): PcTransferResult {
  const player = store.getCurrentLocalPlayer();
  if (selection.focus === "party" && selection.swapBoxIndex != null) {
    const incoming = player.pokemonBox[selection.swapBoxIndex];
    if (!incoming) return { kind: "rejected", reason: "empty-box" };
    return swap(store, selection.partySlot, selection.swapBoxIndex, incoming.name);
  }
  if (selection.focus === "party") {
    const pokemon = player.party.find(p => p.slotIndex === selection.partySlot)?.pokemon;
    const result = store.movePartyPokemonToBox(selection.partySlot);
    return result.ok
      ? {
          kind: "deposited",
          name: pokemon?.name ?? "포켓몬",
          boxIndex: result.boxIndex,
          slotIndex: selection.partySlot,
        }
      : {
          kind: "rejected",
          reason: result.reason === "last-pokemon" ? "last-pokemon" : "empty-party",
        };
  }
  const pokemon = player.pokemonBox[selection.boxIndex];
  if (!pokemon) return { kind: "rejected", reason: "empty-box" };
  const result = store.moveBoxPokemonToParty(selection.boxIndex);
  if (result.ok)
    return {
      kind: "withdrawn",
      name: pokemon.name,
      slotIndex: result.slotIndex,
      boxIndex: Math.max(
        0,
        Math.min(selection.boxIndex, store.getCurrentLocalPlayer().pokemonBox.length - 1),
      ),
    };
  if (result.reason !== "party-full") return { kind: "rejected", reason: "invalid-box" };
  // Never swap silently: the remembered party slot is not visible while the box is focused.
  return { kind: "choose-party", name: pokemon.name, boxIndex: selection.boxIndex };
}

function swap(
  store: PcTransferPort,
  partySlot: number,
  boxIndex: number,
  name: string,
): PcTransferResult {
  const swapped = store.swapPartyPokemonWithBox(partySlot, boxIndex);
  if (swapped.ok) return { kind: "swapped", name };
  return {
    kind: "rejected",
    reason:
      swapped.reason === "empty-slot"
        ? "select-party"
        : swapped.reason === "fainted-active-replacement"
          ? "fainted-active-replacement"
          : "invalid-box",
  };
}

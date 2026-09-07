import { PLAYER_PARTY_SLOT_COUNT } from "@poke-lounge/battle/adventure/player/player-types";
import type {
  AddPokemonToPartyResult,
  MoveBoxPokemonToPartyResult,
  MovePartyPokemonToBoxResult,
  PlayerPokemon,
  PlayerPokemonMove,
  ReplacePokemonMoveResult,
  SetActivePartySlotResult,
  SwapPartyPokemonWithBoxResult,
  UpdatePokemonInPartySlotResult,
} from "../../contracts/game-state";

import type { LocalPlayerState } from "../../contracts/game-state";

import type { PlayerChange } from "../player/player-change";

import {
  compactPartySlots,
  getPartySlot,
  healLocalPlayer,
  isValidMoveIndex,
  isValidPartySlotIndex,
  normalizeBoxIndex,
  setActivePartyPokemon,
} from "../player/player-helpers";

export function healCurrentParty(localPlayer: LocalPlayerState): PlayerChange<void> {
  if (localPlayer.party.length === 0) {
    return {
      player: localPlayer,
      changed: false,
      result: undefined,
    };
  }
  return {
    player: healLocalPlayer(localPlayer),
    changed: true,
    result: undefined,
  };
}

export function setStarterPokemon(
  localPlayer: LocalPlayerState,
  pokemon: PlayerPokemon,
): PlayerChange<void> {
  return {
    player: setActivePartyPokemon(localPlayer, pokemon),
    changed: true,
    result: undefined,
  };
}

export function updateActivePokemon(
  localPlayer: LocalPlayerState,
  pokemon: PlayerPokemon,
): PlayerChange<void> {
  return {
    player: setActivePartyPokemon(localPlayer, pokemon),
    changed: true,
    result: undefined,
  };
}

export function addPokemonToParty(
  localPlayer: LocalPlayerState,
  pokemon: PlayerPokemon,
): PlayerChange<AddPokemonToPartyResult> {
  const occupiedSlotIndices = new Set(
    localPlayer.party.map(function mapItem(slot) {
      return slot.slotIndex;
    }),
  );
  const slotIndex = Array.from(
    { length: PLAYER_PARTY_SLOT_COUNT },
    function callback(_, candidateSlotIndex) {
      return candidateSlotIndex;
    },
  ).find(function findItem(candidateSlotIndex) {
    return !occupiedSlotIndices.has(candidateSlotIndex);
  });
  if (slotIndex === undefined) {
    const boxIndex = localPlayer.pokemonBox.length;
    return {
      player: {
        ...localPlayer,
        pokemonBox: [...localPlayer.pokemonBox, pokemon],
      },
      changed: true,
      result: { ok: true, destination: "box", boxIndex },
    };
  }
  return {
    player: {
      ...localPlayer,
      party: [
        ...localPlayer.party,
        {
          slotIndex,
          pokemon,
        },
      ].sort(function compareItems(left, right) {
        return left.slotIndex - right.slotIndex;
      }),
    },
    changed: true,
    result: { ok: true, destination: "party", slotIndex },
  };
}

export function movePartyPokemonToBox(
  localPlayer: LocalPlayerState,
  slotIndex: number,
): PlayerChange<MovePartyPokemonToBoxResult> {
  if (!isValidPartySlotIndex(slotIndex)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-slot" },
    };
  }
  const partySlot = getPartySlot(localPlayer, slotIndex);
  const pokemon = partySlot?.pokemon;
  if (!pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "empty-slot" },
    };
  }
  const occupiedSlots = localPlayer.party.filter(function filterItem(slot) {
    return slot.pokemon;
  });
  if (occupiedSlots.length <= 1) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "last-pokemon" },
    };
  }
  const nextBoxIndex = localPlayer.pokemonBox.length;
  const activePokemon = getPartySlot(localPlayer, localPlayer.activePartySlotIndex)?.pokemon;
  const nextParty = compactPartySlots(
    localPlayer.party.filter(function filterItem(slot) {
      return slot.slotIndex !== slotIndex;
    }),
  );
  const nextActiveSlotIndex =
    nextParty.find(function findItem(slot) {
      return slot.pokemon === activePokemon;
    })?.slotIndex ??
    nextParty[0]?.slotIndex ??
    0;
  return {
    player: {
      ...localPlayer,
      activePartySlotIndex: nextActiveSlotIndex,
      party: nextParty,
      pokemonBox: [...localPlayer.pokemonBox, pokemon],
    },
    changed: true,
    result: { ok: true, destination: "box", boxIndex: nextBoxIndex },
  };
}

export function moveBoxPokemonToParty(
  localPlayer: LocalPlayerState,
  boxIndex: number,
): PlayerChange<MoveBoxPokemonToPartyResult> {
  const normalizedBoxIndex = normalizeBoxIndex(boxIndex);
  const pokemon =
    normalizedBoxIndex === null ? undefined : localPlayer.pokemonBox[normalizedBoxIndex];
  if (!pokemon || normalizedBoxIndex === null) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-box-index" },
    };
  }
  const nextParty = compactPartySlots(localPlayer.party);
  if (nextParty.length >= PLAYER_PARTY_SLOT_COUNT) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "party-full" },
    };
  }
  const slotIndex = nextParty.length;
  const nextBox = localPlayer.pokemonBox.filter(function filterItem(_, index) {
    return index !== normalizedBoxIndex;
  });
  return {
    player: {
      ...localPlayer,
      party: [
        ...nextParty,
        {
          slotIndex,
          pokemon,
        },
      ],
      pokemonBox: nextBox,
    },
    changed: true,
    result: { ok: true, destination: "party", slotIndex },
  };
}

export function swapPartyPokemonWithBox(
  localPlayer: LocalPlayerState,
  slotIndex: number,
  boxIndex: number,
): PlayerChange<SwapPartyPokemonWithBoxResult> {
  if (!isValidPartySlotIndex(slotIndex)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-slot" },
    };
  }
  const normalizedBoxIndex = normalizeBoxIndex(boxIndex);
  const partySlot = getPartySlot(localPlayer, slotIndex);
  const partyPokemon = partySlot?.pokemon;
  const boxPokemon =
    normalizedBoxIndex === null ? undefined : localPlayer.pokemonBox[normalizedBoxIndex];
  if (!partyPokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "empty-slot" },
    };
  }
  if (!boxPokemon || normalizedBoxIndex === null) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-box-index" },
    };
  }
  if (
    slotIndex === localPlayer.activePartySlotIndex &&
    (boxPokemon.status === "fainted" ||
      (typeof boxPokemon.currentHp === "number" && boxPokemon.currentHp <= 0))
  ) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "fainted-active-replacement" },
    };
  }
  return {
    player: {
      ...localPlayer,
      party: localPlayer.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex ? { ...slot, pokemon: boxPokemon } : slot;
      }),
      pokemonBox: localPlayer.pokemonBox.map(function mapItem(pokemon, index) {
        return index === normalizedBoxIndex ? partyPokemon : pokemon;
      }),
    },
    changed: true,
    result: { ok: true },
  };
}

export function setActivePartySlot(
  localPlayer: LocalPlayerState,
  slotIndex: number,
): PlayerChange<SetActivePartySlotResult> {
  if (!isValidPartySlotIndex(slotIndex)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-slot" },
    };
  }
  const partySlot = getPartySlot(localPlayer, slotIndex);
  if (!partySlot?.pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "empty-slot" },
    };
  }
  if (partySlot.pokemon.status === "fainted") {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "fainted" },
    };
  }
  return {
    player: {
      ...localPlayer,
      activePartySlotIndex: slotIndex,
    },
    changed: true,
    result: { ok: true },
  };
}

export function updatePokemonInPartySlot(
  localPlayer: LocalPlayerState,
  slotIndex: number,
  pokemon: PlayerPokemon,
): PlayerChange<UpdatePokemonInPartySlotResult> {
  if (!isValidPartySlotIndex(slotIndex)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-slot" },
    };
  }
  const partySlot = getPartySlot(localPlayer, slotIndex);
  if (!partySlot?.pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "empty-slot" },
    };
  }
  return {
    player: {
      ...localPlayer,
      party: localPlayer.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex ? { ...slot, pokemon } : slot;
      }),
    },
    changed: true,
    result: { ok: true },
  };
}

export function replacePokemonMove(
  localPlayer: LocalPlayerState,
  slotIndex: number,
  moveIndex: number,
  move: PlayerPokemonMove,
): PlayerChange<ReplacePokemonMoveResult> {
  if (!isValidPartySlotIndex(slotIndex)) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-slot" },
    };
  }
  const partySlot = getPartySlot(localPlayer, slotIndex);
  if (!partySlot?.pokemon) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "empty-slot" },
    };
  }
  const pokemon = partySlot.pokemon;
  const moves = partySlot.pokemon.moves ?? [];
  if (!isValidMoveIndex(moveIndex) || !moves[moveIndex]) {
    return {
      player: localPlayer,
      changed: false,
      result: { ok: false, reason: "invalid-move-index" },
    };
  }
  return {
    player: {
      ...localPlayer,
      party: localPlayer.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex
          ? {
              ...slot,
              pokemon: {
                ...pokemon,
                moves: moves.map(function mapItem(candidate, index) {
                  return index === moveIndex ? move : candidate;
                }),
              },
            }
          : slot;
      }),
    },
    changed: true,
    result: { ok: true },
  };
}

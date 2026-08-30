import { PLAYER_PARTY_SLOT_COUNT, type PlayerFacing } from "../player/playerTypes";
import {
  MAX_POKEMON_INDIVIDUAL_VALUE,
  MIN_POKEMON_INDIVIDUAL_VALUE,
  type PokemonIndividualValues,
} from "../battle/individual-values";
import { isSupportedPokemonSpeciesId } from "../battle/pokemon-species";
import type {
  GameState,
  GameStateStore,
  LocalPlayerState,
  LocalPlayersSaveState,
  PlayerPokemon,
  PlayerPokemonMove,
  PlayerPokemonStatus,
} from "./gameStateStore";

export const POKE_LOUNGE_SAVE_SNAPSHOT_VERSION = 1;

export interface PokeLoungeSaveSnapshot {
  version: typeof POKE_LOUNGE_SAVE_SNAPSHOT_VERSION;
  game: "poke-lounge";
  state: LocalPlayersSaveState;
}

export function buildPokeLoungeSaveSnapshot(
  gameStateStore: Pick<GameStateStore, "getState">,
): PokeLoungeSaveSnapshot {
  return {
    version: POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
    game: "poke-lounge",
    state: cloneJsonSerializableLocalPlayers(gameStateStore.getState()),
  };
}

export function parsePokeLoungeSaveSnapshot(value: unknown): PokeLoungeSaveSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== POKE_LOUNGE_SAVE_SNAPSHOT_VERSION ||
    value.game !== "poke-lounge"
  ) {
    return null;
  }

  const state = sanitizeLocalPlayersSaveState(value.state);

  return state
    ? {
        version: POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
        game: "poke-lounge",
        state,
      }
    : null;
}

export function sanitizeLocalPlayersSaveState(value: unknown): LocalPlayersSaveState | null {
  if (
    !isRecord(value) ||
    typeof value.currentPlayerId !== "string" ||
    !isRecord(value.playersById)
  ) {
    return null;
  }

  const currentPlayerId = value.currentPlayerId;
  if (!isNonEmptyString(currentPlayerId) || isDangerousRecordKey(currentPlayerId)) {
    return null;
  }

  const playersById = Object.create(null) as Record<string, LocalPlayerState>;
  for (const [playerId, player] of Object.entries(value.playersById)) {
    if (!isNonEmptyString(playerId) || isDangerousRecordKey(playerId) || !isRecord(player)) {
      return null;
    }

    const sanitizedPlayer = sanitizeLocalPlayerState(playerId, player);
    if (!sanitizedPlayer) {
      return null;
    }

    Object.defineProperty(playersById, playerId, {
      value: sanitizedPlayer,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  if (!Object.hasOwn(playersById, currentPlayerId)) {
    return null;
  }

  return { currentPlayerId, playersById };
}

function cloneJsonSerializableLocalPlayers(state: GameState): LocalPlayersSaveState {
  return JSON.parse(
    JSON.stringify({
      currentPlayerId: state.currentPlayerId,
      playersById: state.playersById,
    }),
  ) as LocalPlayersSaveState;
}

function sanitizeLocalPlayerState(
  playerId: string,
  value: Record<string, unknown>,
): LocalPlayerState | null {
  if (
    value.playerId !== playerId ||
    !isNonEmptyString(value.displayName) ||
    !Array.isArray(value.party) ||
    !Array.isArray(value.pokemonBox) ||
    !isPartySlotIndex(value.activePartySlotIndex) ||
    !isRecord(value.wallet) ||
    !isRecord(value.inventory) ||
    !isRecord(value.competitive) ||
    !isRecord(value.guide) ||
    !isRecord(value.position)
  ) {
    return null;
  }

  const party = sanitizeParty(value.party);
  const pokemonBox = sanitizePokemonCollection(value.pokemonBox);
  const walletPokeDollars = value.wallet.pokeDollars;
  const inventory = sanitizeInventory(value.inventory);
  const rank = value.competitive.rank;
  const score = value.competitive.score;
  const position = sanitizePosition(value.position);

  if (
    !party ||
    !pokemonBox ||
    !isNonNegativeInteger(walletPokeDollars) ||
    !inventory ||
    !isValidRank(rank) ||
    !isNonNegativeInteger(score) ||
    (value.guide.shortcutGuideViewed !== true && value.guide.shortcutGuideViewed !== false) ||
    !position
  ) {
    return null;
  }

  return {
    playerId,
    displayName: value.displayName,
    party,
    pokemonBox,
    activePartySlotIndex: value.activePartySlotIndex,
    wallet: { pokeDollars: walletPokeDollars },
    inventory,
    competitive: { rank, score },
    guide: { shortcutGuideViewed: value.guide.shortcutGuideViewed },
    position,
  };
}

function sanitizeParty(value: unknown[]): LocalPlayerState["party"] | null {
  if (value.length > PLAYER_PARTY_SLOT_COUNT) {
    return null;
  }

  const seenSlotIndexes = new Set<number>();
  const party: LocalPlayerState["party"] = [];
  for (const slot of value) {
    if (
      !isRecord(slot) ||
      !isPartySlotIndex(slot.slotIndex) ||
      seenSlotIndexes.has(slot.slotIndex)
    ) {
      return null;
    }

    if (slot.pokemon !== null && !isRecord(slot.pokemon)) {
      return null;
    }

    const pokemon = slot.pokemon === null ? null : sanitizePokemon(slot.pokemon);
    if (slot.pokemon !== null && !pokemon) {
      return null;
    }

    seenSlotIndexes.add(slot.slotIndex);
    party.push({ slotIndex: slot.slotIndex, pokemon });
  }

  return party;
}

function sanitizePokemonCollection(value: unknown[]): PlayerPokemon[] | null {
  const pokemon = value.map(candidate => (isRecord(candidate) ? sanitizePokemon(candidate) : null));
  return pokemon.every((candidate): candidate is PlayerPokemon => candidate !== null)
    ? pokemon
    : null;
}

function sanitizePokemon(value: Record<string, unknown>): PlayerPokemon | null {
  if (
    !isSupportedPokemonSpeciesId(value.speciesId) ||
    !isNonEmptyString(value.name) ||
    !isPositiveInteger(value.level) ||
    !isOptionalNonNegativeInteger(value.maxHp) ||
    !isOptionalNonNegativeInteger(value.currentHp) ||
    !isOptionalNonNegativeInteger(value.experience) ||
    !isOptionalNonNegativeInteger(value.growthRate) ||
    !isOptionalPokemonGender(value.gender) ||
    !isOptionalPokemonStatus(value.status) ||
    !isOptionalIndividualValues(value.individualValues) ||
    !isOptionalMoves(value.moves)
  ) {
    return null;
  }

  if (
    typeof value.maxHp === "number" &&
    typeof value.currentHp === "number" &&
    value.currentHp > value.maxHp
  ) {
    return null;
  }

  return {
    speciesId: value.speciesId,
    name: value.name,
    level: value.level,
    ...(value.maxHp === undefined ? {} : { maxHp: value.maxHp }),
    ...(value.currentHp === undefined ? {} : { currentHp: value.currentHp }),
    ...(value.experience === undefined ? {} : { experience: value.experience }),
    ...(value.growthRate === undefined ? {} : { growthRate: value.growthRate }),
    ...(value.gender === undefined ? {} : { gender: value.gender }),
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.individualValues === undefined ? {} : { individualValues: value.individualValues }),
    ...(value.moves === undefined ? {} : { moves: value.moves.map(sanitizeMove) }),
  };
}

function sanitizeMove(value: unknown): PlayerPokemonMove {
  return value as PlayerPokemonMove;
}

function isOptionalMoves(value: unknown): value is PlayerPokemonMove[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 4 &&
      value.every(
        move =>
          isRecord(move) &&
          isPositiveInteger(move.id) &&
          isNonEmptyString(move.name) &&
          isNonNegativeInteger(move.pp) &&
          isNonNegativeInteger(move.maxPp) &&
          move.pp <= move.maxPp,
      ))
  );
}

function sanitizeInventory(value: Record<string, unknown>): Record<string, number> | null {
  const inventory: Record<string, number> = {};
  for (const [itemId, quantity] of Object.entries(value)) {
    if (!isNonEmptyString(itemId) || !isPositiveInteger(quantity)) {
      return null;
    }
    inventory[itemId] = quantity;
  }
  return inventory;
}

function sanitizePosition(value: Record<string, unknown>): LocalPlayerState["position"] | null {
  if (
    !isNonEmptyString(value.mapKey) ||
    !isSafeInteger(value.x) ||
    !isSafeInteger(value.y) ||
    !isPlayerFacing(value.facing)
  ) {
    return null;
  }

  return { mapKey: value.mapKey, x: value.x, y: value.y, facing: value.facing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDangerousRecordKey(value: string): boolean {
  return value === "__proto__" || value === "prototype" || value === "constructor";
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 1;
}

function isPartySlotIndex(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value < PLAYER_PARTY_SLOT_COUNT;
}

function isValidRank(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isOptionalPokemonStatus(value: unknown): value is PlayerPokemonStatus | undefined {
  return (
    value === undefined ||
    value === "normal" ||
    value === "poisoned" ||
    value === "burned" ||
    value === "paralyzed" ||
    value === "fainted"
  );
}

function isOptionalPokemonGender(value: unknown): value is PlayerPokemon["gender"] {
  return value === undefined || value === "male" || value === "female" || value === "genderless";
}

function isOptionalIndividualValues(value: unknown): value is PokemonIndividualValues | undefined {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"].every(key => {
    const individualValue = value[key];
    return (
      isSafeInteger(individualValue) &&
      individualValue >= MIN_POKEMON_INDIVIDUAL_VALUE &&
      individualValue <= MAX_POKEMON_INDIVIDUAL_VALUE
    );
  });
}

function isPlayerFacing(value: unknown): value is PlayerFacing {
  return value === "front" || value === "back" || value === "left" || value === "right";
}

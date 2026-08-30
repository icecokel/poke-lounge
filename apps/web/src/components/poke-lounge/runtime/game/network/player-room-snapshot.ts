import type { LocalPlayerState, RemotePlayerState } from "../state/gameStateStore";
import { FIELD_MAP } from "../world/fieldMap";
import type { PlayerFacing, PlayerSnapshot } from "./localPreviewRoom";

export function createLocalPlayerSnapshot(
  sessionId: string,
  localPlayer: LocalPlayerState,
  position: { x: number; y: number; facing: PlayerFacing },
): PlayerSnapshot {
  const activePokemon = localPlayer.party.find(
    slot => slot.slotIndex === localPlayer.activePartySlotIndex,
  )?.pokemon;

  return {
    sessionId,
    playerId: localPlayer.playerId,
    displayName: localPlayer.displayName,
    map: FIELD_MAP.key,
    x: position.x,
    y: position.y,
    facing: position.facing,
    activePartySlotIndex: localPlayer.activePartySlotIndex,
    party: localPlayer.party.map(slot => ({
      slotIndex: slot.slotIndex,
      pokemon: slot.pokemon
        ? {
            ...slot.pokemon,
            moves: slot.pokemon.moves?.map(move => ({ ...move })),
          }
        : null,
    })),
    ...(activePokemon
      ? {
          activePokemon: {
            speciesId: activePokemon.speciesId,
            name: activePokemon.name,
            level: activePokemon.level,
          },
        }
      : {}),
  };
}

export function toRemotePlayerState(snapshot: PlayerSnapshot): RemotePlayerState {
  return {
    sessionId: snapshot.sessionId,
    playerId: snapshot.playerId ?? snapshot.sessionId,
    displayName: snapshot.displayName,
    mapKey: snapshot.map,
    x: snapshot.x,
    y: snapshot.y,
    facing: snapshot.facing,
    activePokemon: snapshot.activePokemon,
  };
}

export function clonePlayerSnapshot(snapshot: PlayerSnapshot): PlayerSnapshot {
  return {
    ...snapshot,
    activePokemon: snapshot.activePokemon ? { ...snapshot.activePokemon } : undefined,
    party:
      snapshot.party?.map(slot => ({
        slotIndex: slot.slotIndex,
        pokemon: slot.pokemon
          ? {
              ...slot.pokemon,
              moves: slot.pokemon.moves?.map(move => ({ ...move })),
            }
          : null,
      })) ?? [],
  };
}

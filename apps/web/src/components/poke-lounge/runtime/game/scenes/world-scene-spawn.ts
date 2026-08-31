import type { PlayerFacing, PlayerPosition } from "../player/player-types";

const playerFacings = new Set<PlayerFacing>(["front", "back", "left", "right"]);

export interface PersistedWorldSpawnBounds {
  height: number;
  width: number;
}

export interface PersistedWorldSpawn {
  facing: PlayerFacing;
  x: number;
  y: number;
}

export function shouldPersistSoloWorldPosition(competitiveRoundsEnabled: boolean): boolean {
  return !competitiveRoundsEnabled;
}

export function resolvePersistedWorldSpawn(
  position: PlayerPosition,
  mapKey: string,
  bounds: PersistedWorldSpawnBounds,
): PersistedWorldSpawn | null {
  if (
    position.mapKey !== mapKey ||
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    !playerFacings.has(position.facing) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= bounds.width ||
    position.y >= bounds.height
  ) {
    return null;
  }

  return {
    facing: position.facing,
    x: position.x,
    y: position.y,
  };
}

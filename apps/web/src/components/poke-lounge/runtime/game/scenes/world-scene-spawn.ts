import type { PlayerFacing, PlayerPosition } from "../player/player-types";
import type { WorldMapModel } from "../world/world-map-model";
import { worldPlayerCollides } from "../world/world-runtime-motion";

const playerFacings = new Set<PlayerFacing>(["front", "back", "left", "right"]);

export interface PersistedWorldSpawn {
  facing: PlayerFacing;
  x: number;
  y: number;
}

/** Room battles return to a server-chosen spot; the world scene records it on start instead. */
export function shouldPersistBattleReturnPosition(competitiveRoundsEnabled: boolean): boolean {
  return !competitiveRoundsEnabled;
}

export function resolvePersistedWorldSpawn(
  position: PlayerPosition,
  mapKey: string,
  model: WorldMapModel,
): PersistedWorldSpawn | null {
  if (
    position.mapKey !== mapKey ||
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    !playerFacings.has(position.facing) ||
    !Number.isFinite(model.widthInPixels) ||
    !Number.isFinite(model.heightInPixels) ||
    model.widthInPixels <= 0 ||
    model.heightInPixels <= 0 ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= model.widthInPixels ||
    position.y >= model.heightInPixels ||
    worldPlayerCollides(position, model)
  ) {
    return null;
  }

  return {
    facing: position.facing,
    x: position.x,
    y: position.y,
  };
}

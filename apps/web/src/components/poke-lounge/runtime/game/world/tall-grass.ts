import type { CompletedTileStep, TileCoordinate } from "./tileSteps";

export interface TallGrassTileRegion {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
}

export type TallGrassTileLookup = (tile: TileCoordinate) => boolean;

interface TallGrassRegionObject {
  height?: number;
  name?: string;
  width?: number;
  x?: number;
  y?: number;
}

export const isTallGrassStep = (
  step: CompletedTileStep | null,
  hasTallGrassAt: TallGrassTileLookup,
): step is CompletedTileStep => step !== null && hasTallGrassAt(step.to);

export const resolveTallGrassTileRegions = (
  objects: ReadonlyArray<TallGrassRegionObject>,
  tileWidth: number,
  tileHeight: number,
): TallGrassTileRegion[] => {
  if (tileWidth <= 0 || tileHeight <= 0) {
    throw new Error("Tall grass tile dimensions must be positive.");
  }

  return objects.map(object => {
    const { x, y, width, height } = object;

    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      x % tileWidth !== 0 ||
      y % tileHeight !== 0 ||
      width % tileWidth !== 0 ||
      height % tileHeight !== 0
    ) {
      throw new Error(`Tall grass region must align to the tile grid: ${object.name}`);
    }

    return {
      tileX: x / tileWidth,
      tileY: y / tileHeight,
      width: width / tileWidth,
      height: height / tileHeight,
    };
  });
};

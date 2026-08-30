import type * as Phaser from "phaser";
import type { CompletedTileStep, TileCoordinate } from "./tileSteps";

export interface TallGrassTileRegion {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
}

export interface TallGrassLayerConfig {
  regionLayerName: string;
  baseLayerName: string;
  foregroundLayerName: string;
  baseTileIndex: number;
  foregroundTileIndex: number;
}

export interface TallGrassLayers {
  baseLayer: Phaser.Tilemaps.TilemapLayer;
  foregroundLayer: Phaser.Tilemaps.TilemapLayer;
}

export type TallGrassTileLookup = (tile: TileCoordinate) => boolean;

export const isTallGrassStep = (
  step: CompletedTileStep | null,
  hasTallGrassAt: TallGrassTileLookup,
): step is CompletedTileStep => step !== null && hasTallGrassAt(step.to);

export const resolveTallGrassTileRegions = (
  objects: ReadonlyArray<Phaser.Types.Tilemaps.TiledObject>,
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

export const createTallGrassLayers = (
  map: Phaser.Tilemaps.Tilemap,
  tileset: Phaser.Tilemaps.Tileset,
  config: TallGrassLayerConfig,
): TallGrassLayers => {
  const regionLayer = map.getObjectLayer(config.regionLayerName);

  if (!regionLayer) {
    throw new Error(`Missing tall grass region layer: ${config.regionLayerName}`);
  }

  const regions = resolveTallGrassTileRegions(regionLayer.objects, map.tileWidth, map.tileHeight);

  if (regions.length === 0) {
    throw new Error(`Tall grass region layer is empty: ${config.regionLayerName}`);
  }

  const baseLayer = map.createBlankLayer(config.baseLayerName, tileset);
  const foregroundLayer = map.createBlankLayer(config.foregroundLayerName, tileset);

  if (!baseLayer || !foregroundLayer) {
    throw new Error("Failed to create tall grass tile layers.");
  }

  for (const region of regions) {
    baseLayer.fill(config.baseTileIndex, region.tileX, region.tileY, region.width, region.height);
    foregroundLayer.fill(
      config.foregroundTileIndex,
      region.tileX,
      region.tileY,
      region.width,
      region.height,
    );
  }

  return {
    baseLayer,
    foregroundLayer,
  };
};

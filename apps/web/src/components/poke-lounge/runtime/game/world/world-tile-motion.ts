import type { WorldMapTile } from "./world-map-model";

export const WORLD_GRASS_TILES_ASSET = {
  key: "world-grass-tiles",
  path: "/assets/poke-lounge/world/autumn-forest-grass.png",
} as const;

export const WORLD_GRASS_STEP_ASSET = {
  key: "world-grass-step",
  path: "/assets/poke-lounge/world/original-rice/14-tall-golden-grass-step.png",
} as const;

export function getWorldGrassSource(tile: WorldMapTile, coordinates: ReadonlySet<string>) {
  if (tile.gid !== 757 && tile.gid !== 758) return null;
  const { x, y } = tile;
  const mask =
    (coordinates.has(`${x},${y - 1}`) ? 1 : 0) |
    (coordinates.has(`${x + 1},${y}`) ? 2 : 0) |
    (coordinates.has(`${x},${y + 1}`) ? 4 : 0) |
    (coordinates.has(`${x - 1},${y}`) ? 8 : 0);
  const variant = (y % 4) * 4 + (x % 4);
  return { x: 1 + mask * 34, y: variant * 68 + (tile.gid === 757 ? 1 : 35) };
}

import type { WorldMapTile } from "./world-map-model";

export const WORLD_TILE_MOTION_ASSET = {
  key: "world-tile-motion",
  path: "/assets/poke-lounge/world/autumn-forest-motion.png",
} as const;

export function getWorldGrassSource(tile: WorldMapTile, coordinates: ReadonlySet<string>) {
  if (tile.gid !== 757 && tile.gid !== 758) return null;
  const { x, y } = tile;
  const mask =
    (coordinates.has(`${x},${y - 1}`) ? 1 : 0) |
    (coordinates.has(`${x + 1},${y}`) ? 2 : 0) |
    (coordinates.has(`${x},${y + 1}`) ? 4 : 0) |
    (coordinates.has(`${x - 1},${y}`) ? 8 : 0);
  return { x: 1 + mask * 34, y: tile.gid === 757 ? 137 : 171 };
}

export function getWorldTileMotion(tile: WorldMapTile) {
  const treeIndex = tile.gid - 745;
  if (treeIndex < 0 || treeIndex >= 12) return null;
  const quadrant = treeIndex % 4;
  // All four tiles of a tree must change frames together to keep its seams closed.
  const anchorX = tile.x - (quadrant % 2);
  const anchorY = tile.y - Math.floor(quadrant / 2);
  const x = 1 + quadrant * 34;
  return {
    x,
    y: 1 + Math.floor(treeIndex / 4) * 34,
    endX: x + 544,
    frames: 4,
    durationMs: 1600,
    delayMs: -((anchorX * 173 + anchorY * 257) % 1600),
  };
}

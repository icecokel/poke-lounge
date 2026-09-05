export const FIELD_TILE_SIZE = 32;

export interface PixelPosition {
  x: number;
  y: number;
}

export interface TileCoordinate {
  x: number;
  y: number;
}

export interface CompletedTileStep {
  from: TileCoordinate;
  to: TileCoordinate;
}

export interface TileStepTracker {
  currentPosition: PixelPosition | null;
  tileSize: number;
}

export function pixelToTile(position: PixelPosition, tileSize = FIELD_TILE_SIZE): TileCoordinate {
  return {
    x: Math.floor(position.x / tileSize),
    y: Math.floor(position.y / tileSize),
  };
}

export function createTileStepTracker(
  initialPosition?: PixelPosition,
  tileSize = FIELD_TILE_SIZE,
): TileStepTracker {
  return {
    currentPosition: initialPosition ? { ...initialPosition } : null,
    tileSize,
  };
}

export function consumeCompletedTileSteps(
  tracker: TileStepTracker,
  position: PixelPosition,
): CompletedTileStep[] {
  const previousPosition = tracker.currentPosition;
  tracker.currentPosition = { ...position };

  if (!previousPosition) {
    return [];
  }

  const previousTile = pixelToTile(previousPosition, tracker.tileSize);
  const currentTile = pixelToTile(position, tracker.tileSize);

  if (previousTile.x === currentTile.x && previousTile.y === currentTile.y) {
    return [];
  }

  const deltaX = position.x - previousPosition.x;
  const deltaY = position.y - previousPosition.y;
  const crossings: Array<{
    axis: "x" | "y";
    direction: -1 | 1;
    progress: number;
  }> = [];

  if (currentTile.x > previousTile.x) {
    for (let tileX = previousTile.x + 1; tileX <= currentTile.x; tileX += 1) {
      crossings.push({
        axis: "x",
        direction: 1,
        progress: (tileX * tracker.tileSize - previousPosition.x) / deltaX,
      });
    }
  } else if (currentTile.x < previousTile.x) {
    for (let tileX = previousTile.x; tileX > currentTile.x; tileX -= 1) {
      crossings.push({
        axis: "x",
        direction: -1,
        progress: (tileX * tracker.tileSize - previousPosition.x) / deltaX,
      });
    }
  }

  if (currentTile.y > previousTile.y) {
    for (let tileY = previousTile.y + 1; tileY <= currentTile.y; tileY += 1) {
      crossings.push({
        axis: "y",
        direction: 1,
        progress: (tileY * tracker.tileSize - previousPosition.y) / deltaY,
      });
    }
  } else if (currentTile.y < previousTile.y) {
    for (let tileY = previousTile.y; tileY > currentTile.y; tileY -= 1) {
      crossings.push({
        axis: "y",
        direction: -1,
        progress: (tileY * tracker.tileSize - previousPosition.y) / deltaY,
      });
    }
  }

  crossings.sort(function compareItems(left, right) {
    return left.progress - right.progress || left.axis.localeCompare(right.axis);
  });

  const steps: CompletedTileStep[] = [];
  let from = previousTile;

  for (let index = 0; index < crossings.length;) {
    const progress = crossings[index].progress;
    const to = { ...from };

    while (index < crossings.length && Math.abs(crossings[index].progress - progress) < 1e-9) {
      const crossing = crossings[index];
      to[crossing.axis] += crossing.direction;
      index += 1;
    }

    steps.push({ from, to });
    from = to;
  }

  return steps;
}

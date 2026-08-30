import { FIELD_MAP } from "./fieldMap";
import type { WorldMapModel, WorldMapNpcModel } from "./world-map-model";

export interface WorldPosition {
  x: number;
  y: number;
}

export interface WorldVelocity {
  x: number;
  y: number;
}

export const WORLD_MOTION_MAX_STEP_PX = 4;

export function moveWorldPlayer(
  position: WorldPosition,
  velocity: WorldVelocity,
  elapsedMs: number,
  model: WorldMapModel,
): WorldPosition {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return position;
  const deltaX = (velocity.x * elapsedMs) / 1000;
  const deltaY = (velocity.y * elapsedMs) / 1000;
  const stepCount = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY)) / WORLD_MOTION_MAX_STEP_PX),
  );
  const stepX = deltaX / stepCount;
  const stepY = deltaY / stepCount;
  let next = position;

  for (let step = 0; step < stepCount; step += 1) {
    const movedX = { x: next.x + stepX, y: next.y };
    if (!worldPlayerCollides(movedX, model)) next = movedX;
    const movedY = { x: next.x, y: next.y + stepY };
    if (!worldPlayerCollides(movedY, model)) next = movedY;
  }

  return next;
}

export function resolveWorldCamera(
  position: WorldPosition,
  viewport: { width: number; height: number },
  model: WorldMapModel,
): WorldPosition {
  return {
    x: clamp(position.x - viewport.width / 2, 0, Math.max(0, model.widthInPixels - viewport.width)),
    y: clamp(
      position.y - viewport.height / 2,
      0,
      Math.max(0, model.heightInPixels - viewport.height),
    ),
  };
}

export function worldPlayerCollides(position: WorldPosition, model: WorldMapModel): boolean {
  const player = getPlayerHitbox(position);
  if (
    player.left < 0 ||
    player.top < 0 ||
    player.right > model.widthInPixels ||
    player.bottom > model.heightInPixels
  ) {
    return true;
  }

  const firstTileX = Math.floor(player.left / model.tileWidth);
  const lastTileX = Math.floor((player.right - Number.EPSILON) / model.tileWidth);
  const firstTileY = Math.floor(player.top / model.tileHeight);
  const lastTileY = Math.floor((player.bottom - Number.EPSILON) / model.tileHeight);
  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      if (model.collisionCoordinates.has(`${tileX},${tileY}`)) return true;
    }
  }

  return model.npcs.some(npc => rectanglesOverlap(player, getNpcHitbox(npc)));
}

export function getPlayerHitbox(position: WorldPosition) {
  const { width, height, offsetX, offsetY } = FIELD_MAP.player.hitbox;
  const scaleX = FIELD_MAP.player.displaySize.width / 32;
  const scaleY = FIELD_MAP.player.displaySize.height / 32;
  const spriteLeft = position.x - FIELD_MAP.player.displaySize.width / 2;
  const spriteTop = position.y - FIELD_MAP.player.displaySize.height / 2;
  const left = spriteLeft + offsetX * scaleX;
  const top = spriteTop + offsetY * scaleY;
  return {
    bottom: top + height * scaleY,
    left,
    right: left + width * scaleX,
    top,
  };
}

function getNpcHitbox(npc: WorldMapNpcModel) {
  const config = FIELD_MAP.npcs[npc.name];
  const scaleX = config.displaySize.width / 32;
  const scaleY = config.displaySize.height / 32;
  const spriteLeft = npc.x - config.displaySize.width / 2;
  const spriteTop = npc.y - config.displaySize.height;
  const left = spriteLeft + config.hitbox.offsetX * scaleX;
  const top = spriteTop + config.hitbox.offsetY * scaleY;
  return {
    bottom: top + config.hitbox.height * scaleY,
    left,
    right: left + config.hitbox.width * scaleX,
    top,
  };
}

function rectanglesOverlap(
  left: { bottom: number; left: number; right: number; top: number },
  right: { bottom: number; left: number; right: number; top: number },
) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

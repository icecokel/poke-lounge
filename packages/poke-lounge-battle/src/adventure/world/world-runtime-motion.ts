import { FIELD_MAP } from "./field-map";
import type { WorldMapModel, WorldMapNpcModel } from "./world-map-model";

export interface WorldPosition {
  x: number;
  y: number;
}

export interface WorldVelocity {
  x: number;
  y: number;
}

interface WorldHitbox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const WORLD_MOTION_MAX_STEP_PX = 4;

export function moveWorldPlayer(
  position: WorldPosition,
  velocity: WorldVelocity,
  elapsedMs: number,
  model: WorldMapModel,
): WorldPosition {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || (velocity.x === 0 && velocity.y === 0))
    return position;
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
    const previous = next;
    const movedX = { x: next.x + stepX, y: next.y };
    if (canMoveWorldPlayer(next, movedX, model)) next = movedX;
    const movedY = { x: next.x, y: next.y + stepY };
    if (canMoveWorldPlayer(next, movedY, model)) next = movedY;
    if (next.x === previous.x && next.y === previous.y)
      next = slidePastNpc(next, stepX, stepY, model);
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
  return (
    playerCollidesWithMap(player, model) ||
    model.npcs.some(npc => rectanglesOverlap(player, getNpcHitbox(npc)))
  );
}

function canMoveWorldPlayer(from: WorldPosition, to: WorldPosition, model: WorldMapModel): boolean {
  const player = getPlayerHitbox(to);
  if (playerCollidesWithMap(player, model)) return false;
  const previous = getPlayerHitbox(from);
  return model.npcs.every(npc => {
    const obstacle = getNpcHitbox(npc);
    if (!rectanglesOverlap(player, obstacle)) return true;
    // A loaded/spawned overlap must still allow walking out of the NPC.
    return (
      rectanglesOverlap(previous, obstacle) &&
      getHitboxCenterDistance(player, obstacle) > getHitboxCenterDistance(previous, obstacle)
    );
  });
}

function slidePastNpc(
  position: WorldPosition,
  stepX: number,
  stepY: number,
  model: WorldMapModel,
): WorldPosition {
  const target = getPlayerHitbox({ x: position.x + stepX, y: position.y + stepY });
  const npc = model.npcs.find(candidate => rectanglesOverlap(target, getNpcHitbox(candidate)));
  if (!npc) return position;
  const player = getPlayerHitbox(position);
  const obstacle = getNpcHitbox(npc);
  const horizontal = Math.abs(stepY) >= Math.abs(stepX);
  const offset = horizontal
    ? player.left + player.right - obstacle.left - obstacle.right
    : player.top + player.bottom - obstacle.top - obstacle.bottom;
  const distance = Math.max(Math.abs(stepX), Math.abs(stepY)) * (offset < 0 ? -1 : 1);
  const next = horizontal
    ? { x: position.x + distance, y: position.y }
    : { x: position.x, y: position.y + distance };
  return canMoveWorldPlayer(position, next, model) ? next : position;
}

function getHitboxCenterDistance(left: WorldHitbox, right: WorldHitbox): number {
  return Math.hypot(
    left.left + left.right - right.left - right.right,
    left.top + left.bottom - right.top - right.bottom,
  );
}

function playerCollidesWithMap(player: WorldHitbox, model: WorldMapModel): boolean {
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

  return false;
}

export function getPlayerHitbox(position: WorldPosition): WorldHitbox {
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

function rectanglesOverlap(left: WorldHitbox, right: WorldHitbox) {
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

export const REMOTE_PLAYER_INTERPOLATION_MS = 120;
export const AI_REMOTE_PLAYER_INTERPOLATION_MS = 250;
export const REMOTE_PLAYER_SNAP_DISTANCE = 96;
export const LOCAL_PLAYER_SPEED = 104;

export function resolveLocalPlayerVelocity(
  input: { left: boolean; right: boolean; up: boolean; down: boolean },
  currentFacing: "front" | "back" | "left" | "right",
): { x: number; y: number; facing: "front" | "back" | "left" | "right" } {
  const x = Number(input.right) - Number(input.left);
  const y = Number(input.down) - Number(input.up);
  const length = Math.hypot(x, y);

  if (length === 0) {
    return { x: 0, y: 0, facing: currentFacing };
  }

  const velocityX = (x / length) * LOCAL_PLAYER_SPEED;
  const velocityY = (y / length) * LOCAL_PLAYER_SPEED;

  return {
    x: velocityX,
    y: velocityY,
    facing:
      Math.abs(velocityX) > Math.abs(velocityY)
        ? velocityX > 0
          ? "right"
          : "left"
        : velocityY > 0
          ? "front"
          : "back",
  };
}

export interface RemotePlayerMotion {
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startedAtMs: number;
  durationMs: number;
}

export function resolveRemotePlayerMotion(
  motion: RemotePlayerMotion,
  nowMs: number,
): { x: number; y: number; complete: boolean } {
  const progress = Math.min(1, Math.max(0, (nowMs - motion.startedAtMs) / motion.durationMs));

  return {
    x: motion.fromX + (motion.targetX - motion.fromX) * progress,
    y: motion.fromY + (motion.targetY - motion.fromY) * progress,
    complete: progress >= 1,
  };
}

export function shouldSnapRemotePlayer(
  current: { x: number; y: number },
  target: { x: number; y: number },
): boolean {
  return Math.hypot(target.x - current.x, target.y - current.y) >= REMOTE_PLAYER_SNAP_DISTANCE;
}

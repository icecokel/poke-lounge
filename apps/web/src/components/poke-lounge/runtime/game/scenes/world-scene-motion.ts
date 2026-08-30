export const REMOTE_PLAYER_INTERPOLATION_MS = 120;
export const REMOTE_PLAYER_SNAP_DISTANCE = 96;

export interface RemotePlayerMotion {
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startedAtMs: number;
}

export function resolveRemotePlayerMotion(
  motion: RemotePlayerMotion,
  nowMs: number,
): { x: number; y: number; complete: boolean } {
  const progress = Math.min(
    1,
    Math.max(0, (nowMs - motion.startedAtMs) / REMOTE_PLAYER_INTERPOLATION_MS),
  );

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

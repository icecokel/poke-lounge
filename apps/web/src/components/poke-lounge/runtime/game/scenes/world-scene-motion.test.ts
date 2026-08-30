import assert from "node:assert/strict";
import test from "node:test";
import {
  REMOTE_PLAYER_INTERPOLATION_MS,
  resolveRemotePlayerMotion,
  shouldSnapRemotePlayer,
} from "./world-scene-motion";

test("원격 이동은 120ms 동안 목표 좌표를 보간하고 큰 좌표 차이는 즉시 맞춘다", () => {
  const motion = {
    fromX: 10,
    fromY: 20,
    targetX: 34,
    targetY: 44,
    startedAtMs: 1_000,
  };

  assert.deepEqual(resolveRemotePlayerMotion(motion, 1_000), {
    x: 10,
    y: 20,
    complete: false,
  });
  assert.deepEqual(resolveRemotePlayerMotion(motion, 1_000 + REMOTE_PLAYER_INTERPOLATION_MS / 2), {
    x: 22,
    y: 32,
    complete: false,
  });
  assert.deepEqual(resolveRemotePlayerMotion(motion, 1_000 + REMOTE_PLAYER_INTERPOLATION_MS), {
    x: 34,
    y: 44,
    complete: true,
  });
  assert.equal(shouldSnapRemotePlayer({ x: 0, y: 0 }, { x: 95, y: 0 }), false);
  assert.equal(shouldSnapRemotePlayer({ x: 0, y: 0 }, { x: 96, y: 0 }), true);
});

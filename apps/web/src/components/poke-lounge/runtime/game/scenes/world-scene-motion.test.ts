import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_PLAYER_SPEED,
  REMOTE_PLAYER_INTERPOLATION_MS,
  resolveLocalPlayerVelocity,
  resolveRemotePlayerMotion,
  shouldSnapRemotePlayer,
} from "./world-scene-motion";

test("로컬 직선·대각선 이동은 같은 104px/s 속도와 기존 방향 우선순위를 유지한다", function testCase() {
  assert.deepEqual(
    resolveLocalPlayerVelocity({ left: false, right: false, up: false, down: false }, "left"),
    { x: 0, y: 0, facing: "left" },
  );

  const straight = resolveLocalPlayerVelocity(
    { left: false, right: true, up: false, down: false },
    "front",
  );
  const diagonal = resolveLocalPlayerVelocity(
    { left: false, right: true, up: true, down: false },
    "front",
  );

  assert.deepEqual(straight, { x: LOCAL_PLAYER_SPEED, y: 0, facing: "right" });
  assert.equal(Math.hypot(diagonal.x, diagonal.y), LOCAL_PLAYER_SPEED);
  assert.equal(diagonal.facing, "back");
});

test("원격 이동은 120ms 동안 목표 좌표를 보간하고 큰 좌표 차이는 즉시 맞춘다", function testCase() {
  const motion = {
    durationMs: REMOTE_PLAYER_INTERPOLATION_MS,
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

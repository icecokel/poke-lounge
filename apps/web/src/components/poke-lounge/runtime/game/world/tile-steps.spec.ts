import assert from "node:assert/strict";
import test from "node:test";
import { consumeCompletedTileSteps, createTileStepTracker } from "./tile-steps";

test("프레임 드롭으로 여러 타일을 지나도 모든 직교 이동을 반환한다", function testCase() {
  const tracker = createTileStepTracker({ x: 16, y: 16 });

  assert.deepEqual(consumeCompletedTileSteps(tracker, { x: 112, y: 16 }), [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    { from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
    { from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
  ]);
});

test("대각 이동은 같은 시점에 통과한 두 경계를 한 타일 이동으로 반환한다", function testCase() {
  const tracker = createTileStepTracker({ x: 16, y: 16 });

  assert.deepEqual(consumeCompletedTileSteps(tracker, { x: 80, y: 80 }), [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    { from: { x: 1, y: 1 }, to: { x: 2, y: 2 } },
  ]);
});

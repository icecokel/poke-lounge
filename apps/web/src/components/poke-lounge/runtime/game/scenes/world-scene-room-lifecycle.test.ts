import assert from "node:assert/strict";
import test from "node:test";
import { shouldDisposeRoomOnWorldShutdown } from "./world-scene-room-lifecycle";

test("전투 전환 중에는 멀티플레이 방을 유지하고 실제 월드 종료에서만 정리한다", () => {
  assert.equal(shouldDisposeRoomOnWorldShutdown(true, false), false);
  assert.equal(shouldDisposeRoomOnWorldShutdown(false, true), false);
  assert.equal(shouldDisposeRoomOnWorldShutdown(false, false), true);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createWorldFrameStore } from "./world-frame-store";
import { createWorldMapModel } from "./world-map-model";
import { createWorldRuntime } from "./world-runtime";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const model = createWorldMapModel(
  JSON.parse(
    fs.readFileSync(path.join(webRoot, "public/maps/pokemmo-reference/town.json"), "utf8"),
  ),
);

test("WorldRuntime은 정규화 이동·충돌·중간 tile step·camera를 한 frame에 계산한다", function testCase() {
  const store = createWorldFrameStore();
  const runtime = createWorldRuntime(model, store);
  runtime.initialize({ position: { x: 144, y: 80 }, viewport: { width: 512, height: 384 } });
  const result = runtime.update({
    elapsedMs: 1_000,
    input: { down: false, left: false, right: true, up: false },
    inputLocked: false,
    nowMs: 1_000,
    viewport: { width: 512, height: 384 },
  });

  assert.equal(result.position.x, 248);
  assert.deepEqual(result.completedTileSteps, [
    { from: { x: 4, y: 2 }, to: { x: 5, y: 2 } },
    { from: { x: 5, y: 2 }, to: { x: 6, y: 2 } },
    { from: { x: 6, y: 2 }, to: { x: 7, y: 2 } },
  ]);
  assert.equal(store.read().localPlayer.frameName, "hero-right-walk.000");
  assert.equal(store.read().camera.x >= 0, true);

  runtime.setLocalPosition({ x: 368, y: 452, facing: "back" }, { width: 512, height: 384 });
  const blocked = runtime.update({
    elapsedMs: 1_000,
    input: { down: false, left: false, right: false, up: true },
    inputLocked: false,
    nowMs: 2_000,
    viewport: { width: 512, height: 384 },
  });
  assert.equal(blocked.position.y > 416, true);
});

test("WorldRuntime은 remote 생성·보간·snap·퇴장을 frame store에 반영한다", function testCase() {
  const store = createWorldFrameStore();
  const runtime = createWorldRuntime(model, store);
  const snapshot = {
    sessionId: "remote-1",
    displayName: "원격 트레이너",
    map: "town",
    x: 100,
    y: 100,
    facing: "right" as const,
  };
  runtime.upsertRemotePlayer(snapshot, "snap", 0);
  runtime.upsertRemotePlayer({ ...snapshot, x: 124 }, "interpolate", 1_000);
  runtime.update({
    elapsedMs: 0,
    input: { down: false, left: false, right: false, up: false },
    inputLocked: true,
    nowMs: 1_060,
    viewport: { width: 512, height: 384 },
  });
  assert.equal(store.read().remotePlayers[0]?.x, 112);
  assert.equal(store.read().remotePlayers[0]?.walking, true);
  runtime.upsertRemotePlayer({ ...snapshot, x: 300 }, "interpolate", 2_000);
  assert.equal(store.read().remotePlayers[0]?.x, 300);
  runtime.removeRemotePlayer(snapshot.sessionId);
  assert.equal(store.read().remotePlayers.length, 0);
});

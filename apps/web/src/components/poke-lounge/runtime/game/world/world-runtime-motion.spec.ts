import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWorldMapModel } from "./world-map-model";
import { moveWorldPlayer, resolveWorldCamera } from "./world-runtime-motion";

const model = createWorldMapModel(
  JSON.parse(
    readFileSync(
      new URL("../../../../../../public/maps/pokemmo-reference/town.json", import.meta.url),
      "utf8",
    ),
  ),
);

test("DOM 월드 motion은 큰 dt에도 맵·충돌 타일·NPC를 관통하지 않는다", () => {
  const boundary = moveWorldPlayer({ x: 12, y: 288 }, { x: -104, y: 0 }, 1_000, model);
  assert.equal(boundary.x, 12);

  const wall = moveWorldPlayer({ x: 368, y: 452 }, { x: 0, y: -104 }, 1_000, model);
  assert.ok(wall.y > 416);

  const npc = moveWorldPlayer({ x: 512, y: 360 }, { x: 0, y: -104 }, 1_000, model);
  assert.ok(npc.y >= 330);
});

test("DOM 월드 camera는 기존 512x384 viewport를 맵 경계 안에 clamp한다", () => {
  assert.deepEqual(resolveWorldCamera({ x: 12, y: 12 }, { width: 512, height: 384 }, model), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(
    resolveWorldCamera({ x: 1268, y: 564 }, { width: 512, height: 384 }, model),
    { x: 768, y: 192 },
  );
});

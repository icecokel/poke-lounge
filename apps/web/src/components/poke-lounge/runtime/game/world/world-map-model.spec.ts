import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWorldMapModel, getWorldTileSourcePosition } from "./world-map-model";

const mapPath = new URL(
  "../../../../../../public/maps/pokemmo-reference/town.json",
  import.meta.url,
);

test("TSX 월드 모델은 기존 40x18 레이어, 잔디, NPC, 스폰과 충돌 계약을 보존한다", () => {
  const model = createWorldMapModel(JSON.parse(readFileSync(mapPath, "utf8")));

  assert.equal(model.width, 40);
  assert.equal(model.height, 18);
  assert.equal(model.widthInPixels, 1280);
  assert.equal(model.heightInPixels, 576);
  assert.deepEqual(
    model.layers.map(layer => [layer.name, layer.tiles.length]),
    [
      ["Below Player", 720],
      ["World", 242],
      ["Above Player", 5],
    ],
  );
  assert.equal(model.tallGrassCoordinates.size, 90);
  assert.equal(model.npcs.length, 6);
  assert.deepEqual(model.spawnPoints.get("Spawn Point"), { x: 656, y: 446 });
  assert.equal(model.collisionGids.has(169), true);
  assert.equal(model.collisionCoordinates.size > 0, true);
  assert.deepEqual(getWorldTileSourcePosition(model, 1), { x: 1, y: 1 });
  assert.deepEqual(getWorldTileSourcePosition(model, 25), { x: 1, y: 35 });
});

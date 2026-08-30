import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FIELD_MAP } from "./fieldMap";
import { isTallGrassStep, resolveTallGrassTileRegions } from "./tall-grass";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test("완료된 이동의 도착 타일이 긴 풀일 때만 야생 조우를 허용한다", () => {
  const step = {
    from: { x: 20, y: 35 },
    to: { x: 21, y: 35 },
  };

  assert.equal(
    isTallGrassStep(step, tile => tile.x === 21 && tile.y === 35),
    true,
  );
  assert.equal(
    isTallGrassStep(step, () => false),
    false,
  );
  assert.equal(
    isTallGrassStep(null, () => true),
    false,
  );
});

test("월드 맵의 긴 풀 구역은 타일 격자에 맞춰 정의한다", () => {
  const map = JSON.parse(
    fs.readFileSync(path.join(webRoot, "public/maps/pokemmo-reference/town.json"), "utf8"),
  ) as {
    height: number;
    width: number;
    tilewidth: number;
    tileheight: number;
    layers: Array<{
      data?: number[];
      height?: number;
      name: string;
      objects?: Array<{ height?: number; name?: string; width?: number; x?: number; y?: number }>;
    }>;
  };
  const regionLayer = map.layers.find(layer => layer.name === FIELD_MAP.tallGrass.regionLayerName);
  const tileLayers = map.layers.filter(layer => layer.data);

  assert.equal(map.height, 18);
  assert.ok(
    tileLayers.every(
      layer => layer.height === map.height && layer.data?.length === map.width * map.height,
    ),
  );

  assert.ok(regionLayer?.objects);
  assert.deepEqual(
    resolveTallGrassTileRegions(regionLayer.objects, map.tilewidth, map.tileheight),
    [
      {
        tileX: 4,
        tileY: 2,
        width: 5,
        height: 3,
      },
      {
        tileX: 13,
        tileY: 2,
        width: 5,
        height: 3,
      },
      {
        tileX: 4,
        tileY: 9,
        width: 6,
        height: 5,
      },
      {
        tileX: 22,
        tileY: 12,
        width: 10,
        height: 3,
      },
    ],
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FIELD_MAP } from "../world/fieldMap";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");

test("이식 기준 public asset 71개는 경로와 바이트가 바뀌지 않는다", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "docs/poke-lounge-asset-provenance.json"), "utf8"),
  ) as { assets: Array<{ publicPath: string; sha256: string }> };

  assert.equal(manifest.assets.length, 71);
  for (const asset of manifest.assets) {
    const contents = fs.readFileSync(path.join(webRoot, "public", asset.publicPath));
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      asset.sha256,
      asset.publicPath,
    );
  }
});

test("town map과 hero atlas의 DOM 이식 좌표 계약을 고정한다", () => {
  const map = JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", FIELD_MAP.mapUrl), "utf8"),
  ) as {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    layers: Array<{ name: string; data?: number[] }>;
    tilesets: Array<{
      firstgid: number;
      columns: number;
      tilewidth: number;
      tileheight: number;
      imagewidth: number;
      imageheight: number;
      margin: number;
      spacing: number;
    }>;
  };
  const [tileset] = map.tilesets;

  assert.deepEqual(
    { width: map.width, height: map.height, tilewidth: map.tilewidth, tileheight: map.tileheight },
    { width: 40, height: 18, tilewidth: 32, tileheight: 32 },
  );
  assert.deepEqual(
    map.layers.map(layer => layer.name),
    [
      "Below Player",
      "World",
      "Above Player",
      "Npcs",
      "SpawnPoints",
      "Doors",
      "Worlds",
      "IndoorZones",
      "TallGrassZones",
    ],
  );
  assert.deepEqual(tileset, {
    ...tileset,
    firstgid: 1,
    columns: 24,
    tilewidth: 32,
    tileheight: 32,
    imagewidth: 816,
    imageheight: 1020,
    margin: 1,
    spacing: 2,
  });
  assert.ok(map.layers.flatMap(layer => layer.data ?? []).every(gid => (gid & 0xe0000000) === 0));

  const atlas = JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", FIELD_MAP.player.atlasJsonUrl), "utf8"),
  ) as {
    frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    meta: { size: { w: number; h: number } };
  };
  const expectedFrameNames = Object.entries(FIELD_MAP.player.frameNames).flatMap(
    ([direction, idleFrame]) => [
      `${FIELD_MAP.player.walkAnimationKeys[direction as keyof typeof FIELD_MAP.player.walkAnimationKeys]}.000`,
      `${FIELD_MAP.player.walkAnimationKeys[direction as keyof typeof FIELD_MAP.player.walkAnimationKeys]}.001`,
      `${FIELD_MAP.player.walkAnimationKeys[direction as keyof typeof FIELD_MAP.player.walkAnimationKeys]}.002`,
      `${FIELD_MAP.player.walkAnimationKeys[direction as keyof typeof FIELD_MAP.player.walkAnimationKeys]}.003`,
      idleFrame,
    ],
  );

  assert.deepEqual(atlas.meta.size, { w: 128, h: 128 });
  assert.deepEqual(Object.keys(atlas.frames).sort(), expectedFrameNames.sort());
  assert.ok(
    Object.values(atlas.frames).every(frame => frame.frame.w === 32 && frame.frame.h === 32),
  );
});

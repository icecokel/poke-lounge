import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BATTLE_POKEMON_FRAME_SIZE,
  DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES,
  getBattlePokemonAlphaBounds,
  getBattlePokemonAssets,
  toBattlePokemonPreloadAssets,
} from "./battlePokemonAssets";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  getRuntimeBattlePokemonSpriteSheetRanges,
  loadRuntimeGameDataJson,
  normalizeBattlePokemonAssetManifest,
  resetRuntimeGameDataJsonStateForTest,
  type BattlePokemonSpriteSheetRangeRecord,
} from "../data/game-data-json";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const manifestPath = path.join(webRoot, "public/game-data/battle-pokemon-assets.json");

test("전투 포켓몬 sprite sheet fallback과 JSON 계약이 일치한다", () => {
  const manifest = normalizeBattlePokemonAssetManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  );

  assert.deepEqual(manifest?.spriteSheetRanges, DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES);
});

test("sprite sheet manifest는 16x16 grid와 80px frame만 허용한다", () => {
  const invalidManifest = {
    version: 2,
    spriteSheetRanges: [
      {
        ...DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES[0],
        frameWidth: 160,
      },
      DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES[1],
    ],
  };

  assert.equal(normalizeBattlePokemonAssetManifest(invalidManifest), null);
});

test("sprite sheet manifest v2는 전국도감 1번부터 493번까지 빈틈없이 커버해야 한다", () => {
  const [firstRange, secondRange] = DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES;
  const invalidManifests = [
    {
      version: 1,
      spriteSheetRanges: DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES,
    },
    {
      version: 2,
      spriteSheetRanges: [firstRange],
    },
    {
      version: 2,
      spriteSheetRanges: [{ ...firstRange, endSpeciesId: 255 }, secondRange],
    },
    {
      version: 2,
      spriteSheetRanges: [firstRange, { ...secondRange, startSpeciesId: 256 }],
    },
  ];

  for (const invalidManifest of invalidManifests) {
    assert.equal(normalizeBattlePokemonAssetManifest(invalidManifest), null);
  }
});

test("유효한 runtime sprite sheet range는 fallback을 대체해 중복 preload를 만들지 않는다", async () => {
  const runtimeRanges = [
    createRuntimeSpriteSheetRange(1, 250),
    createRuntimeSpriteSheetRange(251, 493),
  ];

  await loadRuntimeGameDataJson(
    createRuntimeGameDataFetcher({
      version: 2,
      spriteSheetRanges: runtimeRanges,
    }),
  );

  try {
    assert.deepEqual(
      getRuntimeBattlePokemonSpriteSheetRanges([...DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES]),
      runtimeRanges,
    );

    const preloadAssets = toBattlePokemonPreloadAssets();

    assert.equal(preloadAssets.length, 4);
    assert.equal(new Set(preloadAssets.map(asset => asset.assetKey)).size, 4);
    assert.deepEqual(
      preloadAssets.map(asset => asset.path),
      [
        "/assets/pokemon/sheets/front-1-250-runtime.png",
        "/assets/pokemon/sheets/back-1-250-runtime.png",
        "/assets/pokemon/sheets/front-251-493-runtime.png",
        "/assets/pokemon/sheets/back-251-493-runtime.png",
      ],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("전국도감 1번부터 493번까지 고유 sprite frame을 제공한다", () => {
  const first = getBattlePokemonAssets(1);
  const firstRangeEnd = getBattlePokemonAssets(256);
  const secondRangeStart = getBattlePokemonAssets(257);
  const last = getBattlePokemonAssets(493);

  assert.deepEqual(first.front, {
    assetKey: "battle-pokemon-front-1-256",
    path: "/assets/pokemon/sheets/front-1-256.png",
    frame: 0,
    width: 80,
    height: 80,
    columns: 16,
    rows: 16,
  });
  assert.equal(firstRangeEnd.front.frame, 255);
  assert.equal(secondRangeStart.front.frame, 0);
  assert.equal(last.front.frame, 236);
  assert.equal(last.back.assetKey, "battle-pokemon-back-257-493");

  for (let speciesId = 1; speciesId <= 493; speciesId += 1) {
    const assets = getBattlePokemonAssets(speciesId);

    assert.equal(assets.speciesId, speciesId);
    assert.equal(assets.front.width, BATTLE_POKEMON_FRAME_SIZE.width);
    assert.equal(assets.front.height, BATTLE_POKEMON_FRAME_SIZE.height);
    assert.equal(assets.back.frame, assets.front.frame);
    for (const sprite of [assets.front, assets.back]) {
      const bounds = getBattlePokemonAlphaBounds(sprite);
      assert.ok(bounds.width > 0 && bounds.height > 0);
      assert.ok(bounds.x >= 0 && bounds.y >= 0);
      assert.ok(bounds.x + bounds.width <= BATTLE_POKEMON_FRAME_SIZE.width);
      assert.ok(bounds.y + bounds.height <= BATTLE_POKEMON_FRAME_SIZE.height);
    }
  }

  assert.throws(() => getBattlePokemonAssets(494), /Missing battle Pokemon assets/);
});

test("browser-native preload는 중복 없는 네 sprite sheet만 제공한다", () => {
  const preloadAssets = toBattlePokemonPreloadAssets();

  assert.equal(preloadAssets.length, 4);
  assert.equal(new Set(preloadAssets.map(asset => asset.assetKey)).size, 4);
  assert.equal(new Set(preloadAssets.map(asset => asset.path)).size, 4);
  assert.deepEqual(
    preloadAssets.map(asset => asset.endFrame),
    [255, 255, 236, 236],
  );

  for (const asset of preloadAssets) {
    assert.equal(asset.frameWidth, 80);
    assert.equal(asset.frameHeight, 80);
    assert.deepEqual(readPublicPngMetadata(asset.path), {
      width: 1280,
      height: 1280,
      bitDepth: 8,
      colorType: 6,
    });
  }
});

function readPublicPngMetadata(publicPath: string): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
} {
  const filePath = path.join(webRoot, "public", publicPath.replace(/^\//, ""));
  const header = fs.readFileSync(filePath).subarray(16, 26);

  return {
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    bitDepth: header.readUInt8(8),
    colorType: header.readUInt8(9),
  };
}

const createRuntimeSpriteSheetRange = (
  startSpeciesId: number,
  endSpeciesId: number,
): BattlePokemonSpriteSheetRangeRecord => ({
  startSpeciesId,
  endSpeciesId,
  frameWidth: 80,
  frameHeight: 80,
  columns: 16,
  rows: 16,
  front: {
    path: `/assets/pokemon/sheets/front-${startSpeciesId}-${endSpeciesId}-runtime.png`,
  },
  back: {
    path: `/assets/pokemon/sheets/back-${startSpeciesId}-${endSpeciesId}-runtime.png`,
  },
});

const createRuntimeGameDataFetcher =
  (battlePokemonAssetManifest: unknown): typeof fetch =>
  async input => {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;

    if (
      requestPath !== BATTLE_POKEMON_ASSETS_JSON_PATH &&
      requestPath !== POKEMON_DATA_JSON_PATH &&
      requestPath !== LEVEL_UP_MOVE_TABLE_JSON_PATH &&
      requestPath !== WILD_BATTLE_MOVE_SETS_JSON_PATH
    ) {
      return new Response(null, { status: 404 });
    }

    const responseData =
      requestPath === BATTLE_POKEMON_ASSETS_JSON_PATH
        ? battlePokemonAssetManifest
        : JSON.parse(
            fs.readFileSync(path.join(webRoot, "public", requestPath.replace(/^\//, "")), "utf8"),
          );

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

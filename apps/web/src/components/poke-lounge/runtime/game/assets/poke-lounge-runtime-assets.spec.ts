import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadPokeLoungeRuntimeAssets,
  type PokeLoungeAssetLoadProgress,
} from "./poke-lounge-runtime-assets";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import { FIELD_MAP } from "../world/field-map";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test("browser-native loader는 런타임 시작 전에 필수 JSON, 이미지, 오디오를 모두 준비한다", async function testCase() {
  const fetcher = createPublicAssetFetcher();
  const runtimeGameData = await loadRuntimeGameDataJson(fetcher);
  const loadedImagePaths = new Set<string>();
  const progressEvents: PokeLoungeAssetLoadProgress[] = [];

  try {
    const assets = await loadPokeLoungeRuntimeAssets({
      runtimeGameData,
      fetcher,
      imageLoader: async imagePath => {
        loadedImagePaths.add(imagePath);
        return { src: imagePath } as HTMLImageElement;
      },
      onProgress: nextProgress => {
        progressEvents.push(nextProgress);
      },
    });

    assert.equal(assets.audioBuffers.size, 8);
    assert.equal(assets.images.size, 10);
    assert.equal(assets.json.size, 9);
    assert.equal(assets.spriteSheets.length, 4);
    assert.equal(loadedImagePaths.size, 14);
    assert.ok(loadedImagePaths.has(FIELD_MAP.tilesetUrl));
    assert.ok(loadedImagePaths.has(FIELD_MAP.player.atlasUrl));
    const progress = progressEvents.at(-1);
    assert.ok(progress);
    assert.equal(progress.loaded, progress.total);
    assert.equal(progress.ratio, 1);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("필수 map JSON이 실패하면 image 등록 전 로딩을 중단한다", async function testCase() {
  const publicFetcher = createPublicAssetFetcher();
  const runtimeGameData = await loadRuntimeGameDataJson(publicFetcher);
  let imageLoadCount = 0;

  try {
    await assert.rejects(
      loadPokeLoungeRuntimeAssets({
        runtimeGameData,
        fetcher: async (input, init) =>
          readRequestPath(input) === FIELD_MAP.mapUrl
            ? new Response(null, { status: 404 })
            : publicFetcher(input, init),
        imageLoader: async imagePath => {
          imageLoadCount += 1;
          return { src: imagePath } as HTMLImageElement;
        },
      }),
      new RegExp(FIELD_MAP.mapUrl),
    );
    assert.equal(imageLoadCount, 0);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

function createPublicAssetFetcher(): typeof fetch {
  return async function callback(input) {
    const publicPath = readRequestPath(input);
    const filePath = path.join(webRoot, "public", publicPath.replace(/^\//, ""));

    try {
      return new Response(fs.readFileSync(filePath), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

function readRequestPath(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.pathname;
  }
  if (typeof input === "string") {
    return new URL(input, "http://localhost").pathname;
  }
  return new URL(input.url, "http://localhost").pathname;
}

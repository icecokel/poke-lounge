import { canonicalize } from "@poke-lounge/battle/canonical-json";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { getExperienceForLevel } from "../battle/experience";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../testing/runtime-rom-data.fixture";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  POKE_LOUNGE_SHOP_ITEMS_API_PATHS,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  getRuntimeGrowthExperienceTable,
  getRuntimeItemDetails,
  getRuntimeShopItemRomIds,
  getRuntimePokemonMoveSummary,
  getRuntimePokemonSpeciesSummary,
  loadRuntimeShopItemRomIds,
  loadRuntimeGameDataJson,
  registerRuntimeShopItemRomIds,
  resetRuntimeGameDataJsonStateForTest,
} from "./game-data-json";

let validRomData: Awaited<ReturnType<typeof createRuntimeRomDataFixture>>;

test.before(async function callback() {
  validRomData = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
});

test.afterEach(resetRuntimeGameDataJsonStateForTest);

test("ROM API 번들로 포켓몬·아이템·기술·경험치 데이터를 등록한다", async function testCase() {
  const fetchedPaths: string[] = [];

  await loadRuntimeGameDataJson(
    function callback(input) {
      const requestPath = readRequestPath(input);
      fetchedPaths.push(requestPath);
      return fetchPublicGameDataFixture(input);
    },
    function callback() {
      return Promise.resolve(validRomData);
    },
  );

  assert.deepEqual(
    fetchedPaths.sort(),
    [WILD_BATTLE_MOVE_SETS_JSON_PATH, BATTLE_POKEMON_ASSETS_JSON_PATH].sort(),
  );
  assert.equal(getRuntimePokemonSpeciesSummary(152)?.name, "치코리타");
  assert.equal(getRuntimePokemonMoveSummary(33)?.name, "몸통박치기");
  assert.equal(getRuntimeItemDetails(1)?.name, "마스터볼");
  assert.throws(function callback() {
    return getRuntimeShopItemRomIds("basic");
  }, /not loaded/);

  const requestedPaths: Partial<Record<"basic" | "premium", string>> = {};
  const [basicItemIds, premiumItemIds] = await Promise.all([
    loadRuntimeShopItemRomIds("basic", function callback(path) {
      requestedPaths.basic = path;
      return Promise.resolve([17, 4, 18, 26]);
    }),
    loadRuntimeShopItemRomIds("premium", function callback(path) {
      requestedPaths.premium = path;
      return Promise.resolve([80, 81, 82, 83, 84, 85, 107, 108, 109, 25, 28, 2, 50]);
    }),
  ]);
  registerRuntimeShopItemRomIds("basic", basicItemIds);
  registerRuntimeShopItemRomIds("premium", premiumItemIds);

  assert.deepEqual(requestedPaths, POKE_LOUNGE_SHOP_ITEMS_API_PATHS);
  assert.deepEqual(getRuntimeShopItemRomIds("basic"), [17, 4, 18, 26]);
  assert.deepEqual(
    getRuntimeShopItemRomIds("premium"),
    [80, 81, 82, 83, 84, 85, 107, 108, 109, 25, 28, 2, 50],
  );
  assert.equal(getExperienceForLevel(10, 0), 1000);
});

test("상점 API의 비었거나 중복된 판매 목록은 등록하지 않는다", async function testCase() {
  await loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
    return Promise.resolve(validRomData);
  });

  for (const response of [{}, [], [17, 17], [17.5]]) {
    await assert.rejects(
      loadRuntimeShopItemRomIds("basic", function callback() {
        return Promise.resolve(response);
      }),
      /shop catalog response is invalid/,
    );
    assert.throws(function callback() {
      return getRuntimeShopItemRomIds("basic");
    }, /not loaded/);
  }
});

test("상점 API의 게임 미지원 판매 아이템은 등록하지 않는다", async function testCase() {
  await loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
    return Promise.resolve(validRomData);
  });

  await assert.rejects(
    loadRuntimeShopItemRomIds("basic", function callback() {
      return Promise.resolve([1]);
    }),
    /shop catalog response is invalid/,
  );
  assert.throws(function callback() {
    return getRuntimeShopItemRomIds("basic");
  }, /not loaded/);
});

test("비었거나 무결하지 않은 ROM API 응답은 정적 데이터로 우회하지 않는다", async function testCase() {
  const missingDocument = structuredClone(validRomData);
  missingDocument.documents.pop();
  const wrongHash = structuredClone(validRomData);
  Reflect.set(wrongHash.documents[0], "contentSha256", "not-a-sha");
  const malformedPayload = structuredClone(validRomData);
  malformedPayload.documents[0].payload = {};
  const stalePayloadHash = structuredClone(validRomData);
  const stalePokemonData = readPokemonData(stalePayloadHash);
  Reflect.set(stalePokemonData, "integrityProbe", true);

  for (const response of [{}, missingDocument, wrongHash, malformedPayload, stalePayloadHash]) {
    await assert.rejects(
      loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
        return Promise.resolve(response);
      }),
      /ROM data response is invalid/,
    );
    assert.throws(function callback() {
      return getRuntimeGrowthExperienceTable(0);
    }, /not loaded/);
  }
});

test("정규 기술 이름 누락과 내부 기술 이름 추가를 거부한다", async function testCase() {
  for (const mutate of [
    function removePlayableMoveName(moves: Record<string, Record<string, unknown>>) {
      delete moves["15"].name;
    },
    function addInternalMoveName(moves: Record<string, Record<string, unknown>>) {
      moves["468"].name = "내부 기술";
    },
  ]) {
    const response = structuredClone(validRomData);
    mutate(readPokemonData(response).moves);
    refreshPokemonDataHash(response);

    await assert.rejects(
      loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
        return Promise.resolve(response);
      }),
      /runtime game data is incomplete/,
    );
  }
});

test("잘못된 기술 상세 필드는 보정하지 않고 ROM 데이터를 거부한다", async function testCase() {
  for (const [field, value] of [
    ["id", 34],
    ["rawHex", "00"],
    ["power", "broken"],
    ["pp", 0],
    ["accuracy", 101],
    ["typeId", 18],
    ["typeName", "불꽃"],
    ["category", "unknown"],
    ["categoryId", 3],
    ["effectCode", 277],
    ["effectChance", -1],
    ["range", 3],
    ["priority", 6],
    ["flags", 256],
    ["contestEffect", 24],
    ["contestType", 5],
    ["unknown14", 1],
  ] as const) {
    const response = structuredClone(validRomData);
    readPokemonData(response).moves["33"][field] = value;
    refreshPokemonDataHash(response);

    await assert.rejects(
      loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
        return Promise.resolve(response);
      }),
      /runtime game data is incomplete/,
    );
  }
});

test("ROM API 요청 오류를 그대로 노출하고 이전 런타임 상태를 지운다", async function testCase() {
  await loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
    return Promise.resolve(validRomData);
  });

  await assert.rejects(
    loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
      return Promise.reject(new Error("ROM API 503"));
    }),
    /ROM API 503/,
  );
  assert.throws(function callback() {
    return getRuntimeGrowthExperienceTable(0);
  }, /not loaded/);
});

test("한 상점 API 오류는 게임 데이터와 다른 상점 목록을 지우지 않는다", async function testCase() {
  await loadRuntimeGameDataJson(fetchPublicGameDataFixture, function callback() {
    return Promise.resolve(validRomData);
  });
  const premiumItemIds = await loadRuntimeShopItemRomIds("premium", function callback() {
    return Promise.resolve([80]);
  });
  registerRuntimeShopItemRomIds("premium", premiumItemIds);

  await assert.rejects(
    loadRuntimeShopItemRomIds("basic", function callback() {
      return Promise.reject(new Error("Basic shop API 503"));
    }),
    /Basic shop API 503/,
  );
  assert.equal(getRuntimeItemDetails(1)?.name, "마스터볼");
  assert.deepEqual(getRuntimeShopItemRomIds("premium"), [80]);
  assert.throws(function callback() {
    return getRuntimeShopItemRomIds("basic");
  }, /not loaded/);
});

function readRequestPath(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.pathname
      : new URL(input.url).pathname;
}

function readPokemonData(response: typeof validRomData): {
  moves: Record<string, Record<string, unknown>>;
} {
  const document = response.documents.find(function findItem(candidate) {
    return candidate.documentKey === "pokemon-data";
  });
  assert.ok(document);
  return document.payload as { moves: Record<string, Record<string, unknown>> };
}

function refreshPokemonDataHash(response: typeof validRomData): void {
  const document = response.documents.find(function findItem(candidate) {
    return candidate.documentKey === "pokemon-data";
  });
  assert.ok(document);
  document.contentSha256 = createHash("sha256")
    .update(canonicalize(document.payload), "utf8")
    .digest("hex");
}

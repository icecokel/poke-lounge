import assert from "node:assert/strict";
import test from "node:test";
import { getExperienceForLevel } from "../battle/experience";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../testing/runtime-rom-data.fixture";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  getRuntimeGrowthExperienceTable,
  getRuntimeItemDetails,
  getRuntimePokemonMoveSummary,
  getRuntimePokemonSpeciesSummary,
  loadRuntimeGameDataJson,
  resetRuntimeGameDataJsonStateForTest,
} from "./game-data-json";

let validRomData: Awaited<ReturnType<typeof createRuntimeRomDataFixture>>;

test.before(async () => {
  validRomData = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
});

test.afterEach(resetRuntimeGameDataJsonStateForTest);

test("ROM API 번들로 포켓몬·아이템·기술·경험치 데이터를 등록한다", async () => {
  const fetchedPaths: string[] = [];

  await loadRuntimeGameDataJson(
    input => {
      const requestPath = readRequestPath(input);
      fetchedPaths.push(requestPath);
      return fetchPublicGameDataFixture(input);
    },
    () => Promise.resolve(validRomData),
  );

  assert.deepEqual(
    fetchedPaths.sort(),
    [WILD_BATTLE_MOVE_SETS_JSON_PATH, BATTLE_POKEMON_ASSETS_JSON_PATH].sort(),
  );
  assert.equal(getRuntimePokemonSpeciesSummary(152)?.name, "치코리타");
  assert.equal(getRuntimePokemonMoveSummary(33)?.name, "몸통박치기");
  assert.equal(getRuntimeItemDetails(1)?.name, "마스터볼");
  assert.equal(getExperienceForLevel(10, 0), 1000);
});

test("비었거나 무결하지 않은 ROM API 응답은 정적 데이터로 우회하지 않는다", async () => {
  const missingDocument = structuredClone(validRomData);
  missingDocument.documents.pop();
  const wrongHash = structuredClone(validRomData);
  Reflect.set(wrongHash.documents[0], "contentSha256", "not-a-sha");
  const malformedPayload = structuredClone(validRomData);
  malformedPayload.documents[0].payload = {};

  for (const response of [{}, missingDocument, wrongHash, malformedPayload]) {
    await assert.rejects(
      loadRuntimeGameDataJson(fetchPublicGameDataFixture, () => Promise.resolve(response)),
      /ROM data response is invalid/,
    );
    assert.throws(() => getRuntimeGrowthExperienceTable(0), /not loaded/);
  }
});

test("ROM API 요청 오류를 그대로 노출하고 이전 런타임 상태를 지운다", async () => {
  await loadRuntimeGameDataJson(fetchPublicGameDataFixture, () => Promise.resolve(validRomData));

  await assert.rejects(
    loadRuntimeGameDataJson(fetchPublicGameDataFixture, () => Promise.reject(new Error("API 503"))),
    /API 503/,
  );
  assert.throws(() => getRuntimeGrowthExperienceTable(0), /not loaded/);
});

function readRequestPath(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.pathname
      : new URL(input.url).pathname;
}

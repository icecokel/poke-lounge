import assert from "node:assert/strict";
import test from "node:test";
import { createWildEncounterLevelRange } from "./wild-encounters";

test("야생 포켓몬 레벨은 파티 평균보다 높지 않고 최대 5레벨 낮게 설정한다", function testCase() {
  assert.deepEqual(createWildEncounterLevelRange(12), {
    minLevel: 7,
    maxLevel: 12,
  });
});

test("낮은 파티 평균에서는 야생 포켓몬 최저 레벨을 1로 제한한다", function testCase() {
  assert.deepEqual(createWildEncounterLevelRange(3), {
    minLevel: 1,
    maxLevel: 3,
  });
});

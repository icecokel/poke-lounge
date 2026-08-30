import assert from "node:assert/strict";
import test from "node:test";
import { calculateWildBattleExpGain, WILD_BATTLE_EXPERIENCE_MULTIPLIER } from "./experience";

test("야생 포켓몬 경험치는 기존 정수 획득량의 5배를 지급한다", () => {
  assert.equal(WILD_BATTLE_EXPERIENCE_MULTIPLIER, 5);
  assert.equal(calculateWildBattleExpGain({ baseExpYield: 65, defeatedLevel: 10 }), 460);
  assert.equal(calculateWildBattleExpGain({ baseExpYield: 1, defeatedLevel: 1 }), 5);
});

test("경험치를 주지 않는 포켓몬은 배율 적용 후에도 0을 지급한다", () => {
  assert.equal(calculateWildBattleExpGain({ baseExpYield: 0, defeatedLevel: 10 }), 0);
});

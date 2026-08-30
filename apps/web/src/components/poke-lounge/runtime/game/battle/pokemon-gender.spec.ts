import assert from "node:assert/strict";
import test from "node:test";
import { createPokemonGenderFromRatio } from "./pokemon-gender";

test("성비 경계값은 수컷·암컷·무성 포켓몬을 확정한다", () => {
  assert.equal(createPokemonGenderFromRatio(0), "male");
  assert.equal(createPokemonGenderFromRatio(254), "female");
  assert.equal(createPokemonGenderFromRatio(255), "genderless");
});

test("혼합 성비는 personal gender_ratio 임계값으로 성별을 생성한다", () => {
  assert.equal(
    createPokemonGenderFromRatio(127, () => 0),
    "female",
  );
  assert.equal(
    createPokemonGenderFromRatio(127, () => 0.9),
    "male",
  );
});

test("구버전 저장처럼 성비를 알 수 없으면 성별을 강제로 만들지 않는다", () => {
  assert.equal(createPokemonGenderFromRatio(undefined), undefined);
  assert.equal(createPokemonGenderFromRatio(-1), undefined);
  assert.equal(createPokemonGenderFromRatio(256), undefined);
});

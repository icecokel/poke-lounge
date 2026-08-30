import assert from "node:assert/strict";
import test from "node:test";
import { formatPartyHudPokemonName } from "./world-scene-hud";

test("파티 HUD는 여섯 글자 종 이름을 그대로 표시한다", () => {
  assert.equal(formatPartyHudPokemonName("가나다라마바"), "가나다라마바");
});

test("파티 HUD는 여섯 글자를 넘는 종 이름을 말줄임한다", () => {
  assert.equal(formatPartyHudPokemonName("가나다라마바사"), "가나다라마…");
});

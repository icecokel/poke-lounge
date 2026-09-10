import assert from "node:assert/strict";
import test from "node:test";
import { BATTLE_END_CONFIRM_MESSAGE } from "@poke-lounge/battle/adventure/battle/battle-logic";
import { createSampleBattleState } from "@/components/poke-lounge/runtime/game/battle/battle-sample-state";
import { localizeRuntimeText } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import { formatBattleResultMessage } from "./result-message";
import { freeze } from "../../testing/freeze";

import { loadPublicRuntimeGameDataFixture } from "@/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
test.before(loadPublicRuntimeGameDataFixture);

function caught() {
  const state = createSampleBattleState();
  state.messageQueue = [BATTLE_END_CONFIRM_MESSAGE];
  state.result = {
    winnerPlayerId: state.player.playerId,
    loserPlayerId: state.opponent.playerId,
    reason: "capture",
    capturedPokemon: { ...state.opponent.pokemon, name: "리아코" },
  };
  return state;
}
test("포획 성공 요약은 종과 파티 목적지를 확인할 때까지 표시하되 큐를 바꾸지 않는다", () => {
  const state = caught();
  const before = structuredClone(state);
  freeze(state);
  const text = formatBattleResultMessage(state, true)!;
  assert.match(text, /포획 성공: 리아코/);
  assert.match(text, /파티에 합류/);
  assert.deepEqual(state, before);
  assert.equal(state.messageQueue[0], BATTLE_END_CONFIRM_MESSAGE);
});
test("파티가 가득 차면 포획 요약에 PC 전송을 안내한다", () => {
  assert.match(formatBattleResultMessage(caught(), false)!, /PC 박스로 전송/);
});
test("진행 중 메시지와 결과 없는 확인 문구는 성공으로 바꾸지 않는다", () => {
  const state = caught();
  state.messageQueue = ["몬스터볼을 던졌다!"];
  assert.equal(formatBattleResultMessage(state, true), "몬스터볼을 던졌다!");
  state.messageQueue = [BATTLE_END_CONFIRM_MESSAGE];
  state.result = null;
  assert.equal(formatBattleResultMessage(state, true), BATTLE_END_CONFIRM_MESSAGE);
  state.messageQueue = [];
  assert.equal(formatBattleResultMessage(state, true), null);
});
test("승리·패배·도주를 구분하고 포획 실패에 성공 요약을 사용하지 않는다", () => {
  const state = caught();
  state.result!.reason = "faint";
  assert.match(formatBattleResultMessage(state, true)!, /^승리했습니다/);
  state.result!.winnerPlayerId = state.opponent.playerId;
  assert.match(formatBattleResultMessage(state, true)!, /^패배했습니다/);
  state.result!.reason = "run";
  state.result!.winnerPlayerId = state.player.playerId;
  assert.match(formatBattleResultMessage(state, true)!, /^무사히 도망/);
});
test("포획 요약과 목적지는 영어·일본어에서도 한국어가 남지 않는다", () => {
  for (const locale of ["en-US", "ja-JP"]) {
    for (const space of [true, false]) {
      const text = localizeRuntimeText(formatBattleResultMessage(caught(), space)!, locale);
      assert.doesNotMatch(text, /[가-힣]/);
      assert.match(text, locale === "en-US" ? /Caught: Totodile/ : /捕獲成功: ワニノコ/);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { localizeRuntimeText } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import { formatFieldInteractionKey, formatShopPurchaseMessage } from "./interaction-copy";

test("모바일 NPC 안내는 실제 대화 버튼을, 키보드는 유효한 확인 키를 설명한다", () => {
  assert.equal(formatFieldInteractionKey(true), "대화");
  assert.equal(formatFieldInteractionKey(false), "Enter / Space / Z");
  for (const action of [
    "기본 상점",
    "희귀 상점",
    "PC 박스",
    "파티 회복",
    "솔로 챌린지",
    "주사위 겜블",
  ]) {
    const text = `${formatFieldInteractionKey(true)} · ${action}`;
    assert.match(localizeRuntimeText(text, "en-US"), /^Talk · /);
    assert.match(localizeRuntimeText(text, "ja-JP"), /^話す · /);
    assert.doesNotMatch(localizeRuntimeText(text, "en-US"), /[가-힣]/);
    assert.doesNotMatch(localizeRuntimeText(text, "ja-JP"), /[가-힣]/);
  }
});
test("상품 이름의 받침에 관계없이 구매 완료 문구와 번역이 올바르다", () => {
  for (const item of ["해독제", "상처약", "몬스터볼"]) {
    const text = formatShopPurchaseMessage(item);
    assert.equal(text, `구매 완료: ${item}`);
    assert.doesNotMatch(localizeRuntimeText(text, "en-US"), /[가-힣]/);
    assert.doesNotMatch(localizeRuntimeText(text, "ja-JP"), /[가-힣]/);
  }
});

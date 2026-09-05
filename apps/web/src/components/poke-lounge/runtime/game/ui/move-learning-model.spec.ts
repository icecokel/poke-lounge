import assert from "node:assert/strict";
import test from "node:test";
import {
  createMoveReplacementConfirmation,
  isMoveReplacementConfirmationCurrent,
} from "./move-learning-model";
import { getMoveLearningCopy } from "./move-learning-copy";
import { getRoomControlsCopy } from "./room-controls-copy";
import { createShortcutGuideRows } from "./shortcut-guide";

test("교체 후보를 선택해도 기존 기술과 새 기술 데이터는 바뀌지 않는다", function testCase() {
  const moves = [
    { id: 33, pp: 0 },
    { id: 108, pp: 20 },
  ];
  const incoming = { id: 172, pp: 25 };
  const before = structuredClone({ moves, incoming });
  const confirmation = createMoveReplacementConfirmation(moves, incoming, 1);
  assert.deepEqual(confirmation, { index: 1, oldMoveId: 108, newMoveId: 172 });
  assert.deepEqual({ moves, incoming }, before);
  assert.equal(isMoveReplacementConfirmationCurrent(confirmation, moves, incoming), true);
  assert.equal(isMoveReplacementConfirmationCurrent(null, moves, incoming), false);
});
test("취소되거나 기술 목록이 바뀐 확인으로는 승인할 수 없다", function testCase() {
  const moves = [{ id: 33 }, { id: 108 }];
  const confirmation = createMoveReplacementConfirmation(moves, { id: 172 }, 1);
  assert.equal(
    isMoveReplacementConfirmationCurrent(confirmation, [{ id: 33 }, { id: 45 }], { id: 172 }),
    false,
  );
  assert.equal(isMoveReplacementConfirmationCurrent(confirmation, moves, { id: 53 }), false);
  assert.equal(isMoveReplacementConfirmationCurrent(confirmation, [], { id: 172 }), false);
  assert.equal(isMoveReplacementConfirmationCurrent(null, moves, { id: 172 }), false);
});
test("잘못된 선택은 확인 단계에 진입하지 않는다", function testCase() {
  for (const index of [-1, 2, 0.5, NaN, Infinity]) {
    assert.equal(createMoveReplacementConfirmation([{ id: 33 }], { id: 172 }, index), null);
  }
  assert.equal(createMoveReplacementConfirmation([{ id: 33 }], null, 0), null);
});
test("사용 불가능한 PP 0 기술도 잊을 기술로 선택할 수 있다", function testCase() {
  const moves = [{ id: 33, pp: 0 }];
  assert.ok(createMoveReplacementConfirmation(moves, { id: 172 }, 0));
});
for (const locale of ["ko-KR", "en-US", "ja-JP"] as const) {
  test(`기술 확인과 대기방 조작법은 ${locale}를 지원한다`, function testCase() {
    const learning = getMoveLearningCopy(locale);
    const question = learning.question("Pokemon", "OldMove", "NewMove");
    assert.match(question, /Pokemon/);
    assert.match(question, /OldMove/);
    assert.match(question, /NewMove/);
    assert.notEqual(learning.confirm, learning.cancel);
    assert.ok(getRoomControlsCopy(locale).open);
    for (const mode of ["keyboard", "touch"] as const) {
      for (const context of ["world", "battle"] as const) {
        assert.ok(createShortcutGuideRows(context, mode, locale).length >= 4);
      }
    }
  });
}

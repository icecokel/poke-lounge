import assert from "node:assert/strict";
import test from "node:test";
import { isMobileBattleMoveDisabled } from "./mobile-battle-ui";

test("PP가 0인 기술도 기술 교체 화면에서는 잊을 수 있다", function testCase() {
  assert.equal(isMobileBattleMoveDisabled("move-select", 0), true);
  assert.equal(isMobileBattleMoveDisabled("move-replace-select", 0), false);
  assert.equal(isMobileBattleMoveDisabled("move-replace-select", 10), false);
});

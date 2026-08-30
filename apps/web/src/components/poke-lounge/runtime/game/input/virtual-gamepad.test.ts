import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeVirtualGamepadPress,
  isVirtualGamepadPressed,
  resetVirtualGamepad,
  setVirtualGamepadButtonHeld,
} from "./virtualGamepad";

test("필드 조이스틱의 방향 전환은 메뉴용 단발 입력을 남기지 않는다", () => {
  resetVirtualGamepad();

  setVirtualGamepadButtonHeld("up", true);
  assert.equal(isVirtualGamepadPressed("up"), true);
  assert.equal(consumeVirtualGamepadPress("up"), false);

  setVirtualGamepadButtonHeld("up", false);
  setVirtualGamepadButtonHeld("right", true);
  assert.equal(isVirtualGamepadPressed("up"), false);
  assert.equal(isVirtualGamepadPressed("right"), true);
  assert.equal(consumeVirtualGamepadPress("up"), false);
  assert.equal(consumeVirtualGamepadPress("right"), false);

  resetVirtualGamepad();
});

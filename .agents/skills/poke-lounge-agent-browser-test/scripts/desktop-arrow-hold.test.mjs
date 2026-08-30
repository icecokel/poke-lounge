import assert from "node:assert/strict";
import test from "node:test";

import { createArrowEvent } from "./desktop-arrow-hold.mjs";

test("creates physical ArrowLeft stream events", () => {
  assert.deepEqual(createArrowEvent("keyDown", "ArrowLeft"), {
    type: "input_keyboard",
    eventType: "keyDown",
    key: "ArrowLeft",
    code: "ArrowLeft",
    windowsVirtualKeyCode: 37,
    nativeVirtualKeyCode: 37,
  });
  assert.throws(() => createArrowEvent("keyDown", "a"), /Unsupported arrow key/);
});

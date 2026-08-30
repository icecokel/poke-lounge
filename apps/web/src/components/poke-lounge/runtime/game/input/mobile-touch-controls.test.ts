import assert from "node:assert/strict";
import test from "node:test";
import { detectTouchGameDevice } from "./mobileTouchControls";

test("mobile WebKit은 maxTouchPoints가 0이어도 coarse pointer면 터치 UI를 사용한다", () => {
  assert.equal(
    detectTouchGameDevice({
      maxTouchPoints: 0,
      coarsePointer: true,
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    }),
    true,
  );
});

test("coarse pointer인 데스크톱은 터치 UI를 사용하지 않는다", () => {
  assert.equal(
    detectTouchGameDevice({
      maxTouchPoints: 0,
      coarsePointer: true,
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    }),
    false,
  );
});

test("touch point와 coarse pointer가 없는 모바일 UA는 터치 UI를 사용하지 않는다", () => {
  assert.equal(
    detectTouchGameDevice({
      maxTouchPoints: 0,
      coarsePointer: false,
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
    }),
    false,
  );
});

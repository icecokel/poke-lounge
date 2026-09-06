import assert from "node:assert/strict";
import test from "node:test";
import { calculateMobilePlayLayout } from "./mobile-play-layout";

test("가용 공간이 같으면 이전 방향이나 게임 단계와 무관하게 같은 배치를 만든다", () => {
  const input = { width: 390, height: 612, statusHeight: 50 };
  const before = calculateMobilePlayLayout(input);
  calculateMobilePlayLayout({ width: 900, height: 480, statusHeight: 50 });
  assert.deepEqual(calculateMobilePlayLayout(input), before);
  assert.equal(before.mode, "stacked");
});

test("세로 태블릿은 쌓고 좁은 가로·분할 창은 실제 확보 가능한 공간으로 판단한다", () => {
  const layout = (width: number, height: number) =>
    calculateMobilePlayLayout({ width, height: height - 32, statusHeight: 50 });
  assert.equal(layout(768, 1024).mode, "stacked");
  assert.equal(layout(768, 700).mode, "split");
  assert.equal(layout(667, 375).mode, "split");
  assert.equal(layout(568, 320).mode, "split");
  assert.equal(layout(480, 700).mode, "stacked");
});

test("연속 크기·글자 확대에서도 3:4, 비중첩, 최소 조작 폭을 보존한다", () => {
  for (const fontSize of [16, 24, 32]) {
    for (let width = 280; width <= 1400; width += 17) {
      for (let height = 260; height <= 1100; height += 19) {
        const layout = calculateMobilePlayLayout({ width, height, statusHeight: 50, fontSize });
        const epsilon = 0.0001;
        assert.ok(layout.width <= width + epsilon);
        assert.ok(Math.abs(layout.frameWidth / layout.frameHeight - 3 / 4) < epsilon);
        assert.ok(layout.controllerHeight > 0);
        const totalHeight =
          layout.statusHeight +
          (layout.mode === "split"
            ? layout.gap + Math.max(layout.frameHeight, layout.controllerHeight)
            : 2 * layout.gap + layout.frameHeight + layout.controllerHeight);
        assert.ok(totalHeight <= height + epsilon);
        if (layout.mode === "split") {
          assert.ok(layout.controllerWidth >= 280);
          assert.ok(layout.frameWidth + layout.gap + layout.controllerWidth <= width + epsilon);
        }
      }
    }
  }
});

test("0 크기·중간 리사이즈 값도 유한한 음수 없는 배치를 반환한다", () => {
  for (const width of [0, -1, Number.NaN, 390]) {
    for (const height of [0, -1, Number.POSITIVE_INFINITY, 100]) {
      const layout = calculateMobilePlayLayout({ width, height, statusHeight: 56 });
      for (const value of Object.values(layout)) {
        if (typeof value === "number") assert.ok(Number.isFinite(value) && value >= 0);
      }
    }
  }
});

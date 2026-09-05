import assert from "node:assert/strict";
import test from "node:test";
import type { CSSProperties } from "react";
import { GAME_VIEWPORT_SIZE_PRESETS, MOBILE_GAME_VIEWPORT_SIZE } from "../game-viewport";
import { BATTLE_LAYOUT } from "./battle-layout";
import {
  DESKTOP_BATTLE_STAGE_LAYOUT,
  MOBILE_BATTLE_STAGE_LAYOUT,
  toBattlePointStyle,
  toBattleRectStyle,
  toCenteredBattleRectStyle,
  type BattleStageLayout,
} from "./battle-stage-layout";

function percent(value: CSSProperties["width"]): number {
  return Number.parseFloat(String(value)) / 100;
}

function bounds(style: CSSProperties, layout: BattleStageLayout) {
  return {
    x: percent(style.left) * layout.width,
    y: percent(style.top) * layout.height,
    width: percent(style.width) * layout.width,
    height: percent(style.height) * layout.height,
  };
}

test("모바일 카메라만 정사각형으로 확장하고 데스크톱 4:3은 유지한다", function testCase() {
  assert.deepEqual(MOBILE_GAME_VIEWPORT_SIZE, { width: 384, height: 384 });
  for (const size of Object.values(GAME_VIEWPORT_SIZE_PRESETS)) {
    assert.equal(size.width / size.height, 4 / 3);
  }
});

test("데스크톱 전투 좌표와 크기는 기존 256x192 기준을 유지한다", function testCase() {
  const rect = BATTLE_LAYOUT.playerHpPanel;
  const panel = bounds(toBattleRectStyle(rect), DESKTOP_BATTLE_STAGE_LAYOUT);
  for (const key of ["x", "y", "width", "height"] as const) {
    assert.ok(Math.abs(panel[key] - rect[key]) < 1e-9);
  }
  const sprite = BATTLE_LAYOUT.playerSprite;
  const rendered = bounds(toCenteredBattleRectStyle(sprite), DESKTOP_BATTLE_STAGE_LAYOUT);
  assert.equal(rendered.x + rendered.width / 2, sprite.x);
  assert.equal(rendered.y + rendered.height / 2, sprite.y);
  assert.equal(rendered.width, sprite.width);
  assert.ok(Math.abs(rendered.height - sprite.height) < 1e-9);
});

test("정사각형 전투에서 스프라이트와 HP 패널은 위치만 옮기고 종횡비를 유지한다", function testCase() {
  const layout = MOBILE_BATTLE_STAGE_LAYOUT;
  for (const sprite of [BATTLE_LAYOUT.playerSprite, BATTLE_LAYOUT.opponentSprite]) {
    const rendered = bounds(toCenteredBattleRectStyle(sprite, layout), layout);
    assert.equal(rendered.width, sprite.width);
    assert.ok(Math.abs(rendered.height - sprite.height) < 1e-9);
    assert.ok(rendered.x >= 0 && rendered.y >= 0);
    assert.ok(rendered.x + rendered.width <= layout.width);
    assert.ok(rendered.y + rendered.height <= layout.height);
  }
  for (const panel of [BATTLE_LAYOUT.playerHpPanel, BATTLE_LAYOUT.opponentHpPanel]) {
    const rendered = bounds(toBattleRectStyle(panel, layout), layout);
    assert.equal(rendered.width, panel.width);
    assert.equal(rendered.height, panel.height);
    assert.ok(rendered.y + rendered.height < layout.height);
  }
});

test("포획/등장/회복 효과는 재배치된 포켓몬의 중심 좌표를 공유한다", function testCase() {
  for (const layout of [DESKTOP_BATTLE_STAGE_LAYOUT, MOBILE_BATTLE_STAGE_LAYOUT]) {
    for (const sprite of [BATTLE_LAYOUT.playerSprite, BATTLE_LAYOUT.opponentSprite]) {
      const point = toBattlePointStyle(sprite, layout);
      const rendered = bounds(toCenteredBattleRectStyle(sprite, layout), layout);
      assert.ok(
        Math.abs(percent(point.left) * layout.width - rendered.x - rendered.width / 2) < 1e-9,
      );
      assert.ok(
        Math.abs(percent(point.top) * layout.height - rendered.y - rendered.height / 2) < 1e-9,
      );
    }
  }
});

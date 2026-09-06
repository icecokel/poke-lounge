import assert from "node:assert/strict";
import test from "node:test";
import type { CSSProperties } from "react";
import { GAME_VIEWPORT_SIZE_PRESETS, MOBILE_GAME_VIEWPORT_SIZE } from "../game-viewport";
import { getVisibleBoundsAlignedBattleSpriteRenderBox } from "../scenes/battle-scene";
import {
  BATTLE_POKEMON_FRAME_SIZE,
  getBattlePokemonAssets,
  getBattlePokemonAlphaBounds,
} from "./battle-pokemon-assets";
import { BATTLE_LAYOUT, type BattleRect } from "./battle-layout";
import {
  DESKTOP_BATTLE_STAGE_LAYOUT,
  MOBILE_BATTLE_STAGE_LAYOUT,
  getBattleHpPanelRect,
  toBattleActorPointStyle,
  toBattlePointStyle,
  toBattleRectStyle,
  toCenteredBattleActorRectStyle,
  toCenteredBattleRectStyle,
  type BattleStageLayout,
} from "./battle-stage-layout";

function percent(value: CSSProperties["width"]): number {
  return Number.parseFloat(String(value)) / 100;
}

function bounds(style: CSSProperties, layout: BattleStageLayout): BattleRect {
  return {
    x: percent(style.left) * layout.width,
    y: percent(style.top) * layout.height,
    width: percent(style.width) * layout.width,
    height: percent(style.height) * layout.height,
  };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const overlaps = (a: BattleRect, b: BattleRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("모바일 카메라와 데스크톱의 가로:세로 4:3은 바꾸지 않는다", () => {
  assert.deepEqual(MOBILE_GAME_VIEWPORT_SIZE, { width: 384, height: 288 });
  for (const size of Object.values(GAME_VIEWPORT_SIZE_PRESETS)) {
    assert.equal(size.width / size.height, 4 / 3);
  }
});

test("데스크톱·진화·파티용 기본 좌표와 크기는 기존 256x192 기준을 유지한다", () => {
  const layout = DESKTOP_BATTLE_STAGE_LAYOUT;
  for (const side of ["opponent", "player"] as const) {
    const rect = BATTLE_LAYOUT[`${side}HpPanel`];
    assert.deepEqual(getBattleHpPanelRect(side, layout), rect);
    const panel = bounds(toBattleRectStyle(rect), layout);
    for (const key of ["x", "y", "width", "height"] as const) close(panel[key], rect[key]);
    const sprite = BATTLE_LAYOUT[`${side}Sprite`];
    assert.deepEqual(toCenteredBattleActorRectStyle(sprite), toCenteredBattleRectStyle(sprite));
    assert.deepEqual(toBattleActorPointStyle(sprite), toBattlePointStyle(sprite));
    const rendered = bounds(toCenteredBattleActorRectStyle(sprite), layout);
    close(rendered.x + rendered.width / 2, sprite.x);
    close(rendered.y + rendered.height / 2, sprite.y);
    close(rendered.width, sprite.width);
    close(rendered.height, sprite.height);
  }
});

test("모바일은 기존 메시지 영역까지 쓰고 포켓몬만 균일하게 12.5% 확대한다", () => {
  const layout = MOBILE_BATTLE_STAGE_LAYOUT;
  assert.equal(layout.width / layout.height, 4 / 3);
  for (const side of ["opponent", "player"] as const) {
    const sprite = BATTLE_LAYOUT[`${side}Sprite`];
    const rendered = bounds(toCenteredBattleActorRectStyle(sprite, layout), layout);
    close(rendered.width, sprite.width * 1.125);
    close(rendered.height, sprite.height * 1.125);
    assert.ok(rendered.x >= 0 && rendered.y >= 0);
    assert.ok(rendered.x + rendered.width <= layout.width);
    assert.ok(rendered.y + rendered.height <= layout.height);
    const panel = bounds(toBattleRectStyle(getBattleHpPanelRect(side, layout), layout), layout);
    close(panel.width, BATTLE_LAYOUT[`${side}HpPanel`].width);
    close(panel.height, BATTLE_LAYOUT[`${side}HpPanel`].height);
  }
  const panel = getBattleHpPanelRect("player", layout);
  assert.ok(panel.y > BATTLE_LAYOUT.bottomWindow.y);
  close(panel.y + panel.height, layout.height - 16);
  const player = bounds(toCenteredBattleActorRectStyle(BATTLE_LAYOUT.playerSprite, layout), layout);
  close(player.y + player.height, layout.height - 16);
});

test("포획·등장·회복 효과와 축소 중인 포켓몬은 같은 변환 중심을 공유한다", () => {
  for (const layout of [DESKTOP_BATTLE_STAGE_LAYOUT, MOBILE_BATTLE_STAGE_LAYOUT]) {
    for (const slot of [BATTLE_LAYOUT.playerSprite, BATTLE_LAYOUT.opponentSprite]) {
      for (const scale of [1, 0.75, 0.2, 0]) {
        const sprite = {
          ...slot,
          x: slot.x + 3,
          width: slot.width * scale,
          height: slot.height * scale,
        };
        const point = toBattleActorPointStyle(sprite, layout);
        const rendered = bounds(toCenteredBattleActorRectStyle(sprite, layout), layout);
        close(percent(point.left) * layout.width, rendered.x + rendered.width / 2);
        close(percent(point.top) * layout.height, rendered.y + rendered.height / 2);
      }
    }
  }
});

test("파이리 뒷모습의 투명 여백을 포함한 프레임도 하단에 잘리지 않는다", () => {
  const layout = MOBILE_BATTLE_STAGE_LAYOUT;
  const sprite = { x: 64, y: 115, width: 80, height: 80 };
  const rendered = bounds(toCenteredBattleActorRectStyle(sprite, layout), layout);
  assert.ok(rendered.y >= 0);
  assert.ok(rendered.y + rendered.height <= layout.height);
  close(rendered.width, rendered.height);
  const effect = toBattleActorPointStyle(sprite, layout);
  close(percent(effect.top) * layout.height, rendered.y + rendered.height / 2);
});

test("493종 앞·뒷모습의 실제 불투명 픽셀은 화면 안에 있고 HP 패널과 겹치지 않는다", () => {
  const layout = MOBILE_BATTLE_STAGE_LAYOUT;
  const panels = [getBattleHpPanelRect("player", layout), getBattleHpPanelRect("opponent", layout)];
  for (let speciesId = 1; speciesId <= 493; speciesId++) {
    const assets = getBattlePokemonAssets(speciesId);
    for (const side of ["opponent", "player"] as const) {
      const ref = side === "player" ? assets.back : assets.front;
      const alpha = getBattlePokemonAlphaBounds(ref);
      const sprite = getVisibleBoundsAlignedBattleSpriteRenderBox(
        BATTLE_LAYOUT[`${side}Sprite`],
        alpha,
      );
      const rendered = bounds(toCenteredBattleActorRectStyle(sprite, layout), layout);
      const visible = {
        x: rendered.x + (alpha.x / BATTLE_POKEMON_FRAME_SIZE.width) * rendered.width,
        y: rendered.y + (alpha.y / BATTLE_POKEMON_FRAME_SIZE.height) * rendered.height,
        width: (alpha.width / BATTLE_POKEMON_FRAME_SIZE.width) * rendered.width,
        height: (alpha.height / BATTLE_POKEMON_FRAME_SIZE.height) * rendered.height,
      };
      const label = `${speciesId} ${side}`;
      assert.ok(visible.x >= 0 && visible.y >= 0, label);
      assert.ok(visible.x + visible.width <= layout.width, label);
      assert.ok(visible.y + visible.height <= layout.height, label);
      assert.ok(
        panels.every(panel => !overlaps(visible, panel)),
        label,
      );
      if (side === "player") assert.ok(Math.abs(visible.y + visible.height - 176) <= 1, label);
    }
  }
});

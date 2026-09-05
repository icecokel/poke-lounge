import type { CSSProperties } from "react";
import { BATTLE_BASE_SIZE } from "../game-viewport";
import { BATTLE_LAYOUT, type BattleRect } from "./battle-layout";

export interface BattleStageLayout {
  width: number;
  height: number;
  positionYScale: number;
}

export const DESKTOP_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  ...BATTLE_BASE_SIZE,
  positionYScale: 1,
};

// The mobile controller owns the command/message area. Spread battle positions over
// the square field, but keep sprite, HP panel and effect sizes in the same pixel scale.
const battleFieldHeight = BATTLE_LAYOUT.playerSprite.y + BATTLE_LAYOUT.playerSprite.height / 2;
export const MOBILE_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  width: BATTLE_BASE_SIZE.width,
  height: BATTLE_BASE_SIZE.width,
  positionYScale: BATTLE_BASE_SIZE.width / battleFieldHeight,
};

export function toBattlePointStyle(
  point: Pick<BattleRect, "x" | "y">,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): CSSProperties {
  return {
    left: `${(point.x / layout.width) * 100}%`,
    top: `${((point.y * layout.positionYScale) / layout.height) * 100}%`,
  };
}

export function toBattleRectStyle(
  rect: BattleRect,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): CSSProperties {
  return {
    ...toBattlePointStyle(rect, layout),
    width: `${(rect.width / layout.width) * 100}%`,
    height: `${(rect.height / layout.height) * 100}%`,
  };
}

export function toCenteredBattleRectStyle(
  rect: BattleRect,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): CSSProperties {
  return {
    left: `${((rect.x - rect.width / 2) / layout.width) * 100}%`,
    top: `${((rect.y * layout.positionYScale - rect.height / 2) / layout.height) * 100}%`,
    width: `${(rect.width / layout.width) * 100}%`,
    height: `${(rect.height / layout.height) * 100}%`,
  };
}

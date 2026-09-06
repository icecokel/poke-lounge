import type { CSSProperties } from "react";
import { BATTLE_BASE_SIZE, MOBILE_GAME_VIEWPORT_SIZE } from "../game-viewport";
import type { BattleRect } from "./battle-layout";

export interface BattleStageLayout {
  width: number;
  height: number;
  positionYScale: number;
}

export const DESKTOP_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  ...BATTLE_BASE_SIZE,
  positionYScale: 1,
};

// Mobile commands live in the controller, but scene coordinates still use the
// complete 4:3 battle plane. Scaling from the cropped field pushes alpha-aligned
// sprites below the bottom edge. Keep positions, sprites and effects in one plane.
const mobileStageHeight =
  (BATTLE_BASE_SIZE.width * MOBILE_GAME_VIEWPORT_SIZE.height) / MOBILE_GAME_VIEWPORT_SIZE.width;
export const MOBILE_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  width: BATTLE_BASE_SIZE.width,
  height: mobileStageHeight,
  positionYScale: mobileStageHeight / BATTLE_BASE_SIZE.height,
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

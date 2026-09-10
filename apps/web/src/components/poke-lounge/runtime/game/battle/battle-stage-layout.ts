import type { CSSProperties } from "react";
import { BATTLE_BASE_SIZE, MOBILE_GAME_VIEWPORT_SIZE } from "../game-viewport";
import { BATTLE_LAYOUT, type BattleRect } from "./battle-layout";

type BattleSide = "opponent" | "player";

export interface BattleStageLayout {
  width: number;
  height: number;
  positionYScale: number;
  actorTransform?: { scale: number; offsetX: number; offsetY: number };
  hpPanels?: Record<BattleSide, BattleRect>;
}

export const DESKTOP_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  ...BATTLE_BASE_SIZE,
  positionYScale: 1,
};

const mobileStageHeight =
  (BATTLE_BASE_SIZE.width * MOBILE_GAME_VIEWPORT_SIZE.height) / MOBILE_GAME_VIEWPORT_SIZE.width;
const mobileActorScale = 9 / 8;
const mobileBottomInset = 16;
const playerBaseline = BATTLE_LAYOUT.playerSprite.y + BATTLE_LAYOUT.playerSprite.height / 2;

// The outer 4:3 viewport does not change. Reclaim the old bottom window inside it:
// put the player's visible feet and HP panel 16 logical pixels above the bottom.
// One uniform transform owns sprites AND effect paths, preserving alpha alignment,
// hit offsets and capture shrink animations without stretching or clipping pixels.
export const MOBILE_BATTLE_STAGE_LAYOUT: BattleStageLayout = {
  width: BATTLE_BASE_SIZE.width,
  height: mobileStageHeight,
  positionYScale: 1,
  actorTransform: {
    scale: mobileActorScale,
    offsetX: (BATTLE_BASE_SIZE.width * (1 - mobileActorScale)) / 2,
    offsetY: mobileStageHeight - mobileBottomInset - playerBaseline * mobileActorScale,
  },
  hpPanels: {
    opponent: BATTLE_LAYOUT.opponentHpPanel,
    player: {
      ...BATTLE_LAYOUT.playerHpPanel,
      y: mobileStageHeight - mobileBottomInset - BATTLE_LAYOUT.playerHpPanel.height,
    },
  },
};

export function getBattleHpPanelRect(
  side: BattleSide,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): BattleRect {
  return layout.hpPanels?.[side] ?? BATTLE_LAYOUT[`${side}HpPanel`];
}

/** A separate HUD row: never squeeze another line into the clipped HP panel. */
export function getOpponentPartyIndicatorRect(
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): BattleRect {
  const panel = getBattleHpPanelRect("opponent", layout);
  return { x: panel.x, y: panel.y + panel.height + 3, width: panel.width, height: 11 };
}

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

function transformActorPoint(point: Pick<BattleRect, "x" | "y">, layout: BattleStageLayout) {
  const transform = layout.actorTransform;
  return transform
    ? {
        x: point.x * transform.scale + transform.offsetX,
        y: point.y * transform.scale + transform.offsetY,
      }
    : point;
}

export function toBattleActorPointStyle(
  point: Pick<BattleRect, "x" | "y">,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): CSSProperties {
  return toBattlePointStyle(transformActorPoint(point, layout), layout);
}

export function toCenteredBattleActorRectStyle(
  rect: BattleRect,
  layout: BattleStageLayout = DESKTOP_BATTLE_STAGE_LAYOUT,
): CSSProperties {
  const scale = layout.actorTransform?.scale ?? 1;
  return toCenteredBattleRectStyle(
    {
      ...transformActorPoint(rect, layout),
      width: rect.width * scale,
      height: rect.height * scale,
    },
    layout,
  );
}

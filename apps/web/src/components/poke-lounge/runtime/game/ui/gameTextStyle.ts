import type * as Phaser from "phaser";

export const gameUiFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const GAME_UI_TEXT_RESOLUTION = 2;

export function createGameTextStyle(
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: gameUiFontFamily,
    resolution: GAME_UI_TEXT_RESOLUTION,
    ...style,
  };
}

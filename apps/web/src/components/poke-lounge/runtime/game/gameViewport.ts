export const GAME_VIEWPORT_SIZE_PRESETS = {
  normal: { width: 768, height: 576 },
  large: { width: 512, height: 384 },
} as const;

// 세로 모바일의 CSS 표시 비율은 유지하면서 필드에서 보이는 월드 범위만 줄인다.
export const MOBILE_GAME_VIEWPORT_SIZE = { width: 384, height: 288 } as const;

export type GameViewportSizePreset = keyof typeof GAME_VIEWPORT_SIZE_PRESETS;

export const DEFAULT_GAME_VIEWPORT_SIZE_PRESET = "large" satisfies GameViewportSizePreset;
export const GAME_VIEWPORT_SIZE = GAME_VIEWPORT_SIZE_PRESETS[DEFAULT_GAME_VIEWPORT_SIZE_PRESET];

export const GAME_VIEWPORT_STYLE = {
  aspectRatio: "4 / 3",
  maxDisplayWidthPx: 1440,
} as const;

export const BATTLE_BASE_SIZE = { width: 256, height: 192 } as const;

export interface GameViewportDisplaySize {
  width: number;
  height: number;
}

export function getBattleCameraZoom(viewportWidth: number = GAME_VIEWPORT_SIZE.width): number {
  return viewportWidth / BATTLE_BASE_SIZE.width;
}

export const BATTLE_CAMERA_ZOOM = getBattleCameraZoom(GAME_VIEWPORT_SIZE.width);

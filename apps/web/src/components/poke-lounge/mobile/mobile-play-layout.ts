/** Layout depends on available CSS pixels, never device names or orientation.
 * Field, battle commands and move selection reserve the same controller space.
 */
export interface MobilePlayLayoutInput {
  width: number;
  height: number;
  statusHeight: number;
  fontSize?: number;
}

export interface MobilePlayLayout {
  mode: "stacked" | "split";
  width: number;
  frameWidth: number;
  frameHeight: number;
  controllerWidth: number;
  controllerHeight: number;
  statusHeight: number;
  gap: number;
}

export const MOBILE_PLAY_RATIO = 3 / 4;
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, value) : fallback;

export function calculateMobilePlayLayout(input: MobilePlayLayoutInput): MobilePlayLayout {
  const width = Math.min(1200, finite(input.width));
  const height = finite(input.height);
  const statusHeight = Math.min(height, finite(input.statusHeight, 56));
  const gap = Math.min(8, Math.max(0, (height - statusHeight) / 4));
  const bodyHeight = Math.max(0, height - statusHeight - gap);
  const scale = Math.max(1, finite(input.fontSize ?? 16, 16) / 16);
  const preferredController = Math.min(360, 256 * scale);
  // On exceptionally short screens, keep a game view and scroll controller
  // contents. Never shrink labels or interactive targets to force a fit.
  const stackBodyHeight = Math.max(0, bodyHeight - gap);
  const reservedController = Math.min(preferredController, stackBodyHeight * 0.64);
  const stackWidth = Math.min(width, 768);
  const stackedFrameWidth = Math.min(
    stackWidth,
    (stackBodyHeight - reservedController) * MOBILE_PLAY_RATIO,
  );
  const controllerWidth = Math.min(380, Math.max(280, width * 0.4));
  const splitFrameWidth = Math.max(
    0,
    Math.min(width - controllerWidth - gap, bodyHeight * MOBILE_PLAY_RATIO),
  );
  // Split only when both controls and an appreciably larger game actually fit.
  // Identical dimensions always produce identical geometry, regardless of history.
  const split =
    bodyHeight >= 220 &&
    width - controllerWidth - gap >= 192 &&
    splitFrameWidth > stackedFrameWidth * 1.12;
  if (split)
    return {
      mode: "split",
      width: splitFrameWidth + gap + controllerWidth,
      frameWidth: splitFrameWidth,
      frameHeight: splitFrameWidth / MOBILE_PLAY_RATIO,
      controllerWidth,
      controllerHeight: bodyHeight,
      statusHeight,
      gap,
    };
  const frameHeight = stackedFrameWidth / MOBILE_PLAY_RATIO;
  return {
    mode: "stacked",
    width: stackWidth,
    frameWidth: stackedFrameWidth,
    frameHeight,
    controllerWidth: stackWidth,
    controllerHeight: Math.max(0, stackBodyHeight - frameHeight),
    statusHeight,
    gap,
  };
}

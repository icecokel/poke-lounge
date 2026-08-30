export const ROM_CAPTURE_ANIMATION_DURATION_MS = 2_600;

export const ROM_CAPTURE_PRESENTATION_SOURCE = {
  romSha1: "5834fb3a2d751c48501d47d6a56898d7af6ccf9e",
  archivePath: "pbr/batt_obj.narc",
  archiveMemberCount: 279,
} as const;

const THROW_END = 0.24;
const ABSORB_END = 0.39;
const FALL_END = 0.51;
const BOUNCE_END = 0.6;
const SETTLE_END = 0.66;
const SHAKE_END = 0.9;
const VISIBLE_SHAKE_SLOTS = 3;

export type RomCaptureAnimationStage =
  "throw" | "absorb" | "fall" | "bounce" | "settle" | "shake" | "result";

export interface RomCaptureAnimationFrame {
  ballRotation: number;
  bounceOffsetY: number;
  opponentAlpha: number;
  opponentScale: number;
  resultProgress: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  showBall: boolean;
  stage: RomCaptureAnimationStage;
  stageProgress: number;
}

export function resolveRomCaptureAnimationFrame(
  progress: number,
  shakes: number,
  caught: boolean,
): RomCaptureAnimationFrame {
  const normalizedProgress = Math.min(1, Math.max(0, progress));

  if (normalizedProgress < THROW_END) {
    const stageProgress = normalizedProgress / THROW_END;

    return createFrame("throw", stageProgress, {
      ballRotation: stageProgress * Math.PI * 3,
    });
  }

  if (normalizedProgress < ABSORB_END) {
    const stageProgress = (normalizedProgress - THROW_END) / (ABSORB_END - THROW_END);

    return createFrame("absorb", stageProgress, {
      opponentAlpha: 1 - stageProgress,
      opponentScale: 1 - stageProgress * 0.78,
    });
  }

  if (normalizedProgress < FALL_END) {
    const stageProgress = (normalizedProgress - ABSORB_END) / (FALL_END - ABSORB_END);

    return createFrame("fall", stageProgress, {
      opponentAlpha: 0,
      opponentScale: 0.22,
    });
  }

  if (normalizedProgress < BOUNCE_END) {
    const stageProgress = (normalizedProgress - FALL_END) / (BOUNCE_END - FALL_END);

    return createFrame("bounce", stageProgress, {
      ballRotation: Math.sin(stageProgress * Math.PI) * 0.18,
      bounceOffsetY: -Math.sin(stageProgress * Math.PI) * 7,
      opponentAlpha: 0,
      opponentScale: 0.22,
    });
  }

  if (normalizedProgress < SETTLE_END) {
    const stageProgress = (normalizedProgress - BOUNCE_END) / (SETTLE_END - BOUNCE_END);

    return createFrame("settle", stageProgress, {
      opponentAlpha: 0,
      opponentScale: 0.22,
    });
  }

  if (normalizedProgress < SHAKE_END) {
    const stageProgress = (normalizedProgress - SETTLE_END) / (SHAKE_END - SETTLE_END);
    const shakeSlot = Math.min(
      VISIBLE_SHAKE_SLOTS - 1,
      Math.floor(stageProgress * VISIBLE_SHAKE_SLOTS),
    );
    const slotProgress = stageProgress * VISIBLE_SHAKE_SLOTS - shakeSlot;
    const visibleShakeCount = caught ? VISIBLE_SHAKE_SLOTS : Math.min(VISIBLE_SHAKE_SLOTS, shakes);
    const isShaking = shakeSlot < visibleShakeCount && slotProgress < 0.62;
    const activeProgress = isShaking ? slotProgress / 0.62 : 1;
    const shakeWave = isShaking ? Math.sin(activeProgress * Math.PI * 2) : 0;

    return createFrame("shake", stageProgress, {
      ballRotation: shakeWave * 0.2,
      opponentAlpha: 0,
      opponentScale: 0.22,
      shakeOffsetX: shakeWave * 4,
      shakeOffsetY: isShaking ? -Math.sin(activeProgress * Math.PI) * 1.5 : 0,
    });
  }

  const stageProgress = (normalizedProgress - SHAKE_END) / (1 - SHAKE_END);
  const opponentRevealProgress = caught ? 0 : Math.min(1, stageProgress / 0.82);

  return createFrame("result", stageProgress, {
    opponentAlpha: opponentRevealProgress,
    opponentScale: 0.22 + opponentRevealProgress * 0.78,
    resultProgress: stageProgress,
    showBall: caught || stageProgress < 0.58,
  });
}

function createFrame(
  stage: RomCaptureAnimationStage,
  stageProgress: number,
  overrides: Partial<Omit<RomCaptureAnimationFrame, "stage" | "stageProgress">> = {},
): RomCaptureAnimationFrame {
  return {
    ballRotation: 0,
    bounceOffsetY: 0,
    opponentAlpha: 1,
    opponentScale: 1,
    resultProgress: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    showBall: true,
    stage,
    stageProgress,
    ...overrides,
  };
}

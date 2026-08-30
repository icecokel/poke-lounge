import { GAME_VIEWPORT_SIZE } from "../gameViewport";

export interface BattleIntroStripe {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly direction: "left" | "right";
}

export const BATTLE_INTRO_TIMING = {
  flashMs: 120,
  stripeMs: 360,
  fadeMs: 180,
  settleMs: 80,
} as const;

export const BATTLE_INTRO_SCREEN_SIZE = GAME_VIEWPORT_SIZE;
export const BATTLE_INTRO_STRIPE_COUNT = 8;

export function getBattleIntroDurationMs(): number {
  return (
    BATTLE_INTRO_TIMING.flashMs +
    BATTLE_INTRO_TIMING.stripeMs +
    BATTLE_INTRO_TIMING.fadeMs +
    BATTLE_INTRO_TIMING.settleMs
  );
}

export function createBattleIntroStripes({
  width,
  height,
  stripeCount,
}: {
  width: number;
  height: number;
  stripeCount: number;
}): BattleIntroStripe[] {
  const stripeHeight = Math.ceil(height / stripeCount);

  return Array.from({ length: stripeCount }, (_, index) => {
    const direction = index % 2 === 0 ? "right" : "left";

    return {
      x: direction === "right" ? -width : width,
      y: index * stripeHeight,
      width,
      height: Math.min(stripeHeight, height - index * stripeHeight),
      direction,
    };
  });
}

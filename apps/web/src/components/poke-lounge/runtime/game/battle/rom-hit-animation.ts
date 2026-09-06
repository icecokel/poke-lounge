/** HG Korean (IPKK), SHA1 5834fb3a2d751c48501d47d6a56898d7af6ccf9e.
 * Overlay 12 task at RAM 0x02260984 (offset 0x286c4): six visibility XORs,
 * delay counter=2 between XORs; restore visible on frame 16.
 * Verified with scripts/poke-lounge/analyze-hit-animation.ts against local ROM.
 * This is the shared damage reaction, not a substitute for per-move effect scripts.
 */
export const ROM_HIT_ANIMATION = {
  framesPerSecond: 60,
  toggleFrames: [0, 3, 6, 9, 12, 15],
  restoreFrame: 16,
} as const;
export const ROM_HIT_DURATION_MS =
  (ROM_HIT_ANIMATION.restoreFrame * 1000) / ROM_HIT_ANIMATION.framesPerSecond;

export function getRomHitFrame(
  elapsedMs: number,
  reducedMotion = false,
): { alpha: number; offsetX: number } {
  if (
    reducedMotion ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >= ROM_HIT_DURATION_MS
  )
    return { alpha: 1, offsetX: 0 };
  const frame = Math.floor((elapsedMs * ROM_HIT_ANIMATION.framesPerSecond) / 1000);
  return { alpha: Math.floor(frame / 3) % 2 === 0 ? 0 : 1, offsetX: 0 };
}

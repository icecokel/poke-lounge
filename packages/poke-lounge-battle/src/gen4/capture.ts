/** HGSS battle_command.c: integer divisions and two hardware integer square roots, in order. */
export function hgssCaptureValue(input: {
  maxHp: number;
  currentHp: number;
  catchRate: number;
  ballBonus?: number;
  statusBonus?: number;
}): number {
  const maxHp = boundedInteger(input.maxHp, 1, 65535),
    hp = boundedInteger(input.currentHp, 1, maxHp);
  const rate = boundedInteger(input.catchRate, 0, 255);
  const ballTenths = boundedInteger((input.ballBonus ?? 1) * 10, 0, 2550);
  const base = Math.floor(
    (Math.floor((rate * ballTenths) / 10) * (3 * maxHp - 2 * hp)) / (3 * maxHp),
  );
  const status = input.statusBonus ?? 1;
  return status === 2
    ? base * 2
    : status === 1.5
      ? Math.floor((base * 15) / 10)
      : Math.floor(base * Math.max(0, Number.isFinite(status) ? status : 1));
}
export function hgssShakeThreshold(captureValue: number): number {
  if (!Number.isFinite(captureValue) || captureValue <= 0) return 0;
  if (captureValue >= 255) return 65536;
  const first = Math.floor(Math.sqrt(Math.floor(0xff0000 / Math.floor(captureValue))));
  const second = Math.floor(Math.sqrt(first));
  return second === 0 ? 65536 : Math.floor(0xffff0 / second);
}
function boundedInteger(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? Math.floor(n) : min));
}

import assert from "node:assert/strict";
import test, { before } from "node:test";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
before(async () => {
  await loadPublicRuntimeGameDataFixture();
});
import { getBattleExperienceProgress } from "./battle-experience";
import { getExperienceForLevel } from "./experience";
import { getRomHitFrame, ROM_HIT_DURATION_MS } from "./rom-hit-animation";

test("경험치는 현재 레벨의 획득량·필요량·남은량으로 표시한다", () => {
  for (let growthRate = 0; growthRate < 6; growthRate++) {
    const base = getExperienceForLevel(10, growthRate);
    const next = getExperienceForLevel(11, growthRate);
    const p = getBattleExperienceProgress({ level: 10, growthRate, experience: base + 10 });
    assert.equal(p.current, 10);
    assert.equal(p.required, next - base);
    assert.equal(p.remaining, next - base - 10);
    assert.equal(p.ratio, 10 / (next - base));
  }
});

test("경험치 바는 누락 값·레벨업 직후·100레벨을 안전하게 처리한다", () => {
  assert.equal(getBattleExperienceProgress({ level: 10 }).ratio, 0);
  assert.equal(getBattleExperienceProgress({ level: 10, experience: -1 }).ratio, 0);
  assert.equal(
    getBattleExperienceProgress({ level: 11, experience: getExperienceForLevel(11, 0) }).current,
    0,
  );
  assert.deepEqual(getBattleExperienceProgress({ level: 100 }), {
    current: 0,
    required: 0,
    remaining: 0,
    ratio: 1,
    atMaxLevel: true,
  });
});

test("ROM 피격 반응은 0·3·6·9·12·15 프레임에서 반전하고 16프레임에 복원된다", () => {
  const expected = [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1];
  expected.forEach((alpha, frame) =>
    assert.deepEqual(getRomHitFrame(((frame + 0.01) * 1000) / 60), { alpha, offsetX: 0 }),
  );
  assert.deepEqual(getRomHitFrame(ROM_HIT_DURATION_MS), { alpha: 1, offsetX: 0 });
  assert.deepEqual(getRomHitFrame(0, true), { alpha: 1, offsetX: 0 });
  assert.deepEqual(getRomHitFrame(Number.NaN), { alpha: 1, offsetX: 0 });
});

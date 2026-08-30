import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRomCaptureAnimationFrame,
  ROM_CAPTURE_PRESENTATION_SOURCE,
} from "./capture-presentation";

test("한국판 하트골드 ROM의 전투 오브젝트 아카이브를 포획 연출 근거로 기록한다", () => {
  assert.deepEqual(ROM_CAPTURE_PRESENTATION_SOURCE, {
    romSha1: "5834fb3a2d751c48501d47d6a56898d7af6ccf9e",
    archivePath: "pbr/batt_obj.narc",
    archiveMemberCount: 279,
  });
});

test("포획 연출은 투척·흡수·낙하·바운스·개별 흔들림·결과 순서로 진행한다", () => {
  assert.equal(resolveRomCaptureAnimationFrame(0.1, 4, true).stage, "throw");
  assert.equal(resolveRomCaptureAnimationFrame(0.3, 4, true).stage, "absorb");
  assert.equal(resolveRomCaptureAnimationFrame(0.44, 4, true).stage, "fall");
  assert.equal(resolveRomCaptureAnimationFrame(0.55, 4, true).stage, "bounce");
  assert.equal(resolveRomCaptureAnimationFrame(0.63, 4, true).stage, "settle");
  assert.equal(resolveRomCaptureAnimationFrame(0.72, 4, true).stage, "shake");
  assert.equal(resolveRomCaptureAnimationFrame(0.95, 4, true).stage, "result");
});

test("볼 흔들림 사이에는 정지 구간이 있고 포획 실패 시 볼과 포켓몬을 복원한다", () => {
  const activeShake = resolveRomCaptureAnimationFrame(0.675, 1, false);
  const shakePause = resolveRomCaptureAnimationFrame(0.715, 1, false);
  const failedResult = resolveRomCaptureAnimationFrame(1, 1, false);

  assert.notEqual(activeShake.shakeOffsetX, 0);
  assert.equal(shakePause.shakeOffsetX, 0);
  assert.equal(failedResult.showBall, false);
  assert.equal(failedResult.opponentAlpha, 1);
  assert.equal(failedResult.opponentScale, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  createRomEvolutionMessages,
  formatRomEvolutionStartMessage,
  resolveRomEvolutionAnimationFrame,
  ROM_EVOLUTION_MESSAGE_SOURCE,
} from "./evolution-presentation";

test("한국판 하트골드 ROM의 진화 시작·성공 문구를 그대로 조합한다", function testCase() {
  assert.deepEqual(createRomEvolutionMessages("치코리타", "베이리프"), [
    "...오잉!?\n치코리타의 모습이...!",
    "축하합니다! 치코리타\n베이리프로 진화했습니다!",
  ]);
  assert.equal(formatRomEvolutionStartMessage("브케인"), "...오잉!?\n브케인의 모습이...!");
  assert.deepEqual(ROM_EVOLUTION_MESSAGE_SOURCE, {
    romSha1: "5834fb3a2d751c48501d47d6a56898d7af6ccf9e",
    archivePath: "a/0/2/7",
    archiveMemberIndex: 196,
    startMessageIndex: 915,
    successMessageIndex: 918,
  });
});

test("원작 진화 연출은 구형·신형 실루엣을 가속 교대하고 새 모습으로 끝난다", function testCase() {
  const sampledFrames = [0.18, 0.36, 0.52, 0.64, 0.72, 0.77, 0.81].map(function mapItem(progress) {
    return resolveRomEvolutionAnimationFrame(progress);
  });

  assert.ok(
    sampledFrames.every(function testItem(frame) {
      return frame.stage === "morph";
    }),
  );
  assert.ok(
    sampledFrames.some(function testItem(frame) {
      return frame.pokemon === "from";
    }),
  );
  assert.ok(
    sampledFrames.some(function testItem(frame) {
      return frame.pokemon === "to";
    }),
  );
  assert.ok(
    sampledFrames.every(function testItem(frame) {
      return frame.silhouetteAlpha === 1;
    }),
  );

  assert.deepEqual(resolveRomEvolutionAnimationFrame(1), {
    flashAlpha: 0,
    pokemon: "to",
    scale: 1,
    silhouetteAlpha: 0,
    stage: "reveal",
  });
});

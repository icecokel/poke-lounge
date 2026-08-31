import assert from "node:assert/strict";
import test from "node:test";
import { getExperienceForLevel } from "../battle/experience";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { createGameStateStore } from "../state/gameStateStore";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { createWorldUiStore } from "../world/world-ui-store";
import {
  createWorldSceneHud,
  formatRankScoreHud,
  formatRoundHudText,
  getPokemonExperienceProgress,
  getPokemonHpRatio,
} from "./world-scene-hud";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

test("포켓몬 HP와 현재 레벨 경험치 진행률을 상태 패널용 값으로 변환한다", () => {
  const levelStart = getExperienceForLevel(10, 0);
  const nextLevel = getExperienceForLevel(11, 0);
  const required = nextLevel - levelStart;
  const progress = getPokemonExperienceProgress({
    speciesId: 152,
    name: "치코리타",
    level: 10,
    currentHp: 15,
    maxHp: 30,
    growthRate: 0,
    experience: levelStart + Math.floor(required / 2),
  });

  assert.equal(getPokemonHpRatio({ speciesId: 152, name: "치코리타", level: 10 }), 0);
  assert.equal(
    getPokemonHpRatio({
      speciesId: 152,
      name: "치코리타",
      level: 10,
      currentHp: 15,
      maxHp: 30,
    }),
    0.5,
  );
  assert.equal(progress.required, required);
  assert.equal(progress.current, Math.floor(required / 2));
  assert.equal(progress.ratio, progress.current / required);
});

test("랭크와 점수 HUD는 솔로와 계정 기록을 구분한다", () => {
  assert.equal(formatRankScoreHud({ rank: 12, score: 345 }, "solo"), "솔로 모드\n랭킹 미반영");
  assert.equal(
    formatRankScoreHud({ rank: 12, score: 345 }, "competitive"),
    "계정 기록\n랭크 12 · 점수 345",
  );
});

test("라운드 HUD는 시작까지 남은 시간을 초 단위로 표시한다", () => {
  assert.equal(
    formatRoundHudText(
      {
        phase: "preparation",
        roundIndex: 1,
        totalRounds: 3,
        preparationDurationMs: 300_000,
        phaseStartedAtMs: 1_000,
        preparationEndsAtMs: 301_000,
      },
      271_001,
    ),
    "라운드 1/3 시작까지\n00:30",
  );
});

test("라운드 준비 시간이 끝나면 다른 플레이어 대기를 표시한다", () => {
  assert.equal(
    formatRoundHudText(
      {
        phase: "preparation",
        roundIndex: 2,
        totalRounds: 3,
        preparationDurationMs: 300_000,
        phaseStartedAtMs: 1_000,
        preparationEndsAtMs: 301_000,
      },
      301_000,
      "Waiting for the other players...",
    ),
    "라운드 2/3\nWaiting for the other players...",
  );
});

test("서버 권위 라운드 HUD는 snapshot 전 waiting 상태를 로컬에서 전진시키지 않는다", () => {
  const gameStateStore = createGameStateStore();
  const hud = createWorldSceneHud({
    getDocument: () => ({}) as Document,
    gameStateStore,
    competitiveRoundsEnabled: true,
    serverAuthoritativeRounds: true,
    roundWaitingText: "다른 플레이어를 기다리는 중...",
    addUnsubscriber: () => {},
    canOpenPokemonStatusPanel: () => false,
    isShutdownComplete: () => false,
    worldUiStore: createWorldUiStore(),
  });

  hud.createRoundHud(1_000, 300_000);
  hud.updateRound(301_000);

  assert.equal(gameStateStore.getState().round.phase, "waiting");
});

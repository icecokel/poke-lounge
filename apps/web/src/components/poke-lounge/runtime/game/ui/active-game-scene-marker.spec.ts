import assert from "node:assert/strict";
import test from "node:test";
import { setBattleSceneMarker } from "./active-game-scene-marker";

const createMarkerElements = () => {
  const gamePage = { dataset: {} } as HTMLElement;
  const gameRoot = {
    dataset: {},
    closest: () => gamePage,
  } as unknown as HTMLElement;

  return { gamePage, gameRoot };
};

test("전투 장면 마커를 게임 루트와 페이지에 함께 설정하고 제거한다", () => {
  const { gamePage, gameRoot } = createMarkerElements();

  setBattleSceneMarker(gameRoot, true);
  assert.equal(gameRoot.dataset.pokeLoungeActiveScene, "battle");
  assert.equal(gamePage.dataset.pokeLoungeActiveScene, "battle");

  setBattleSceneMarker(gameRoot, false);
  assert.equal(gameRoot.dataset.pokeLoungeActiveScene, undefined);
  assert.equal(gamePage.dataset.pokeLoungeActiveScene, undefined);
});

test("새 게임 시작 시 남아 있는 전투 장면 마커를 제거한다", () => {
  const { gamePage, gameRoot } = createMarkerElements();
  gameRoot.dataset.pokeLoungeActiveScene = "battle";
  gamePage.dataset.pokeLoungeActiveScene = "battle";

  setBattleSceneMarker(gameRoot, false);

  assert.deepEqual(gameRoot.dataset, {});
  assert.deepEqual(gamePage.dataset, {});
});

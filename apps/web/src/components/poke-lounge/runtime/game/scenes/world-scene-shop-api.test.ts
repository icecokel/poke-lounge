import assert from "node:assert/strict";
import test from "node:test";
import {
  getRuntimeShopItemRomIds,
  resetRuntimeGameDataJsonStateForTest,
  type RuntimeShopKind,
} from "../data/game-data-json";
import { createGameStateStore } from "../state/gameStateStore";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import type { RuntimeKeyboard } from "../runtime-input";
import { createWorldUiStore } from "../world/world-ui-store";
import { createWorldSceneInteractions } from "./world-scene-interactions";

test.beforeEach(loadPublicRuntimeGameDataFixture);
test.afterEach(resetRuntimeGameDataJsonStateForTest);

test("상점을 열 때 해당 상점 API만 적용하고 닫힌 요청 응답은 무시한다", async () => {
  const pending: Array<{
    shopKind: RuntimeShopKind;
    resolve(itemIds: readonly number[]): void;
  }> = [];
  const { controller, worldUiStore } = createController(
    shopKind =>
      new Promise(resolve => {
        pending.push({ shopKind, resolve });
      }),
  );

  controller.test.openShop();
  assert.equal(controller.test.getShopMessage(), "상품을 불러오는 중…");
  controller.test.closeShop();
  controller.test.openPremiumShop();
  assert.deepEqual(
    pending.map(request => request.shopKind),
    ["basic", "premium"],
  );

  pending[1].resolve([80]);
  await flushMicrotasks();
  assert.deepEqual(
    worldUiStore.getSnapshot().mobile?.items.map(item => item.id),
    ["sunStone"],
  );

  pending[0].resolve([17]);
  await flushMicrotasks();
  assert.deepEqual(getRuntimeShopItemRomIds("premium"), [80]);
  assert.throws(() => getRuntimeShopItemRomIds("basic"), /not loaded/);
});

test("상점 API 오류는 구매를 막고 재시도 안내를 표시한다", async () => {
  const { controller, gameStateStore, worldUiStore } = createController(() =>
    Promise.reject(new Error("shop unavailable")),
  );
  const walletBefore = gameStateStore.getCurrentLocalPlayer().wallet.pokeDollars;

  controller.test.openShop();
  controller.test.confirmShopSelection();
  await flushMicrotasks();

  assert.equal(gameStateStore.getCurrentLocalPlayer().wallet.pokeDollars, walletBefore);
  assert.equal(worldUiStore.getSnapshot().mobile?.items.length, 0);
  assert.match(controller.test.getShopMessage(), /상점을 닫고 다시 시도/);
});

function createController(
  loadShopItemRomIds: (shopKind: RuntimeShopKind) => Promise<readonly number[]>,
) {
  const gameStateStore = createGameStateStore();
  const worldUiStore = createWorldUiStore();
  const controller = createWorldSceneInteractions({
    gameStateStore,
    getDocument: () => ({}) as Document,
    keyboard: {
      consume: () => false,
      isDown: () => false,
    } as RuntimeKeyboard,
    getPlayerPosition: () => null,
    canStartSoloChallenge: () => false,
    startSoloChallenge: () => {},
    playNurseHealingEffect: (_position, onComplete) => onComplete(),
    isBattleIntroPlaying: () => false,
    renderPartyHud: () => {},
    closePokemonStatusPanel: () => {},
    getPartyPokemonBySlotIndex: () => null,
    getPokemonStatusPanelSnapshot: () => null,
    isPokemonStatusPanelOpen: () => false,
    loadShopItemRomIds,
    worldUiStore,
  });

  return { controller, gameStateStore, worldUiStore };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

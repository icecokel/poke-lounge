import { expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
  loadPublicRuntimeGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { getExperienceForLevel } from "../../src/components/poke-lounge/runtime/game/battle/experience";
import { gotoWithRetry } from "./test-helpers";
test.beforeAll(loadPublicRuntimeGameDataFixture);
type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
async function enterWorld(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
  // Start the game with the keyboard; no mouse clicks in the test.
  await expect(page.locator("[data-starter-confirm]")).toBeEnabled();
  await page.locator("[data-starter-confirm]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-world-local-player]")).toBeVisible();
}
async function startBattle(page: Page) {
  await page.evaluate(() =>
    (window as GameWindow).__POKE_LOUNGE_E2E__.startWildBattleForTest({
      encounter: {
        mapKey: "town",
        step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        speciesId: 19,
        name: "꼬렛",
        level: 12,
      },
      x: 656,
      y: 446,
      facing: "front",
    }),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot()?.battleEntrancePlaying,
        ),
      { timeout: 20000 },
    )
    .toBe(false);
  await expect(page.locator('[data-poke-lounge-battle-surface="command"]')).toBeVisible();
}
const snapshot = (page: Page) =>
  page.evaluate(() => (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot());

test("키보드만으로 초기 가방·취소·기술 선택·타격까지 진행한다", async ({ page }, info) => {
  await enterWorld(page);
  const inventory = await page.evaluate(() => {
    const state = (window as GameWindow).__POKE_LOUNGE_E2E__.getGameStateSnapshot();
    return state.playersById[state.currentPlayerId]!.inventory;
  });
  expect(inventory).toEqual({ pokeball: 10, potion: 5 });
  await startBattle(page);
  const ball = page.locator('[data-poke-lounge-send-out-ball="player"]');
  const keyframes = await ball.evaluate(el =>
    el
      .getAnimations()
      .flatMap(animation =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes().map(frame => String(frame.transform))
          : [],
      ),
  );
  expect(keyframes.some(frame => frame.includes("rotate(-720deg)"))).toBe(true);
  await page.keyboard.press("i");
  const bag = page.locator('[data-poke-lounge-battle-surface="bag"]');
  await expect(bag).toBeVisible();
  await expect(bag).toContainText("상처약");
  await expect(bag).toContainText("몬스터볼");
  await expect(bag).not.toContainText("슈퍼볼");
  await expect(bag).not.toContainText("고급상처약");
  await page.keyboard.press("x");
  const command = page.locator('[data-poke-lounge-battle-surface="command"]');
  await expect(command).toBeVisible();
  // Native Enter removes this focused button; the next key must still reach the game.
  await command.getByRole("button").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-poke-lounge-battle-surface="moves"]')).toBeVisible();
  await page.keyboard.press("x");
  await expect(command).toBeVisible();
  await page.keyboard.press("z");
  await expect(page.locator('[data-poke-lounge-battle-surface="moves"]')).toBeVisible();
  const before = (await snapshot(page))!.hitAnimationStartedCount;
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await snapshot(page))?.hitAnimationStartedCount, { timeout: 20000 })
    .toBeGreaterThan(before);
  await page.screenshot({ path: info.outputPath("keyboard-battle-desktop.png") });
});

test("선두를 유지하면서 경험치를 받은 대기 팀원 둘의 진화를 순서대로 재생한다", async ({
  page,
}, info) => {
  test.setTimeout(70000);
  await enterWorld(page);
  const thresholds = {
    chikorita: getExperienceForLevel(16, 3) - 1,
    cyndaquil: getExperienceForLevel(14, 3) - 1,
  };
  await page.evaluate(({ chikorita, cyndaquil }) => {
    const controller = (window as GameWindow).__POKE_LOUNGE_E2E__;
    const state = controller.getGameStateSnapshot();
    const player = state.playersById[state.currentPlayerId]!;
    controller.setCurrentLocalPlayerForTest({
      ...player,
      activePartySlotIndex: 0,
      party: [
        {
          slotIndex: 0,
          pokemon: {
            speciesId: 25,
            name: "피카츄",
            level: 100,
            currentHp: 300,
            maxHp: 300,
            status: "normal",
            moves: [{ id: 85, name: "10만볼트", pp: 15, maxPp: 15 }],
          },
        },
        {
          slotIndex: 1,
          pokemon: {
            speciesId: 152,
            name: "치코리타",
            level: 15,
            growthRate: 3,
            experience: chikorita,
            currentHp: 40,
            maxHp: 40,
            status: "normal",
          },
        },
        {
          slotIndex: 2,
          pokemon: {
            speciesId: 155,
            name: "브케인",
            level: 13,
            growthRate: 3,
            experience: cyndaquil,
            currentHp: 40,
            maxHp: 40,
            status: "normal",
          },
        },
        ...[3, 4, 5].map(slotIndex => ({ slotIndex, pokemon: null })),
      ],
    });
  }, thresholds);
  await startBattle(page);
  await page.keyboard.press("z");
  await expect(page.locator('[data-poke-lounge-battle-surface="moves"]')).toBeVisible();
  await page.keyboard.press("z");
  const evolutions: number[] = [];
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await snapshot(page);
    if (!state) break;
    if (
      state.evolutionAnimationPlaying &&
      state.evolutionFromSpeciesId !== null &&
      !evolutions.includes(state.evolutionFromSpeciesId)
    ) {
      evolutions.push(state.evolutionFromSpeciesId);
      await page.screenshot({
        path: info.outputPath(`reserve-evolution-${state.evolutionFromSpeciesId}.png`),
      });
    }
    if (evolutions.length === 2 && !state.evolutionAnimationPlaying) break;
    if (!state.evolutionAnimationPlaying && !state.hpAnimationPlaying && !state.hitAnimationPlaying)
      await page.keyboard.press("z");
    await page.waitForTimeout(150);
  }
  expect(evolutions).toEqual([152, 155]);
  const state = await snapshot(page);
  expect(state?.evolutionAnimationStartedCount).toBe(2);
  expect(state?.player.name).toBe("피카츄");
  expect(state?.player.activePartySlotIndex).toBe(0);
});

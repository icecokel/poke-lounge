import { expect, type Page, test } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { BattleE2eSnapshot } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

type LearningController = {
  getBattleSnapshot(): BattleE2eSnapshot | null;
  setBattleCommand(command: "fight"): BattleE2eSnapshot | null;
  setBattleMoveIndex(index: number): BattleE2eSnapshot | null;
  confirmBattle(): BattleE2eSnapshot | null;
};

test("데스크톱 기술 선택은 확인 후에만 교체하고 키보드 취소도 안전하다", async function testCase({
  page,
}, testInfo) {
  test.skip(
    testInfo.project.use.isMobile === true,
    "Desktop keyboard coverage; mobile touch is covered separately.",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", function allowEntry(route) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, active: true }),
    });
  });
  await page.route("**/poke-lounge/rom-data", function supplyData(route) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
  });
  await gotoWithRetry(
    page,
    "/ko-KR/game/poke-lounge?scene=battle&e2eBattle=wild-move-learning&e2e=1&localTest=1",
  );
  const starter = page.locator("[data-starter-confirm]");
  await expect(starter).toBeVisible();
  await starter.click();
  await expect
    .poll(
      async function waitForEntrance() {
        const state = await readBattle(page);
        return state?.battleEntrancePlaying === false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.evaluate(function arrangeBattleEnd() {
    const controller = (window as Window & { __POKE_LOUNGE_E2E__?: LearningController })
      .__POKE_LOUNGE_E2E__;
    controller?.setBattleCommand("fight");
    controller?.confirmBattle();
    controller?.setBattleMoveIndex(0);
    let state = controller?.confirmBattle();
    for (let n = 0; n < 20 && state?.message; n += 1) state = controller?.confirmBattle();
  });
  await expect
    .poll(
      async function waitForEvolution() {
        return (await readBattle(page))?.evolutionAnimationPlaying;
      },
      { timeout: 20_000 },
    )
    .toBe(false);
  const panel = page.locator("[data-poke-lounge-move-learning='select']");
  await expect(panel).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("move-selection-desktop.png") });
  const before = (await readBattle(page))?.player.moves;
  expect(before).toBeDefined();
  const choice = panel.getByRole("button", { name: /연막/ });
  await choice.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.locator("[data-poke-lounge-move-learning='confirm']");
  await expect(confirmation).toBeVisible();
  expect((await readBattle(page))?.player.moves).toEqual(before);
  await confirmation.getByRole("button", { name: "다시 선택", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(panel).toBeVisible();
  expect((await readBattle(page))?.player.moves).toEqual(before);
  await choice.click();
  await page.screenshot({ path: testInfo.outputPath("move-confirmation-desktop.png") });
  await confirmation.getByRole("button", { name: "교체 승인", exact: true }).focus();
  await page.keyboard.press("Enter");
  const success = page.locator("[data-poke-lounge-move-learned='true']");
  await expect(success).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(success).toBeVisible();
  await expect(success).toContainText("연막을 잊고 화염자동차를 배웠다!");
  expect((await readBattle(page))?.player.moves).not.toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("move-learned-desktop.png") });
});
async function readBattle(page: Page): Promise<BattleE2eSnapshot | null> {
  return page.evaluate(function readSnapshot() {
    return (
      (
        window as Window & { __POKE_LOUNGE_E2E__?: LearningController }
      ).__POKE_LOUNGE_E2E__?.getBattleSnapshot() ?? null
    );
  });
}

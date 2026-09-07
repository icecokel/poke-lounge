import { devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";
type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
const snapshot = (page: Page) =>
  page.evaluate(() => (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot());
async function startWild(page: Page) {
  await page.evaluate(() =>
    (window as GameWindow).__POKE_LOUNGE_E2E__.startWildBattleForTest({
      encounter: {
        mapKey: "town",
        step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        speciesId: 129,
        name: "잉어킹",
        level: 2,
      },
      x: 656,
      y: 446,
      facing: "front",
    }),
  );
  await expect.poll(async () => (await snapshot(page))?.phase, { timeout: 15000 }).toBe("command");
  await expect(page.locator('[data-command="fight"]')).toBeEnabled();
}
for (const device of ["iPhone 13", "iPad Pro 11", "iPad Pro 11 landscape"] as const)
  test(`모바일 실제 터치 ${device}: 전투 명령·기술·가방·교체와 두 번째 전투`, async ({
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(75000);
    const context = await browser.newContext({
      ...devices[device],
      baseURL,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => {
      errors.push(e.stack ?? e.message);
      console.log("PAGE_ERROR", e.stack);
    });
    try {
      const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
      await page.route("**/api/local-test-mode", r =>
        r.fulfill({ json: { available: true, active: true } }),
      );
      await page.route("**/poke-lounge/rom-data", r =>
        r.fulfill({ json: { success: true, data } }),
      );
      await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
      await page.locator("[data-starter-confirm]").tap();
      await expect(page.locator("[data-world-local-player]")).toBeVisible();
      await page.evaluate(() => {
        const c = (window as GameWindow).__POKE_LOUNGE_E2E__,
          s = c.getGameStateSnapshot(),
          p = s.playersById[s.currentPlayerId]!;
        c.setCurrentLocalPlayerForTest({
          ...p,
          activePartySlotIndex: 0,
          inventory: { potion: 5, pokeball: 10 },
          party: [
            {
              slotIndex: 0,
              pokemon: {
                speciesId: 25,
                name: "피카츄",
                level: 50,
                currentHp: 80,
                status: "normal",
                moves: [{ id: 45, name: "울음소리", pp: 40, maxPp: 40 }],
              },
            },
            {
              slotIndex: 1,
              pokemon: {
                speciesId: 7,
                name: "꼬부기",
                level: 50,
                currentHp: 80,
                status: "normal",
                moves: [{ id: 45, name: "울음소리", pp: 40, maxPp: 40 }],
              },
            },
            ...[2, 3, 4, 5].map(slotIndex => ({ slotIndex, pokemon: null })),
          ],
        });
      });
      for (let encounter = 0; encounter < 2; encounter++) {
        await startWild(page);
        await page.locator('[data-command="fight"]').tap();
        await expect(page.locator('[data-poke-lounge-mobile-option-grid="moves"]')).toBeVisible({
          timeout: 5000,
        });
        await page.locator('[data-poke-lounge-mobile-option-grid="moves"] button').first().tap();
        await expect.poll(async () => (await snapshot(page))?.turn, { timeout: 15000 }).toBe(2);
        await expect(page.locator('[data-command="bag"]')).toBeEnabled({ timeout: 15000 });
        await page.locator('[data-command="bag"]').tap();
        await expect(page.locator('[data-poke-lounge-mobile-task="battle-bag"]')).toBeVisible();
        await page.getByRole("button", { name: "뒤로", exact: true }).tap();
        await page.locator('[data-command="pokemon"]').tap();
        await expect(page.locator('[data-poke-lounge-mobile-task="battle-party"]')).toBeVisible();
        await page.getByRole("button", { name: "뒤로", exact: true }).tap();
        await page.locator('[data-command="run"]').tap();
        await page.locator('[data-poke-lounge-mobile-task="battle-run"] footer button').tap();
        await expect
          .poll(async () => (await snapshot(page))?.result?.reason, { timeout: 10000 })
          .toBe("run");
        const confirm = page.getByRole("button", { name: "확인", exact: true });
        await expect(confirm).toBeVisible({ timeout: 15000 });
        await confirm.tap();
        await expect(page.locator("[data-world-local-player]")).toBeVisible();
      }
      expect(errors).toEqual([]);
    } finally {
      await info.attach("page-errors", {
        body: JSON.stringify(errors),
        contentType: "application/json",
      });
      await context.close();
    }
  });

import { devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";
type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
async function enter(page: Page) {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-world-local-player]")).toBeVisible();
  await expect(page.locator('[data-poke-lounge-world-surface="help"]')).toHaveCount(0);
  await page.evaluate(() => {
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
    });
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot()?.phase),
      { timeout: 20000 },
    )
    .toBe("command");
}
for (const mobile of [false, true])
  test(`전투 개선: ${mobile ? "모바일" : "데스크톱"} HP 숫자·하늘색 EXP·피격 표시`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      ...(mobile ? devices["iPhone 13"] : {}),
      baseURL,
      viewport: mobile ? { width: 390, height: 644 } : { width: 1280, height: 900 },
    });
    try {
      const page = await context.newPage();
      await enter(page);
      const screen = page.locator("[data-poke-lounge-battle-screen]");
      await expect(screen.locator('[data-poke-lounge-hp-value="player"]')).toHaveText(/^\d+\/\d+$/);
      await expect(screen.locator('[data-poke-lounge-hp-value="opponent"]')).toHaveText(
        /^\d+\/\d+$/,
      );
      const exp = screen.locator("[data-poke-lounge-experience]");
      await expect(exp).toHaveCount(1);
      await expect(exp).toHaveAccessibleName(/다음 레벨까지 \d+ EXP/);
      expect(await exp.locator("i").evaluate(el => getComputedStyle(el).backgroundColor)).toBe(
        "rgb(119, 206, 250)",
      );
      const fits = await exp.evaluate(el => {
        const p = el.closest("[data-poke-lounge-battle-hp-panel]")!.getBoundingClientRect(),
          r = el.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
      });
      expect(fits).toBe(true);
      await page.screenshot({
        path: info.outputPath(`feedback-${mobile ? "mobile" : "desktop"}.png`),
        scale: "css",
      });
      const fight = mobile
        ? page.locator('[data-command="fight"]')
        : screen.locator('[data-poke-lounge-battle-surface="command"] button').first();
      await expect(fight).toBeVisible({ timeout: 20000 });
      await fight.click();
      const moves = mobile
        ? page.locator('[data-poke-lounge-mobile-option-grid="moves"] button')
        : screen.locator('[data-poke-lounge-battle-surface="moves"] button');
      if (!mobile) {
        await expect(screen.locator("[data-poke-lounge-battle-back]")).toContainText("X");
        await page.keyboard.press("x");
        await expect(fight).toBeVisible();
        await expect(page.locator('[role="dialog"]')).toHaveCount(0);
        await fight.click();
      }
      await expect(moves.first()).toBeVisible();
      const before = await page.evaluate(
        () =>
          (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot()!.hitAnimationStartedCount,
      );
      await moves.first().click();
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot()!
                  .hitAnimationStartedCount,
            ),
          { timeout: 15000 },
        )
        .toBeGreaterThan(before);
      await expect(screen.locator('[data-poke-lounge-hp-value="opponent"]')).toHaveText(
        /^\d+\/\d+$/,
      );
    } finally {
      await context.close();
    }
  });

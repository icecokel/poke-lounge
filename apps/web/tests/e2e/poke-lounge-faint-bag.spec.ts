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
async function enter(page: Page) {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", r =>
    r.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", r => r.fulfill({ json: { success: true, data } }));
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-world-local-player]")).toBeVisible();
  await page.evaluate(() => {
    const c = (window as GameWindow).__POKE_LOUNGE_E2E__,
      s = c.getGameStateSnapshot(),
      p = s.playersById[s.currentPlayerId]!;
    c.setCurrentLocalPlayerForTest({
      ...p,
      activePartySlotIndex: 0,
      inventory: {
        pokeball: 10,
        potion: 5,
        superPotion: 3,
        antidote: 2,
        hyperPotion: 2,
        revive: 1,
      },
      party: [
        {
          slotIndex: 0,
          pokemon: {
            speciesId: 129,
            name: "잉어킹",
            level: 2,
            currentHp: 1,
            status: "normal",
            moves: [{ id: 150, name: "튀어오르기", pp: 40, maxPp: 40 }],
          },
        },
        {
          slotIndex: 1,
          pokemon: {
            speciesId: 25,
            name: "피카츄",
            level: 50,
            currentHp: 100,
            status: "normal",
            moves: [{ id: 85, name: "10만볼트", pp: 15, maxPp: 15 }],
          },
        },
        ...[2, 3, 4, 5].map(slotIndex => ({ slotIndex, pokemon: null })),
      ],
    });
    c.startWildBattleForTest({
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
    .poll(async () => (await snapshot(page))?.battleEntrancePlaying, { timeout: 20000 })
    .toBe(false);
  await expect.poll(async () => (await snapshot(page))?.message, { timeout: 15000 }).toBeNull();
}
for (const mobile of [false, true])
  test(`전투불능 회귀 ${mobile ? "모바일" : "웹"}: 선두 KO는 교체, 가방은 ${mobile ? "1열" : "2열"}`, async ({
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(65000);
    const context = await browser.newContext({
      ...(mobile ? devices["iPhone 13"] : {}),
      baseURL,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      await enter(page);
      if (mobile) await page.locator('[data-command="bag"]').click();
      else await page.keyboard.press("i");
      const bag = mobile
        ? page.locator('[data-poke-lounge-mobile-option-grid="items"]')
        : page.locator('[data-poke-lounge-battle-surface="bag"]');
      await expect(bag).toBeVisible();
      const buttons = bag.locator("button");
      const a = (await buttons.nth(0).boundingBox())!,
        b = (await buttons.nth(1).boundingBox())!;
      if (mobile) {
        expect(Math.abs(a.x - b.x)).toBeLessThan(2);
        expect(b.y).toBeGreaterThan(a.y);
      } else {
        expect(Math.abs(a.y - b.y)).toBeLessThan(2);
        expect(b.x).toBeGreaterThan(a.x);
        await page.keyboard.press("ArrowDown");
        await expect.poll(async () => (await snapshot(page))?.selectedBagItemIndex).toBe(2);
        await page.keyboard.press("ArrowRight");
        await expect.poll(async () => (await snapshot(page))?.selectedBagItemIndex).toBe(3);
        await page.keyboard.press("ArrowDown");
        await expect.poll(async () => (await snapshot(page))?.selectedBagItemIndex).toBe(5);
      }
      await page.screenshot({ path: info.outputPath(`bag-${mobile ? "mobile" : "desktop"}.png`) });
      if (mobile) await page.getByRole("button", { name: "뒤로", exact: true }).click();
      else await page.keyboard.press("x");
      await expect.poll(async () => (await snapshot(page))?.phase).toBe("command");
      // Fixed battle RNG makes the opponent choose its last damaging move; avoids a status-only turn.
      await page.evaluate(() => {
        Math.random = () => 0.99;
      });
      // Potion spends a normal turn; the low-HP lead cannot survive the opponent's attack.
      if (mobile) {
        await page.locator('[data-command="bag"]').click();
        await page
          .locator('[data-poke-lounge-mobile-option-grid="items"] button')
          .filter({ hasText: "상처약" })
          .first()
          .click();
        await page.locator("[data-poke-lounge-confirm-item]").click();
      } else {
        await page.keyboard.press("i");
        await page
          .locator('[data-poke-lounge-battle-surface="bag"] button')
          .filter({ hasText: "상처약" })
          .first()
          .click();
      }
      await expect
        .poll(async () => (await snapshot(page))?.isForcedPartySwitch, { timeout: 20000 })
        .toBe(true);
      await expect.poll(async () => (await snapshot(page))?.message, { timeout: 20000 }).toBeNull();
      const faint = await snapshot(page);
      expect(faint?.result).toBeNull();
      expect(faint?.phase).toBe("party-select");
      expect(faint?.player.currentHp).toBe(0);
      await page.screenshot({
        path: info.outputPath(`forced-switch-${mobile ? "mobile" : "desktop"}.png`),
      });
      if (mobile) {
        const task = page.locator('[data-poke-lounge-mobile-task="battle-party"]');
        await task.getByRole("button").filter({ hasText: "피카츄" }).click();
        await page.locator("[data-poke-lounge-confirm-party]").click();
      } else {
        await page.keyboard.press("x"); // Forced selection cannot be cancelled into a dead-lead command.
        expect((await snapshot(page))?.phase).toBe("party-select");
        await page.keyboard.press("z");
      }
      await expect
        .poll(async () => (await snapshot(page))?.player.activePartySlotIndex, { timeout: 15000 })
        .toBe(1);
      await expect
        .poll(async () => (await snapshot(page))?.phase, { timeout: 15000 })
        .toBe("command");
      const resumed = await snapshot(page);
      expect(resumed?.result).toBeNull();
      expect(resumed?.player.currentHp).toBeGreaterThan(0);
      expect(resumed?.turn).toBe(faint?.turn);
      expect(resumed?.player.name).toBe("피카츄");
      expect(await page.locator("[data-poke-lounge-battle-screen]").count()).toBe(1);
    } finally {
      await context.close();
    }
  });

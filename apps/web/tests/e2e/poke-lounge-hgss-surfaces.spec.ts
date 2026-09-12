import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
// Fixtures arrange the world; all selections/confirmations use native browser inputs.
async function prepare(page: Page, start = true) {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", r =>
    r.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", r => r.fulfill({ json: { success: true, data } }));
  await page.route("**/poke-lounge/shops/basic/items", r =>
    r.fulfill({ json: { success: true, data: [17, 18, 4, 26, 2, 28] } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
  await expect(page.locator("[data-starter-panel]")).toBeVisible({ timeout: 30_000 });
  if (!start) return;
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-world-local-player]")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const c = (window as GameWindow).__POKE_LOUNGE_E2E__;
    const s = c.getGameStateSnapshot(),
      p = s.playersById[s.currentPlayerId];
    const original = p.party.find(slot => slot.pokemon)?.pokemon;
    if (!original) throw new Error("Starter fixture missing");
    const healthy = {
      ...original,
      currentHp: original.maxHp ?? 30,
      maxHp: original.maxHp ?? 30,
      status: "normal" as const,
    };
    c.setCurrentLocalPlayerForTest({
      ...p,
      activePartySlotIndex: 0,
      wallet: { ...p.wallet, pokeDollars: 5000 },
      inventory: { ...p.inventory, potion: 5, pokeball: 10 },
      party: Array.from({ length: 6 }, (_, slotIndex) => ({
        slotIndex,
        pokemon:
          slotIndex === 0
            ? { ...healthy, currentHp: 5 }
            : slotIndex === 2
              ? {
                  ...healthy,
                  speciesId: 1,
                  name: "이상해씨",
                  currentHp: 0,
                  status: "fainted" as const,
                }
              : slotIndex === 5
                ? { ...healthy, speciesId: 7, name: "꼬부기" }
                : null,
      })),
      pokemonBox: Array.from({ length: 12 }, (_, index) => ({
        ...healthy,
        speciesId: index % 2 ? 25 : 7,
        name: index % 2 ? "피카츄" : "꼬부기",
      })),
    });
  });
}

async function player(page: Page) {
  return page.evaluate(() => {
    const s = (window as GameWindow).__POKE_LOUNGE_E2E__.getGameStateSnapshot();
    const p = s.playersById[s.currentPlayerId];
    return {
      lead: p.activePartySlotIndex,
      party: p.party.filter(slot => slot.pokemon).length,
      box: p.pokemonBox.length,
      money: p.wallet.pokeDollars,
      potion: p.inventory.potion ?? 0,
    };
  });
}
async function facility(page: Page, surface: "pc" | "shop") {
  await page.evaluate(
    key => (window as GameWindow).__POKE_LOUNGE_E2E__.openWorldSurfaceForTest(key),
    surface,
  );
}
async function fits(surface: Locator) {
  await expect(surface).toBeVisible();
  await expect
    .poll(() =>
      surface.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const body = el.querySelector<HTMLElement>("[data-poke-lounge-task-body]");
        const footer = el.querySelector<HTMLElement>("[data-poke-lounge-task-footer]");
        return {
          within:
            rect.left >= -1 &&
            rect.top >= -1 &&
            rect.right <= window.innerWidth + 1 &&
            rect.bottom <= window.innerHeight + 1,
          noHorizontalScroll:
            el.scrollWidth <= el.clientWidth + 1 &&
            (!body || body.scrollWidth <= body.clientWidth + 1),
          footer: !footer || footer.getBoundingClientRect().bottom <= rect.bottom + 1,
        };
      }),
    )
    .toEqual({ within: true, noHorizontalScroll: true, footer: true });
}
async function closeTask(page: Page) {
  await page.locator("[data-poke-lounge-mobile-task] [data-poke-lounge-mobile-deck-close]").tap();
  await expect(page.locator("[data-poke-lounge-mobile-task]")).toHaveCount(0);
}

test.describe("HGSS touch surfaces", () => {
  test.use({
    userAgent: devices["iPhone 13"].userAgent,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("starter remains outside the new palette", async ({ page }, info) => {
    await prepare(page, false);
    const starter = page.locator("[data-starter-panel]");
    expect(await starter.evaluate(el => getComputedStyle(el).getPropertyValue("--hg-ink"))).toBe(
      "",
    );
    await expect(starter.locator("[data-poke-lounge-ui='heartgold']")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("starter-unchanged.png"), scale: "css" });
    await page.locator("[data-starter-confirm]").tap();
    await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible();
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
  ]) {
    test(`party bag PC shop settings fit ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.screenshot({ path: info.outputPath("field.png"), scale: "css" });
      await page.locator("[data-poke-lounge-mobile-party]").tap();
      let task = page.locator("[data-poke-lounge-mobile-task='world-party']");
      await fits(task);
      await expect(task.locator("[data-poke-lounge-pokemon-card]")).toHaveCount(3);
      await expect(task.locator("[data-poke-lounge-pokemon-card='2']")).toHaveAttribute(
        "data-fainted",
        "true",
      );
      await expect(
        task.locator("[data-poke-lounge-pokemon-card='0'] [role='meter']"),
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath("party.png"), scale: "css" });
      await closeTask(page);
      await page.locator("[data-mobile-control='bag']").tap();
      task = page.locator("[data-poke-lounge-mobile-task='world-inventory-items']");
      await fits(task);
      await expect(task.locator("[data-poke-lounge-item-icon='potion']")).toBeVisible();
      await page.screenshot({ path: info.outputPath("bag.png"), scale: "css" });
      await closeTask(page);
      for (const screen of ["pc", "shop"] as const) {
        await facility(page, screen);
        task = page.locator(`[data-poke-lounge-mobile-task='world-${screen}']`);
        await fits(task);
        if (screen === "pc") {
          await expect(task.locator("[data-poke-lounge-pc-party-slot]")).toHaveCount(6);
          await task.getByRole("button", { name: "박스", exact: true }).tap();
          await expect(task.locator("[data-poke-lounge-pc-box-slot]")).toHaveCount(12);
          await expect(
            task.locator("[data-poke-lounge-pc-box-slot='0'] [data-poke-lounge-pokemon-thumbnail]"),
          ).toBeVisible();
          await task.locator("[data-poke-lounge-pc-box-slot='11']").tap();
          await expect(task.locator("[data-poke-lounge-pc-selection]")).toContainText("피카츄");
          await fits(task);
          await task.locator("[data-poke-lounge-task-body]").evaluate(el => {
            el.scrollTop = 0;
          });
        } else {
          await expect(task.locator("[data-poke-lounge-shop-item]").first()).toBeVisible();
          await expect(task.locator("[data-poke-lounge-item-description]")).not.toHaveText("");
        }
        await page.screenshot({ path: info.outputPath(`${screen}.png`), scale: "css" });
        await closeTask(page);
      }
      await page.locator("[data-poke-lounge-mobile-menu]").tap();
      task = page.locator("[data-poke-lounge-mobile-task='settings']");
      await fits(task);
      await page.screenshot({ path: info.outputPath("settings.png"), scale: "css" });
      await closeTask(page);
    });
  }
  test("candidate selection does not transfer, buy or consume until confirmation", async ({
    page,
  }) => {
    await prepare(page);
    const original = await player(page);
    await facility(page, "pc");
    let task = page.locator("[data-poke-lounge-mobile-task='world-pc']");
    await task.locator("[data-poke-lounge-pc-party-slot='5']").tap();
    expect(await player(page)).toEqual(original);
    await task.getByRole("button", { name: "보관", exact: true }).tap();
    await expect.poll(async () => (await player(page)).box).toBe(13);
    await task.getByRole("button", { name: "박스", exact: true }).tap();
    await task.locator("[data-poke-lounge-pc-box-slot='0']").tap();
    await task.getByRole("button", { name: "데려오기", exact: true }).tap();
    await expect.poll(async () => (await player(page)).party).toBe(3);
    await expect.poll(async () => (await player(page)).box).toBe(12);
    await closeTask(page);
    await facility(page, "shop");
    task = page.locator("[data-poke-lounge-mobile-task='world-shop']");
    await task.locator("[data-poke-lounge-shop-item='potion']").tap();
    const beforeBuy = await player(page);
    expect(beforeBuy.money).toBe(original.money);
    await task.getByRole("button", { name: "구매", exact: true }).tap();
    await expect.poll(async () => (await player(page)).potion).toBe(beforeBuy.potion + 1);
    expect((await player(page)).money).toBeLessThan(beforeBuy.money);
    await closeTask(page);
    await page.locator("[data-mobile-control='bag']").tap();
    task = page.locator("[data-poke-lounge-mobile-task='world-inventory-items']");
    await task.locator("[data-poke-lounge-item-row='potion']").tap();
    const beforeCancel = await player(page);
    await closeTask(page);
    expect(await player(page)).toEqual(beforeCancel);
  });
  test("settings still cycles volume and reload cancel preserves the session", async ({
    page,
  }, info) => {
    await prepare(page);
    await page.locator("[data-poke-lounge-mobile-menu]").tap();
    const task = page.locator("[data-poke-lounge-mobile-task='settings']");
    const volume = task.locator("[data-poke-lounge-setting-action='volume']");
    const previous = await volume.innerText();
    await volume.tap();
    await expect(volume).not.toHaveText(previous);
    await task.locator("[data-poke-lounge-page-reload]").tap();
    const dialog = page.locator("[data-poke-lounge-reload-confirm]");
    await fits(dialog);
    await page.screenshot({ path: info.outputPath("reload-dialog.png"), scale: "css" });
    await dialog.getByRole("button", { name: "계속 플레이", exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await closeTask(page);
    expect((await player(page)).party).toBe(3);
  });
  test("150 percent text, nurse notice and tournament record remain readable", async ({
    page,
  }, info) => {
    await prepare(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "150%";
    });
    for (const screen of ["shop", "pc"] as const) {
      await facility(page, screen);
      await fits(page.locator(`[data-poke-lounge-mobile-task='world-${screen}']`));
      await closeTask(page);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
      (window as GameWindow).__POKE_LOUNGE_E2E__.healAtNurseForTest();
    });
    const nurse = page.locator('[class*="worldNurseMessage"]');
    await expect(nurse).toBeVisible();
    await page.screenshot({ path: info.outputPath("nurse-notice.png"), scale: "css" });
    await page.evaluate(() =>
      (window as GameWindow).__POKE_LOUNGE_E2E__.completeTournamentForTest(),
    );
    const result = page.getByTestId("poke-lounge-result-panel");
    await expect(result.getByText("플레이 결과", { exact: true })).toBeVisible();
    await expect(result.getByTestId("poke-lounge-result-score")).toHaveText("300");
    for (const size of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await fits(result);
      expect(await result.evaluate(el => getComputedStyle(el).overflowY)).toBe("auto");
      expect(await result.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
    }
    await page.screenshot({ path: info.outputPath("tournament-record.png"), scale: "css" });
  });
});

test("HGSS desktop PC and shop retain selections and close actions", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page);
  for (const surface of ["shop", "pc"] as const) {
    await facility(page, surface);
    const panel = page.locator(`[data-poke-lounge-world-surface='${surface}']`);
    await fits(panel);
    if (surface === "pc") {
      await panel.getByRole("button", { name: "박스", exact: true }).click();
      await panel.locator("[data-poke-lounge-pc-box-slot='11']").click();
      await expect(panel.locator("[data-poke-lounge-pc-selection]")).toContainText("피카츄");
      await panel.locator('[class*="worldSceneBody"]').evaluate(el => {
        el.scrollTop = 0;
      });
    }
    await page.screenshot({ path: info.outputPath(`desktop-${surface}.png`), scale: "css" });
    await panel
      .getByRole("button", { name: /뒤로|닫기/ })
      .first()
      .click();
    await expect(panel).toHaveCount(0);
  }
  expect((await player(page)).party).toBe(3);
});

import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

test.use({
  viewport: { width: 390, height: 844 },
  userAgent: devices["iPhone 13"].userAgent,
  isMobile: true,
  hasTouch: true,
});

// Arrange a deterministic wild encounter; every command below uses real browser taps.
// This is UI regression coverage, not a full three-round player playthrough.
async function openBattle(page: Page): Promise<Locator> {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0&localTest=1");
  const starter = page.locator("[data-starter-confirm]");
  const explore = page.locator("[data-poke-lounge-mobile-deck='explore']");
  await expect
    .poll(async () => (await starter.isVisible()) || (await explore.isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  if (await starter.isVisible()) await starter.tap();
  await expect(explore).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const controller = (window as Window & { __POKE_LOUNGE_E2E__?: PokeLoungeE2eController })
      .__POKE_LOUNGE_E2E__;
    if (!controller) throw new Error("E2E fixture controller is missing");
    controller.startWildBattleForTest({
      encounter: {
        level: 6,
        mapKey: "town",
        name: "꼬렛",
        speciesId: 19,
        step: { from: { x: 687, y: 1151 }, to: { x: 688, y: 1151 } },
      },
      facing: "front",
      x: 687,
      y: 1151,
    });
  });
  const commands = page.locator("[data-poke-lounge-mobile-deck='battle-command']");
  await expect(commands).toBeVisible({ timeout: 30_000 });
  return commands;
}

async function expectCommandLayout(commands: Locator) {
  await expect(commands.locator("[data-command]")).toHaveCount(4);
  await expect(commands.locator("[data-poke-lounge-party-ball]")).toHaveCount(6);
  await expect(commands.locator("[data-command='fight']")).toContainText("싸운다");
  await expect(commands.locator("[data-command='run']")).toContainText("도망간다");
  await expect
    .poll(() =>
      commands.evaluate(element => {
        const buttons = [...element.querySelectorAll<HTMLButtonElement>("[data-command]")];
        const dock = element
          .closest("[data-poke-lounge-mobile-control-dock]")!
          .getBoundingClientRect();
        const rects = buttons.map(button => button.getBoundingClientRect());
        const [fight, bag, run, pokemon] = rects;
        return {
          order: buttons.map(button => button.dataset.command).join(","),
          hero: fight.width > bag.width * 2 && fight.height >= 96,
          lowerRow:
            Math.abs(bag.top - run.top) < 1 &&
            Math.abs(run.top - pokemon.top) < 1 &&
            bag.right < run.left &&
            run.right < pokemon.left &&
            fight.bottom < bag.top,
          reachable: rects.every(
            rect =>
              rect.height >= 64 &&
              rect.width >= 48 &&
              rect.top >= dock.top - 1 &&
              rect.bottom <= dock.bottom + 1 &&
              rect.left >= dock.left - 1 &&
              rect.right <= dock.right + 1 &&
              rect.bottom <= window.innerHeight + 1,
          ),
          noTextOverflow: buttons.every(
            button =>
              button.scrollWidth <= button.clientWidth + 1 &&
              button.scrollHeight <= button.clientHeight + 1,
          ),
        };
      }),
    )
    .toEqual({
      order: "fight,bag,run,pokemon",
      hero: true,
      lowerRow: true,
      reachable: true,
      noTextOverflow: true,
    });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
]) {
  test(`HeartGold command pad fits ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const commands = await openBattle(page);
    await expectCommandLayout(commands);
    await expect(commands.locator("[data-poke-lounge-party-ball][data-state='ready']")).toHaveCount(
      1,
    );
    await expect(commands.locator("[data-poke-lounge-party-ball][data-state='empty']")).toHaveCount(
      5,
    );
    await expect(
      commands.locator("[data-command='fight'] [data-poke-lounge-pokemon-thumbnail]"),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("heartgold-command-pad.png"), scale: "css" });
  });
}

async function turn(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & { __POKE_LOUNGE_E2E__?: PokeLoungeE2eController }
      ).__POKE_LOUNGE_E2E__?.getBattleSnapshot()?.turn ?? null,
  );
}

test("HeartGold commands open the correct task, cancel safely, and execute one move", async ({
  page,
}, testInfo) => {
  const commands = await openBattle(page);
  const initialTurn = await turn(page);
  expect(initialTurn).not.toBeNull();
  for (const [command, task] of [
    ["bag", "battle-bag"],
    ["pokemon", "battle-party"],
    ["run", "battle-run"],
  ] as const) {
    await commands.locator(`[data-command='${command}']`).tap();
    const surface = page.locator(`[data-poke-lounge-mobile-task='${task}']`);
    await expect(surface).toBeVisible();
    expect(await turn(page)).toBe(initialTurn);
    await surface.getByRole("button", { name: "뒤로", exact: true }).tap();
    await expect(commands).toBeVisible();
    expect(await turn(page)).toBe(initialTurn);
  }
  await commands.getByRole("button", { name: "싸운다", exact: true }).tap();
  const moves = page.locator("[data-poke-lounge-mobile-deck='battle-moves']");
  await expect(moves).toBeVisible();
  await expect(moves).toContainText("PP");
  await page.screenshot({ path: testInfo.outputPath("heartgold-moves.png"), scale: "css" });
  await moves.getByRole("button", { name: "뒤로", exact: true }).tap();
  expect(await turn(page)).toBe(initialTurn);
  await commands.locator("[data-command='fight']").tap();
  await moves
    .locator("[data-poke-lounge-mobile-option-grid='moves'] button:not(:disabled)")
    .first()
    .tap();
  await expect.poll(() => turn(page), { timeout: 15_000 }).toBe(initialTurn! + 1);
  await expect(commands).toBeVisible({ timeout: 15_000 });
  await expectCommandLayout(commands);
  await commands.locator("[data-command='run']").tap();
  const run = page.locator("[data-poke-lounge-mobile-task='battle-run']");
  await run.getByRole("button", { name: "도망 시도", exact: true }).tap();
  await expect(run).toHaveCount(0);
});

test("HeartGold command pad survives rotation and enlarged text", async ({ page }) => {
  const commands = await openBattle(page);
  const initialTurn = await turn(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectCommandLayout(commands);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "150%";
  });
  await expectCommandLayout(commands);
  expect(await turn(page)).toBe(initialTurn);
});

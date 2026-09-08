import {
  chromium,
  webkit,
  devices,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type CDPSession,
} from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
const profiles = [
  { name: "Safari iOS · WebKit", engine: "webkit", device: "iPhone 13", suffix: "" },
  {
    name: "Chrome iOS · WebKit",
    engine: "webkit",
    device: "iPhone 13",
    suffix: " CriOS/140.0.0.0",
  },
  { name: "Chrome Android · Chromium", engine: "chromium", device: "Pixel 7", suffix: "" },
  // Synthetic in-app identifiers test application branching, not the native Kakao app container.
  {
    name: "Kakao iOS · WebKit UA",
    engine: "webkit",
    device: "iPhone 13",
    suffix: " KAKAOTALK/TEST (INAPP)",
  },
  {
    name: "Kakao Android · Chromium UA",
    engine: "chromium",
    device: "Pixel 7",
    suffix: " KAKAOTALK/TEST (INAPP)",
  },
] as const;

async function touch(context: BrowserContext, page: Page, engine: string) {
  const cdp: CDPSession | null = engine === "chromium" ? await context.newCDPSession(page) : null;
  return async (locator: Locator) => {
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    await locator.scrollIntoViewIfNeeded();
    if (!cdp) {
      await locator.tap();
      return;
    }
    const box = (await locator.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    expect(
      await locator.evaluate(
        (element, point) => {
          const top = document.elementFromPoint(point.x, point.y);
          return top === element || element.contains(top);
        },
        { x, y },
      ),
    ).toBe(true);
    // A real finger spans multiple animation frames. Hold through multiple frames to catch missed activation.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1, radiusX: 3, radiusY: 3 }],
    });
    try {
      await page.waitForTimeout(120);
    } finally {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
  };
}

for (const profile of profiles) {
  test(`모바일 호환성 ${profile.name}: 필드 메뉴·전투·교체·가방·복귀 터치`, async ({
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    const browser = await (profile.engine === "webkit" ? webkit : chromium).launch();
    const device = devices[profile.device]!;
    const context = await browser.newContext({
      ...device,
      baseURL,
      userAgent: device.userAgent + profile.suffix,
    });
    const page = await context.newPage();
    const tap = await touch(context, page, profile.engine);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const snapshot = () =>
      page.evaluate(() => (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot());
    try {
      const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
      await page.route("**/api/local-test-mode", route =>
        route.fulfill({ json: { available: true, active: true } }),
      );
      await page.route("**/poke-lounge/rom-data", route =>
        route.fulfill({ json: { success: true, data } }),
      );
      await gotoWithRetry(
        page,
        "/ko-KR/game/poke-lounge?e2e=1&e2eBattle=&localTest=1&wildEncounterRate=0",
      );
      await tap(page.locator("[data-starter-confirm]"));
      await expect(page.locator("[data-world-local-player]")).toBeVisible();
      await info.attach("emulated-environment", {
        body: JSON.stringify({
          profile,
          version: browser.version(),
          touch: await page.evaluate(() => navigator.maxTouchPoints),
        }),
        contentType: "application/json",
      });
      await tap(page.locator("[data-poke-lounge-mobile-party]"));
      await expect(page.locator('[data-poke-lounge-mobile-task="world-party"]')).toBeVisible();
      await tap(page.locator("[data-poke-lounge-mobile-deck-close]"));
      await expect(page.locator("[data-poke-lounge-mobile-task]")).toHaveCount(0);
      await page.evaluate(() => {
        const c = (window as GameWindow).__POKE_LOUNGE_E2E__,
          s = c.getGameStateSnapshot(),
          p = s.playersById[s.currentPlayerId]!;
        c.setCurrentLocalPlayerForTest({
          ...p,
          activePartySlotIndex: 0,
          inventory: { pokeball: 10, potion: 5 },
          party: [
            {
              slotIndex: 0,
              pokemon: {
                speciesId: 25,
                name: "피카츄",
                level: 50,
                currentHp: 20,
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
                currentHp: 20,
                status: "normal",
                moves: [{ id: 45, name: "울음소리", pp: 40, maxPp: 40 }],
              },
            },
            ...[2, 3, 4, 5].map(slotIndex => ({ slotIndex, pokemon: null })),
          ],
        });
      });
      for (let encounter = 0; encounter < 2; encounter++) {
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
        await expect(page.locator('[data-command="fight"]')).toBeVisible({ timeout: 20000 });
        await tap(page.locator('[data-command="fight"]'));
        await expect(page.locator('[data-poke-lounge-mobile-option-grid="moves"]')).toBeVisible();
        await tap(page.locator('[data-poke-lounge-mobile-option-grid="moves"] button').first());
        await expect.poll(async () => (await snapshot())?.turn).toBe(2);
        await expect(page.locator('[data-command="bag"]')).toBeVisible({ timeout: 20000 });
        await tap(page.locator('[data-command="bag"]'));
        const bag = page.locator('[data-poke-lounge-mobile-task="battle-bag"]');
        await expect(bag).toBeVisible();
        // Merely opening and cancelling the bag must preserve the turn and inventory.
        await tap(bag.getByRole("button", { name: "뒤로", exact: true }));
        expect((await snapshot())?.turn).toBe(2);
        await tap(page.locator('[data-command="bag"]'));
        await tap(bag.locator('[data-poke-lounge-item-row="potion"]'));
        await tap(bag.locator("[data-poke-lounge-confirm-item]"));
        const target = page.locator('[data-poke-lounge-mobile-task="battle-party"]');
        await expect(target).toBeVisible();
        const active = (await snapshot())!.player.activePartySlotIndex;
        const hpBefore = (await snapshot())!.player.currentHp;
        await tap(target.locator(`[data-poke-lounge-pokemon-card="${active}"]`));
        await tap(target.locator("[data-poke-lounge-confirm-party]"));
        await expect.poll(async () => (await snapshot())?.turn).toBe(3);
        expect((await snapshot())!.player.currentHp).toBeGreaterThan(hpBefore);
        expect(
          await page.evaluate(() => {
            const s = (window as GameWindow).__POKE_LOUNGE_E2E__.getGameStateSnapshot();
            return s.playersById[s.currentPlayerId]!.inventory.potion;
          }),
        ).toBe(4 - encounter);
        await expect(page.locator('[data-command="pokemon"]')).toBeVisible({ timeout: 20000 });
        await tap(page.locator('[data-command="pokemon"]'));
        const party = page.locator('[data-poke-lounge-mobile-task="battle-party"]');
        await expect(party).toBeVisible();
        // Rotate and return from another tab while an inert-backed task screen is open.
        const portrait = page.viewportSize()!;
        await page.setViewportSize({ width: portrait.height, height: portrait.width });
        await page.setViewportSize(portrait);
        const background = await context.newPage();
        await background.bringToFront();
        await page.bringToFront();
        await background.close();
        await tap(party.locator(`[data-poke-lounge-pokemon-card="${active === 0 ? 1 : 0}"]`));
        await tap(party.locator("[data-poke-lounge-confirm-party]"));
        await expect.poll(async () => (await snapshot())?.turn).toBe(4);
        expect((await snapshot())?.player.activePartySlotIndex).toBe(active === 0 ? 1 : 0);
        await expect(page.locator('[data-command="run"]')).toBeVisible({ timeout: 20000 });
        await tap(page.locator('[data-command="run"]'));
        await tap(page.locator('[data-poke-lounge-mobile-task="battle-run"] footer button'));
        await expect.poll(async () => (await snapshot())?.result?.reason).toBe("run");
        await tap(page.getByRole("button", { name: "확인", exact: true }));
        await expect(page.locator("[data-world-local-player]")).toBeVisible();
        await expect(page.locator('[data-testid="poke-lounge-page"] [inert]')).toHaveCount(0);
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath("after-second-battle.png") });
    } finally {
      await info.attach("errors", {
        body: JSON.stringify(errors),
        contentType: "application/json",
      });
      await context.close();
      await browser.close();
    }
  });
}

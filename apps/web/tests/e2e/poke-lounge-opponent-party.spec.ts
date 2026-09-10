/** Focused fixture regression, not one of the stopped five-run player campaigns. */
import { chromium, webkit, devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
const profiles = [
  { name: "desktop", engine: "chromium", mobile: false, width: 1280, height: 900, locale: "ko-KR" },
  {
    name: "small-mobile",
    engine: "chromium",
    mobile: true,
    width: 320,
    height: 664,
    locale: "ko-KR",
  },
  {
    name: "webkit-mobile",
    engine: "webkit",
    mobile: true,
    width: 390,
    height: 844,
    locale: "ja-JP",
  },
  {
    name: "large-mobile",
    engine: "chromium",
    mobile: true,
    width: 430,
    height: 932,
    locale: "en-US",
  },
] as const;

async function enter(page: Page, locale: string) {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(
    page,
    `/${locale}/game/poke-lounge?e2e=1&e2eBattle=&localTest=1&wildEncounterRate=0`,
  );
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-world-local-player]")).toBeVisible({ timeout: 20000 });
}

for (const profile of profiles) {
  test(`상대 파티 HUD ${profile.name}: 실제 경기 슬롯·전투불능·메뉴 중 유지·패널 아래 배치`, async ({
    baseURL,
  }, info) => {
    test.setTimeout(90000);
    const browser = await (profile.engine === "webkit" ? webkit : chromium).launch();
    const context = await browser.newContext({
      ...(profile.mobile ? devices["iPhone 13"] : {}),
      baseURL,
      viewport: { width: profile.width, height: profile.height },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await enter(page, profile.locale);
      // Six-member test party is isolated in this fixture context. No real room or server writes.
      await page.evaluate(() => {
        const c = (window as GameWindow).__POKE_LOUNGE_E2E__;
        const state = c.getGameStateSnapshot();
        const player = state.playersById[state.currentPlayerId]!;
        const lead = player.party.find(slot => slot.pokemon)?.pokemon;
        if (!lead) throw new Error("Starter fixture missing");
        c.setCurrentLocalPlayerForTest({
          ...player,
          activePartySlotIndex: 0,
          party: Array.from({ length: 6 }, (_, slotIndex) => ({
            slotIndex,
            pokemon: {
              ...structuredClone(lead),
              currentHp: slotIndex === 5 ? 0 : lead.maxHp,
              status: slotIndex === 5 ? "fainted" : slotIndex === 3 ? "paralyzed" : "normal",
            },
          })),
        });
        c.startSoloChallengeForTest();
      });
      const screen = page.locator("[data-poke-lounge-battle-screen]");
      const indicator = screen.locator("[data-poke-lounge-opponent-party]");
      await expect(indicator).toBeVisible({ timeout: 20000 });
      await expect(indicator).toHaveAttribute("data-total", "6");
      await expect(indicator).toHaveAttribute("data-remaining", "5");
      await expect(indicator.locator("[data-slot-index]")).toHaveCount(6);
      await expect(indicator.locator("[data-fainted]")).toHaveCount(1);
      await expect(indicator.locator("[data-active]")).toHaveAttribute("data-slot-index", "0");
      await expect(indicator.locator("[data-poke-lounge-opponent-party-count]")).toContainText(
        "5/6",
      );
      await expect(indicator).toHaveAccessibleName(
        profile.locale === "ko-KR"
          ? /상대.*6마리 중 5마리.*현재 출전/
          : profile.locale === "ja-JP"
            ? /6匹中5匹/
            : /5 of 6.*active/,
      );
      const geometry = await indicator.evaluate(el => {
        const panel = document.querySelector('[data-poke-lounge-battle-hp-panel="opponent"]')!;
        const r = el.getBoundingClientRect(),
          p = panel.getBoundingClientRect();
        const stage = el.closest("[data-poke-lounge-battle-layout]")!.getBoundingClientRect();
        const contents = [
          ...el.querySelectorAll("[data-slot-index], [data-poke-lounge-opponent-party-count]"),
        ].map(e => e.getBoundingClientRect());
        return {
          belowHp: r.top >= p.bottom,
          aligned: Math.abs(r.left - p.left) < 1,
          widthMatches: Math.abs(r.width - p.width) < 1,
          contentsFit: contents.every(
            c =>
              c.left >= r.left - 1 &&
              c.right <= r.right + 1 &&
              c.top >= r.top - 1 &&
              c.bottom <= r.bottom + 1,
          ),
          inStage: r.left >= stage.left && r.right <= stage.right && r.bottom <= stage.bottom,
          pointerEvents: getComputedStyle(el).pointerEvents,
          focusableCount: el.querySelectorAll("button, a, input, [tabindex]").length,
        };
      });
      expect(geometry).toEqual({
        belowHp: true,
        aligned: true,
        widthMatches: true,
        contentsFit: true,
        inStage: true,
        pointerEvents: "none",
        focusableCount: 0,
      });
      await info.attach("party-hud-geometry", {
        body: JSON.stringify(geometry),
        contentType: "application/json",
      });
      await expect(screen).toHaveAttribute("data-poke-lounge-battle-phase", "command", {
        timeout: 20000,
      });
      await page.screenshot({
        path: info.outputPath(`opponent-party-${profile.name}.png`),
        scale: "css",
      });
      const fight = profile.mobile
        ? page.locator('[data-command="fight"]')
        : screen.locator('[data-poke-lounge-battle-surface="command"] button').first();
      await fight.click();
      const moves = profile.mobile
        ? page.locator('[data-poke-lounge-mobile-option-grid="moves"]')
        : screen.locator('[data-poke-lounge-battle-surface="moves"]');
      await expect(moves).toBeVisible();
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveAttribute("data-remaining", "5");
      await page.keyboard.press(profile.mobile ? "Escape" : "x");
      await expect(fight).toBeVisible();
      if (profile.mobile) {
        await page.locator('[data-command="pokemon"]').click();
        const task = page.locator('[data-poke-lounge-mobile-task="battle-party"]');
        await expect(task).toBeVisible();
        const contextual = task.locator('[data-poke-lounge-opponent-party="context"]');
        await expect(contextual).toBeVisible();
        await expect(contextual).toHaveAttribute("data-remaining", "5");
        await expect(contextual.locator("[data-slot-index]")).toHaveCount(6);
        expect(await contextual.evaluate(el => !el.closest("[inert]"))).toBe(true);
        await page.screenshot({
          path: info.outputPath(`opponent-party-context-${profile.name}.png`),
          scale: "css",
        });
        await page.keyboard.press("Escape");
        await expect(task).toHaveCount(0);
        await expect(indicator).toBeVisible();
      } else {
        await screen.locator('[data-poke-lounge-battle-surface="command"] button').nth(2).click();
        await expect(screen.locator('[data-poke-lounge-battle-surface="party"]')).toBeVisible();
        await expect(indicator).toBeVisible();
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

test("야생전에는 상대 파티 표시줄이 없다", async ({ page }) => {
  await enter(page, "ko-KR");
  await page.evaluate(() =>
    (window as GameWindow).__POKE_LOUNGE_E2E__.startWildBattleForTest({
      encounter: {
        mapKey: "town",
        step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        speciesId: 19,
        name: "꼬렛",
        level: 5,
      },
      x: 656,
      y: 446,
      facing: "front",
    }),
  );
  await expect(page.locator('[data-poke-lounge-battle-hp-panel="opponent"]')).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator("[data-poke-lounge-opponent-party]")).toHaveCount(0);
});

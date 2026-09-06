import { devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";
type GameWindow = Window & { __POKE_LOUNGE_E2E__: PokeLoungeE2eController };
let data: Awaited<ReturnType<typeof createRuntimeRomDataFixture>>;
test.beforeAll(async () => {
  data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
});
async function start(
  page: Page,
  moveId: number,
  status: "normal" | "poisoned" | "burned" = "normal",
) {
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&localTest=1&wildEncounterRate=0");
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-world-local-player]")).toBeVisible();
  await page.evaluate(
    ({ moveId, status }) => {
      const c = (window as GameWindow).__POKE_LOUNGE_E2E__,
        state = c.getGameStateSnapshot(),
        player = state.playersById[state.currentPlayerId]!;
      c.setCurrentLocalPlayerForTest({
        ...player,
        activePartySlotIndex: 0,
        party: [
          {
            slotIndex: 0,
            pokemon: {
              speciesId: 25,
              name: "피카츄",
              level: 30,
              currentHp: 70,
              maxHp: 70,
              status,
              moves: [{ id: moveId, name: "테스트기술", pp: 20, maxPp: 20 }],
            },
          },
          ...[1, 2, 3, 4, 5].map(slotIndex => ({ slotIndex, pokemon: null })),
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
    },
    { moveId, status },
  );
  await expect
    .poll(() => snapshot(page).then(s => s?.battleEntrancePlaying), { timeout: 20000 })
    .toBe(false);
  await expect
    .poll(() => snapshot(page).then(s => s?.phase === "command" && s.messageQueue.length === 0), {
      timeout: 20000,
    })
    .toBe(true);
}
const snapshot = (page: Page) =>
  page.evaluate(() => (window as GameWindow).__POKE_LOUNGE_E2E__.getBattleSnapshot());
async function attack(page: Page, mobile = false) {
  if (mobile) {
    await page.locator('[data-command="fight"]').click();
    await page.locator('[data-poke-lounge-mobile-option-grid="moves"] button').first().click();
  } else {
    await page.keyboard.press("z");
    await expect(page.locator('[data-poke-lounge-battle-surface="moves"]')).toBeVisible();
    await page.keyboard.press("z");
  }
}

for (const [moveId, name] of [
  [52, "불꽃세례"],
  [55, "물대포"],
  [85, "10만볼트"],
  [58, "냉동빔"],
] as const)
  test(`롬 기술 이펙트: ${name}는 고유 파티클과 명중 시점 HP를 표시한다`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await start(page, moveId);
    const failed: string[] = [];
    page.on("requestfailed", r => {
      if (r.url().includes("/battle-effects/")) failed.push(r.url());
    });
    await attack(page);
    const effect = page.locator(`[data-battle-effect="move"][data-move-id="${moveId}"]`);
    await expect(effect).toBeVisible();
    await expect
      .poll(() => effect.locator("image").count(), { intervals: [30], timeout: 3000 })
      .toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`move-${moveId}.png`) });
    await expect
      .poll(() => snapshot(page).then(s => s?.effect?.cue.moveId !== moveId), { timeout: 6000 })
      .toBe(true);
    expect(failed).toEqual([]);
  });

for (const [moveId, name] of [
  [19, "공중날기"],
  [91, "구멍파기"],
] as const)
  for (const mobile of [false, true])
    test(`롬 특수 동작: ${name} ${mobile ? "모바일" : "웹"} 숨김·재등장·복귀`, async ({
      browser,
      baseURL,
    }, info) => {
      const context = await browser.newContext({
        ...(mobile ? devices["iPhone 13"] : {}),
        baseURL,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      });
      try {
        const page = await context.newPage();
        await start(page, moveId);
        await attack(page, mobile);
        await expect
          .poll(() => snapshot(page).then(s => s?.effect?.cue.moveId), { intervals: [20] })
          .toBe(moveId);
        const before = (await snapshot(page))!;
        await expect
          .poll(
            () =>
              snapshot(page).then(s =>
                Boolean(
                  s?.effect &&
                  s.effect.cue.moveId === moveId &&
                  s.effect.progress > 0.25 &&
                  s.effect.progress < 0.39,
                ),
              ),
            { intervals: [15] },
          )
          .toBe(true);
        const sprite = page.locator('[data-poke-lounge-battle-pokemon="player"]');
        await expect(sprite).toHaveCSS("opacity", "0");
        expect((await snapshot(page))!.opponent.displayedCurrentHp).toBe(
          before.opponent.displayedCurrentHp,
        );
        await page.screenshot({
          path: info.outputPath(`${moveId}-${mobile ? "mobile" : "web"}-windup.png`),
        });
        await expect
          .poll(
            () =>
              snapshot(page).then(s =>
                Boolean(s?.effect && s.effect.cue.moveId === moveId && s.effect.progress > 0.6),
              ),
            { intervals: [20] },
          )
          .toBe(true);
        await page.screenshot({
          path: info.outputPath(`${moveId}-${mobile ? "mobile" : "web"}-strike.png`),
        });
        await expect
          .poll(() => snapshot(page).then(s => s?.effect?.cue.moveId !== moveId))
          .toBe(true);
        await expect(sprite).toHaveCSS("opacity", "1");
        const screen = page.locator("[data-poke-lounge-battle-screen]");
        const box = (await screen.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(mobile ? 391 : 1281);
      } finally {
        await context.close();
      }
    });

for (const status of ["poisoned", "burned"] as const)
  test(`롬 상태이상: ${status} 지속 피해는 전용 파티클로 표시된다`, async ({ page }, info) => {
    await start(page, 45, status);
    await attack(page);
    const effect = page.locator(`[data-battle-effect="status"][data-status-effect="${status}"]`);
    await expect(effect).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => effect.locator("image").count(), { intervals: [25] })
      .toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`${status}.png`) });
    const state = await snapshot(page);
    expect(state?.effect?.cue.hit).toBe(false);
    expect(state?.effect?.cue.damage).toBeGreaterThan(0);
  });

test("롬 연출 접근성: 동작 줄이기에서는 숨김 없이 진행하고 효과 유실에도 입력이 복구된다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/battle-effects/*", route => route.abort());
  await start(page, 19);
  await attack(page);
  await expect
    .poll(
      () =>
        snapshot(page).then(s =>
          Boolean(s?.effect && s.effect.progress > 0.25 && s.effect.progress < 0.39),
        ),
      { intervals: [20] },
    )
    .toBe(true);
  await expect(page.locator('[data-poke-lounge-battle-pokemon="player"]')).toHaveCSS(
    "opacity",
    "1",
  );
  await expect
    .poll(() => snapshot(page).then(s => s?.effect === null), { timeout: 15000 })
    .toBe(true);
});

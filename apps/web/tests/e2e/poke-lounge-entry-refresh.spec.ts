import { devices, expect, test } from "@playwright/test";
import { gotoWithRetry } from "./test-helpers";

test.use({
  userAgent: devices["iPhone 13"].userAgent,
  viewport: { width: 390, height: 664 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

test("모바일 진입: 폼은 하나의 문서 스크롤을 사용하고 제목과 제출 버튼이 잘리지 않는다", async ({
  page,
}, info) => {
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: false, active: false } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1");
  const root = page.getByTestId("poke-lounge-page");
  const entry = page.locator("[data-room-entry-screen]");
  await expect(entry).toBeVisible();
  await expect(root).toHaveAttribute("data-poke-lounge-mobile-shell", "true");
  // A real mobile keyboard can leave a smaller visual height briefly. Record
  // geometry, never the generated password or room/session identifiers.
  const geometry = await page.evaluate(() => {
    const entry = document.querySelector<HTMLElement>("[data-room-entry-screen]")!;
    const panel = entry.querySelector<HTMLElement>(".room-entry-panel")!;
    return {
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      rootOverscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      entryOverflow: getComputedStyle(entry).overflowY,
      panelOverflow: getComputedStyle(panel).overflowY,
      panelClips:
        panel.scrollHeight > panel.clientHeight + 1 &&
        getComputedStyle(panel).overflowY !== "visible",
    };
  });
  await info.attach("entry-geometry", {
    body: JSON.stringify(geometry),
    contentType: "application/json",
  });
  await page.screenshot({
    path: info.outputPath("entry.png"),
    mask: [page.locator("[data-room-entry-temporary-password]")],
  });
  expect(geometry.rootOverflow).not.toBe("hidden");
  expect(geometry.rootOverscroll).toBe("auto");
  expect(geometry.entryOverflow).toBe("visible");
  expect(geometry.panelOverflow).toBe("visible");
  expect(geometry.panelClips).toBe(false);
  for (const size of [
    { width: 390, height: 530 },
    { width: 664, height: 390 },
    { width: 390, height: 740 },
  ]) {
    await page.setViewportSize(size);
    const submit = page.locator("[data-room-entry-multiplayer-submit]");
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.getByRole("heading", { name: "방 만들기", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "방 만들기", exact: true })).toBeInViewport();
  }
});

test("모바일 진입: 새로고침은 문서를 다시 받고 저장 데이터를 지우지 않는다", async ({ page }) => {
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: false, active: false } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1");
  await expect(page.locator("[data-room-entry-screen]")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("pl-refresh-regression-marker", "preserve"));
  const reload = page.locator("[data-poke-lounge-page-reload]");
  await expect(reload).toBeVisible();
  await Promise.all([page.waitForEvent("load"), reload.tap()]);
  await expect(page.locator("[data-room-entry-screen]")).toBeVisible();
  expect(
    await page.evaluate(
      () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).type,
    ),
  ).toBe("reload");
  expect(await page.evaluate(() => localStorage.getItem("pl-refresh-regression-marker"))).toBe(
    "preserve",
  );
});

test("모바일 새로고침: 게임 설정에서 취소하거나 문서 재로드 후 저장 파티를 복원한다", async ({
  page,
}, info) => {
  const { createRuntimeRomDataFixture, fetchPublicGameDataFixture } =
    await import("../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture");
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await gotoWithRetry(
    page,
    "/ko-KR/game/poke-lounge?e2e=1&e2eBattle=&localTest=1&wildEncounterRate=0",
  );
  await page.locator("[data-starter-confirm]").tap();
  await expect(page.locator("[data-world-local-player]")).toBeVisible();
  const identity = async () => {
    // Production exposes the local fixture observer only with e2eBattle opt-in.
    // Wait for its getter rather than assuming a rendered sprite is enough.
    await page.waitForFunction(() => {
      const view = window as Window & { __POKE_LOUNGE_E2E__?: { getGameStateSnapshot?: unknown } };
      return typeof view.__POKE_LOUNGE_E2E__?.getGameStateSnapshot === "function";
    });
    return page.evaluate(() => {
      const c = (
        window as Window & {
          __POKE_LOUNGE_E2E__: import("../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller").PokeLoungeE2eController;
        }
      ).__POKE_LOUNGE_E2E__;
      const s = c.getGameStateSnapshot(),
        p = s.playersById[s.currentPlayerId]!;
      return {
        party: p.party.map(slot => ({
          slotIndex: slot.slotIndex,
          speciesId: slot.pokemon?.speciesId ?? null,
          currentHp: slot.pokemon?.currentHp ?? null,
        })),
        inventory: p.inventory,
      };
    });
  };
  const before = await identity();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe(
    "hidden",
  );
  await page.locator("[data-poke-lounge-mobile-menu]").tap();
  const settings = page.locator('[data-poke-lounge-mobile-task="settings"]');
  await expect(settings).toBeVisible();
  const reload = settings.locator("[data-poke-lounge-page-reload]");
  await reload.tap();
  const confirm = page.locator("[data-poke-lounge-reload-confirm]");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("저장 데이터는 삭제하지 않지만");
  await page.screenshot({ path: info.outputPath("reload-confirm.png") });
  await confirm.getByRole("button", { name: "계속 플레이", exact: true }).tap();
  await expect(confirm).toBeHidden();
  expect(await identity()).toEqual(before);
  await reload.tap();
  await Promise.all([
    page.waitForEvent("load"),
    confirm.getByRole("button", { name: "새로고침", exact: true }).tap(),
  ]);
  // Local test mode intentionally returns to its entry screen on a document reload.
  await expect(page.locator("[data-room-entry-screen]")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe(
    "hidden",
  );
  await page.locator("[data-room-entry-local-test-start]").tap();
  await expect(page.locator("[data-world-local-player]")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe(
    "hidden",
  );
  expect(
    await page.evaluate(
      () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).type,
    ),
  ).toBe("reload");
  expect(await identity()).toEqual(before);
  expect(errors).toEqual([]);
});

test("모바일 초대 화면: 세로 스크롤·새로고침 버튼과 입장 버튼에 접근할 수 있다", async ({
  page,
}) => {
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: false, active: false } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?network=server&room=TEST01&e2e=1");
  const entry = page.locator("[data-room-entry-direct-multiplayer]");
  await expect(entry).toBeVisible();
  await expect(page.getByTestId("poke-lounge-page")).toHaveAttribute(
    "data-poke-lounge-mobile-shell",
    "true",
  );
  for (const size of [
    { width: 390, height: 664 },
    { width: 390, height: 420 },
    { width: 664, height: 390 },
  ]) {
    await page.setViewportSize(size);
    const submit = page.locator("[data-room-entry-direct-multiplayer-submit]");
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    const reload = entry.locator("[data-poke-lounge-page-reload]");
    await reload.scrollIntoViewIfNeeded();
    await expect(reload).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
});

import { devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import bootstrap from "../../public/game-data/bootstrap.json";
import { gotoWithRetry } from "./test-helpers";

async function openSelection(page: Page, locale = "ko-KR") {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, `/${locale}/game/poke-lounge?e2e=1&wildEncounterRate=0&localTest=1`);
  await expect(page.locator("[data-screen='starter-selection']")).toBeVisible({ timeout: 30_000 });
}

async function expectSelectionBounds(page: Page, allCards = true) {
  await expect
    .poll(() =>
      page.evaluate(allCards => {
        const pageElement = document.querySelector<HTMLElement>(
          "[data-testid='poke-lounge-page']",
        )!;
        const panel = document.querySelector<HTMLElement>("[data-starter-panel]");
        const grid = document.querySelector<HTMLElement>("[data-starter-options]");
        const footer = document.querySelector<HTMLElement>("[data-starter-footer]");
        const confirm = document.querySelector<HTMLElement>("[data-starter-confirm]");
        if (!panel || !grid || !footer || !confirm) return false;
        const p = panel.getBoundingClientRect();
        const g = grid.getBoundingClientRect();
        const v = window.visualViewport;
        const top = v?.offsetTop ?? 0;
        const bottom = top + (v?.height ?? window.innerHeight);
        const fits = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.top >= top - 1 &&
            r.bottom <= bottom + 1 &&
            r.left >= -1 &&
            r.right <= window.innerWidth + 1
          );
        };
        const cards = [...grid.querySelectorAll<HTMLElement>("[data-starter-card]")];
        return (
          fits(panel) &&
          fits(footer) &&
          fits(confirm) &&
          confirm.getBoundingClientRect().height >= 56 &&
          p.height > (bottom - top) * 0.82 &&
          pageElement.scrollTop === 0 &&
          panel.scrollHeight <= panel.clientHeight + 1 &&
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          (!allCards ||
            cards.every(card => {
              const r = card.getBoundingClientRect();
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return (
                r.top >= g.top - 1 &&
                r.bottom <= g.bottom + 1 &&
                r.left >= g.left - 1 &&
                r.right <= g.right + 1 &&
                !!hit &&
                card.contains(hit)
              );
            }))
        );
      }, allCards),
    )
    .toBe(true);
}

async function expectChosenParty(page: Page, speciesId: number) {
  await expect(page.locator("[data-screen='starter-selection']")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as Window & {
            __POKE_LOUNGE_E2E__?: {
              getGameStateSnapshot(): {
                currentPlayerId: string;
                playersById: Record<string, { party: Array<{ speciesId: number }> }>;
              };
            };
          }
        ).__POKE_LOUNGE_E2E__?.getGameStateSnapshot();
        return state?.playersById[state.currentPlayerId].party
          .map(slot => slot.pokemon?.speciesId)
          .filter(Boolean);
      }),
    )
    .toEqual([speciesId]);
}

test("파트너 재배치: 모바일은 여섯 선택지와 확정 버튼을 회전 후에도 모두 보여준다", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    viewport: { width: 390, height: 644 },
  });
  const page = await context.newPage();
  try {
    await openSelection(page);
    await expect(page.locator("[data-starter-card]")).toHaveCount(6);
    await expect(page.locator("[data-starter-count]")).toHaveText("6마리");
    await expect(page.locator("[data-starter-card='charmander']")).toContainText("불꽃");
    await page.locator("[data-starter-card='totodile']").click();
    for (const size of [
      { width: 320, height: 568 },
      { width: 390, height: 644 },
      { width: 430, height: 832 },
      { width: 667, height: 375 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(size);
      await expectSelectionBounds(page);
      await expect(page.locator("[data-starter-preview]")).toHaveAttribute(
        "data-selected-starter",
        "totodile",
      );
      await expect(page.locator("[data-starter-card][aria-pressed='true']")).toHaveCount(1);
      if (size.width === 390 || size.width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`mobile-${size.width}.png`),
          scale: "css",
        });
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-starter-panel]")).toBeVisible();
    await page.locator("[data-starter-confirm]").evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expectChosenParty(page, 158);
    await expect(page.locator("[data-poke-lounge-mobile-settings-screen='true']")).toHaveCount(0);
    const frame = await page.locator("[data-poke-lounge-game-frame]").boundingBox();
    expect(Math.abs(frame!.width - (frame!.height * 3) / 4)).toBeLessThan(1);
  } finally {
    await context.close();
  }
});

test("파트너 재배치: 데스크톱은 좌측 미리보기와 우측 목록에서 키보드로 선택한다", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSelection(page);
  await expectSelectionBounds(page);
  const preview = await page.locator("[data-starter-preview]").boundingBox();
  const grid = await page.locator("[data-starter-options]").boundingBox();
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(grid!.x);
  const first = page.locator("[data-starter-card]").first();
  await first.focus();
  await first.press("End");
  await expect(page.locator("[data-starter-card='totodile']")).toBeFocused();
  await expect(page.locator("[data-starter-preview]")).toHaveAttribute(
    "data-selected-starter",
    "totodile",
  );
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), scale: "css" });
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("[data-starter-card='squirtle']")).toBeFocused();
  await page.locator("[data-starter-confirm]").click();
  await expectChosenParty(page, 7);
  const frame = await page.locator("[data-poke-lounge-game-frame]").boundingBox();
  expect(frame!.width / frame!.height).toBeCloseTo(4 / 3, 2);
});

test("파트너 재배치: 확대 글자·긴 목록은 목록 안에서만 스크롤하고 이미지 실패도 선택을 막지 않는다", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  try {
    await page.route("**/game-data/bootstrap.json", route =>
      route.fulfill({
        json: {
          ...bootstrap,
          starters: Array.from({ length: 18 }, (_, index) => ({
            ...bootstrap.starters[index % 6],
            id: `option-${index}`,
            displayName:
              index === 17 ? "길어진 포켓몬 이름" : bootstrap.starters[index % 6].displayName,
          })),
        },
      }),
    );
    await page.route("**/assets/pokemon/front/158.png", route => route.abort());
    await openSelection(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expectSelectionBounds(page, false);
    const last = page.locator("[data-starter-card]").last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await expect(page.locator("[data-starter-preview]")).toHaveAttribute(
      "data-selected-starter",
      "option-17",
    );
    await expect(last.locator("[data-starter-image-fallback]")).toBeVisible();
    await expect(page.locator("[data-starter-confirm]")).toBeEnabled();
    await expectSelectionBounds(page, false);
    await expect
      .poll(() => page.locator("[data-starter-options]").evaluate(element => element.scrollTop))
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test("파트너 재배치: 빈 선택지는 확정을 막고 일본어·영어 타입은 해당 언어로 표시한다", async ({
  browser,
  baseURL,
}) => {
  for (const [locale, type] of [
    ["en-US", "Fire"],
    ["ja-JP", "ほのお"],
  ]) {
    const context = await browser.newContext({ ...devices["iPhone 13"], baseURL });
    const page = await context.newPage();
    try {
      await openSelection(page, locale);
      await expect(page.locator("[data-starter-card='charmander']")).toContainText(type);
      await expectSelectionBounds(page);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext({ ...devices["iPhone 13"], baseURL });
  const page = await context.newPage();
  try {
    await page.route("**/game-data/bootstrap.json", route =>
      route.fulfill({ json: { ...bootstrap, starters: [] } }),
    );
    await openSelection(page);
    await expect(page.locator("[data-starter-card]")).toHaveCount(0);
    await expect(page.locator("[data-starter-confirm]")).toBeDisabled();
  } finally {
    await context.close();
  }
});

import { devices, expect, test, type Page } from "@playwright/test";
import {
  createRuntimeRomDataFixture,
  fetchPublicGameDataFixture,
} from "../../src/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import type { PokeLoungeE2eController } from "../../src/components/poke-lounge/runtime/game/testing/poke-lounge-e2e-controller";
import { gotoWithRetry } from "./test-helpers";

type GameWindow = Window & { __POKE_LOUNGE_E2E__?: PokeLoungeE2eController };
const sizes = [
  [320, 568],
  [359, 640],
  [360, 640],
  [361, 640],
  [390, 644],
  [430, 832],
  [479, 700],
  [480, 700],
  [481, 700],
  [559, 720],
  [560, 720],
  [561, 720],
  [599, 600],
  [600, 600],
  [601, 600],
  [639, 480],
  [640, 480],
  [641, 480],
  [719, 900],
  [720, 900],
  [721, 900],
  [767, 1024],
  [768, 1024],
  [769, 1024],
  [768, 700],
  [568, 320],
  [640, 360],
  [667, 375],
  [1024, 768],
  [390, 644],
];

async function prepare(page: Page, start = true) {
  const data = await createRuntimeRomDataFixture(fetchPublicGameDataFixture);
  await page.route("**/api/local-test-mode", route =>
    route.fulfill({ json: { available: true, active: true } }),
  );
  await page.route("**/poke-lounge/rom-data", route =>
    route.fulfill({ json: { success: true, data } }),
  );
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0&localTest=1");
  await expect(page.locator("[data-starter-panel]")).toBeVisible();
  if (!start) return;
  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible();
  await settled(page);
}
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }),
  );
}
async function visual(page: Page, width: number, height: number, offsetTop = 0) {
  await page.evaluate(
    ({ width, height, offsetTop }) => {
      const v = window.visualViewport!;
      for (const [key, value] of Object.entries({
        width,
        height,
        offsetTop,
        offsetLeft: 0,
        scale: 1,
      }))
        Object.defineProperty(v, key, { configurable: true, get: () => value });
      v.dispatchEvent(new Event("resize"));
    },
    { width, height, offsetTop },
  );
  await settled(page);
}
async function layout(page: Page) {
  await settled(page);
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-testid='poke-lounge-page']")!;
    const origin = root.getBoundingClientRect();
    const box = (selector: string) => {
      const r = root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return {
        x: Math.round((r.x - origin.x) * 10) / 10,
        y: Math.round((r.y - origin.y) * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
      };
    };
    return {
      mode: root.dataset.pokeLoungeResponsiveLayout,
      frame: box("[data-poke-lounge-game-frame]"),
      dock: box("[data-poke-lounge-mobile-control-dock]"),
      bar: box("[data-poke-lounge-play-status]"),
      joystick: root.querySelector("[data-poke-lounge-mobile-joystick]")
        ? box("[data-poke-lounge-mobile-joystick]")
        : null,
    };
  });
}
async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-testid='poke-lounge-page']")!;
        const f = root
          .querySelector<HTMLElement>("[data-poke-lounge-game-frame]")!
          .getBoundingClientRect();
        const d = root
          .querySelector<HTMLElement>("[data-poke-lounge-mobile-control-dock]")!
          .getBoundingClientRect();
        const r = root.getBoundingClientRect();
        const targets = [
          root.querySelector<HTMLElement>("[data-poke-lounge-play-status]")!,
          root.querySelector<HTMLElement>("[data-poke-lounge-game-frame]")!,
          root.querySelector<HTMLElement>("[data-poke-lounge-mobile-control-dock]")!,
          ...root.querySelectorAll<HTMLElement>(
            "[data-poke-lounge-mobile-deck='explore'] button, [data-command], [data-poke-lounge-mobile-joystick]",
          ),
        ];
        const interactive = targets.filter(el =>
          el.matches("button, [data-poke-lounge-mobile-joystick]"),
        );
        const hitTargets = interactive.every(el => {
          const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return hit !== null && el.contains(hit);
        });
        return (
          hitTargets &&
          Math.abs(f.width - (f.height * 3) / 4) < 1 &&
          f.width > 20 &&
          (f.right <= d.left + 1 || f.bottom <= d.top + 1) &&
          root.scrollTop === 0 &&
          root.scrollLeft === 0 &&
          targets.every(el => {
            const b = el.getBoundingClientRect();
            return (
              b.width > 0 &&
              b.height > 0 &&
              b.top >= r.top - 1 &&
              b.bottom <= r.bottom + 1 &&
              b.left >= r.left - 1 &&
              b.right <= r.right + 1
            );
          })
        );
      }),
    )
    .toBe(true);
}
async function battle(page: Page) {
  await page.evaluate(() =>
    (window as GameWindow).__POKE_LOUNGE_E2E__!.startWildBattleForTest({
      encounter: {
        level: 8,
        mapKey: "town",
        name: "꼬리선",
        speciesId: 19,
        step: { from: { x: 687, y: 1151 }, to: { x: 688, y: 1151 } },
      },
      facing: "front",
      x: 687,
      y: 1151,
    }),
  );
  await expect(page.locator("[data-command='fight']")).toBeVisible();
  await settled(page);
}

test("반응형 재설계: 동일한 가시 영역은 브라우저 레이아웃 방향과 무관하게 동일하다", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    viewport: { width: 390, height: 644 },
  });
  try {
    const a = await context.newPage();
    await prepare(a);
    const expected = await layout(a);
    const other = await browser.newContext({
      ...devices["iPhone 13"],
      baseURL,
      viewport: { width: 1200, height: 900 },
    });
    try {
      const b = await other.newPage();
      await prepare(b);
      await visual(b, 390, 644, 40);
      await fits(b);
      expect(await layout(b)).toEqual(expected);
      await b.locator("[data-poke-lounge-mobile-menu]").click();
      await expect(b.locator("[data-poke-lounge-mobile-task]")).toBeVisible();
      const menu = await b.locator("[data-poke-lounge-mobile-task]").boundingBox();
      expect(menu!.y).toBeGreaterThanOrEqual(40);
      expect(menu!.y + menu!.height).toBeLessThanOrEqual(684);
      await b.keyboard.press("Escape");
      expect(await layout(b)).toEqual(expected);
      await a.screenshot({ path: info.outputPath("phone-390x644.png"), scale: "css" });
    } finally {
      await other.close();
    }
  } finally {
    await context.close();
  }
});

test("반응형 재설계: 경계값·반복 회전·전투 전환에서 비율과 상태를 보존한다", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    viewport: { width: 390, height: 644 },
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await prepare(page);
    const initial = await layout(page);
    const position = await page.evaluate(
      () => (window as GameWindow).__POKE_LOUNGE_E2E__!.getWorldSnapshot()?.player,
    );
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await settled(page);
      await fits(page);
      if ((width === 768 && height === 700) || (width === 667 && height === 375))
        await page.screenshot({
          path: info.outputPath(`play-${width}x${height}.png`),
          scale: "css",
        });
    }
    expect(await layout(page)).toEqual(initial);
    expect(
      await page.evaluate(
        () => (window as GameWindow).__POKE_LOUNGE_E2E__!.getWorldSnapshot()?.player,
      ),
    ).toEqual(position);
    await battle(page);
    const commandLayout = await layout(page);
    expect(commandLayout.frame).toEqual(initial.frame);
    expect(commandLayout.dock).toEqual(initial.dock);
    await page.locator("[data-command='fight']").click();
    for (const [width, height] of [
      [320, 568],
      [480, 640],
      [600, 600],
      [568, 320],
      [640, 360],
      [667, 375],
      [768, 700],
      [1024, 768],
      [390, 644],
    ]) {
      await page.setViewportSize({ width, height });
      await settled(page);
      await fits(page);
      await expect(page.locator("[data-poke-lounge-mobile-task]")).toHaveCount(0);
      await expect(
        page.locator(
          "[data-poke-lounge-mobile-control-dock] [data-poke-lounge-mobile-deck='battle-moves']",
        ),
      ).toBeVisible();
    }
    expect((await layout(page)).frame).toEqual(initial.frame);
    await page.screenshot({ path: info.outputPath("battle-moves-390x644.png"), scale: "css" });
    await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
    await settled(page);
    await fits(page);
    const moves = page.locator("[data-poke-lounge-mobile-option-grid='moves']");
    await moves.locator("button").last().scrollIntoViewIfNeeded();
    await expect(moves.locator("button").last()).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-command='fight']")).toBeVisible();
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
    await settled(page);
    expect((await layout(page)).frame).toEqual(initial.frame);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("반응형 재설계: 전체 화면과 안전 여백에서도 같은 배치 규칙을 사용한다", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    viewport: { width: 667, height: 375 },
  });
  try {
    const page = await context.newPage();
    await prepare(page);
    const before = await layout(page);
    await page
      .getByTestId("poke-lounge-page")
      .evaluate(el => el.classList.add("is-game-fullscreen-fallback"));
    await settled(page);
    await fits(page);
    expect(await layout(page)).toEqual(before);
    await page.getByTestId("poke-lounge-page").evaluate(el => {
      el.classList.remove("is-game-fullscreen-fallback");
      el.style.paddingLeft = "44px";
      el.style.paddingRight = "44px";
      el.style.setProperty("--poke-lounge-mobile-letterbox-top", "24px");
      el.style.setProperty("--poke-lounge-mobile-letterbox-bottom", "34px");
    });
    await settled(page);
    await fits(page);
    const padded = await layout(page);
    expect(padded.frame.x).toBeGreaterThanOrEqual(44);
    expect(padded.dock.x + padded.dock.w).toBeLessThanOrEqual(623);
    await page.screenshot({ path: info.outputPath("safe-area-landscape.png"), scale: "css" });
  } finally {
    await context.close();
  }
});

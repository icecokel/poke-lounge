import { randomUUID } from "node:crypto";
import { expect, type BrowserContext, type Page, test } from "@playwright/test";

test.use({ trace: "off" });

test("다섯 사용자가 같은 임시 비밀번호 방에서 준비하고 챔피언십을 시작한다", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  expect(process.env.POKE_LOUNGE_E2E_ENV_ISOLATED).toBe("1");

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const password = randomUUID();

  try {
    for (let index = 0; index < 5; index += 1) {
      const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await enterRoom(page, `트레이너 ${index + 1}`, password);
    }

    for (const page of pages) {
      await expect(page.locator(".room-lobby-participant")).toHaveCount(5);
      await page.locator("[data-room-lobby-ready='true']").click();
    }

    const start = pages[0]!.locator("[data-room-lobby-start='true']");
    await expect(start).toBeEnabled();
    await start.click();

    for (const page of pages) {
      await expect(page.locator("[data-web-hub='true']")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-web-hub='true']")).toHaveAttribute(
        "data-room-status",
        /round-started|tournament/,
      );
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

async function enterRoom(page: Page, displayName: string, password: string) {
  await page.goto("/ko-KR/game/poke-lounge");
  await page.locator("[data-room-entry-display-name='true']").fill(displayName);
  await page.locator("[data-room-entry-temporary-password='true']").fill(password);
  await page.locator("[data-room-entry-multiplayer-submit='true']").click();
  await expect(page.locator("[data-screen='starter-selection']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-starter-confirm='true']").click();
  await expect(page.locator("[data-room-lobby='true']")).toBeVisible({ timeout: 30_000 });
}

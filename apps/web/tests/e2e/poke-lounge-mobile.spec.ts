import { expect, test } from "@playwright/test";

test("모바일 Web UI는 전체 높이를 사용하고 가로로 넘치지 않는다", async ({ page }) => {
  await page.goto("/ko-KR/game/poke-lounge");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();

  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    rootHeight: document.querySelector("#game-root")?.getBoundingClientRect().height ?? 0,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }));

  expect(layout.bodyWidth).toBe(layout.viewportWidth);
  expect(layout.rootHeight).toBe(layout.viewportHeight);
  await expect(page.locator("#game-root canvas")).toHaveCount(0);

  await page.getByRole("button", { name: "Poke Lounge 설정 열기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

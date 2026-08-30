import { expect, test } from "@playwright/test";

const gamePath = "/ko-KR/game/poke-lounge";

test("DOM 진입부터 야생 전투까지 canvas 없이 진행한다", async ({ page }) => {
  await page.goto(gamePath);

  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();
  await expect(page.locator("#game-root canvas")).toHaveCount(0);

  await page.getByRole("button", { name: "새 게임" }).click();
  await page.getByRole("button", { name: "초기화 후 시작" }).click();
  await expect(page.locator("[data-screen='starter-selection']")).toBeVisible();

  await page.locator("[data-starter-confirm='true']").click();
  await expect(page.locator("[data-web-hub='true']")).toBeVisible();

  await page.getByRole("button", { name: "탐험", exact: true }).click();
  await page.getByRole("button", { name: "탐험 시작" }).first().click();
  await expect(page.getByRole("region", { name: "포켓몬 배틀" })).toBeVisible();
  await expect(page.locator("#game-root canvas")).toHaveCount(0);
});

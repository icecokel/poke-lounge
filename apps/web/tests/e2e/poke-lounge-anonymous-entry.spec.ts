import { expect, test } from "@playwright/test";
import { gotoWithRetry } from "./test-helpers";

test("인증 서비스 없이 익명 플레이 화면에 진입한다", async function testCase({ page }) {
  const authRequests: string[] = [];
  const stateRequests: string[] = [];
  await page.route("**/api/auth/**", async function rejectRemovedAuth(route) {
    authRequests.push(route.request().url());
    await route.abort();
  });
  await page.route("**/game/poke-lounge/state", async function rejectAccountState(route) {
    stateRequests.push(route.request().url());
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"code":"ACCOUNT_AUTH_DISABLED"}',
    });
  });
  // A failure of the optional development session must not block normal play either.
  await page.route("**/api/local-test-mode/session", async function disableTestSession(route) {
    await route.fulfill({ status: 503, body: "" });
  });
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-room-entry-mode='multiplayer']")).toBeVisible();
  expect(authRequests).toEqual([]);
  expect(stateRequests).toEqual([]);

  const removedLogin = await page.request.get("/api/auth/providers");
  expect(removedLogin.status()).toBe(404);
});

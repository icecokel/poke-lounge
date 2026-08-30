import { expect, test } from "@playwright/test";

const pokeLoungePath = "/ko-KR/game/poke-lounge";
const stateApiUrl = "http://127.0.0.1:65535/game/poke-lounge/state";

test("명시적 활성화로만 싱글 테스트 모드에 진입하고 멀티 입력을 차단한다", async ({ page }) => {
  let savedRevision = 0;
  let stateSaveCount = 0;

  await page.route(stateApiUrl, async route => {
    const request = route.request();
    const origin = request.headers().origin ?? "http://127.0.0.1";
    const headers = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "application/json",
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }

    if (request.method() === "GET") {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ success: false, message: "state not created" }),
      });
      return;
    }

    stateSaveCount += 1;
    savedRevision += 1;
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ success: true, data: { revision: savedRevision } }),
    });
  });

  await page.goto(`${pokeLoungePath}?localTest=1&network=webrtc&room=ABC123&e2e=1`);

  const roomEntry = page.locator("[data-room-entry-screen='true']");
  await expect(roomEntry).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/localTest=|network=|room=/);
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeHidden();
  await expect(page.locator("[data-room-entry-mode='solo']")).toBeVisible();
  await expect(page.locator("[data-room-entry-mode='multiplayer']")).toBeVisible();

  const initialSession = await page.evaluate(async () =>
    (await fetch("/api/auth/session", { cache: "no-store" })).json(),
  );
  expect(initialSession).toBeNull();

  await page.locator("[data-room-entry-local-test-start]").click();
  await expect(page.locator("[data-screen='starter-selection']")).toBeVisible({ timeout: 30_000 });

  const activeSession = (await page.evaluate(async () =>
    (await fetch("/api/auth/session", { cache: "no-store" })).json(),
  )) as { localTestMode?: boolean; user?: { id?: string } };
  expect(activeSession.localTestMode).toBe(true);
  expect(activeSession.user?.id).toBe("poke-lounge-local-test-user");

  await page.locator("[data-starter-confirm]").click();
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => stateSaveCount, { timeout: 30_000 }).toBeGreaterThan(0);

  await page.goto(
    `${pokeLoungePath}?localTest=1&network=webrtc&room=ABC123&serverPlayerId=player-1&serverSessionId=session-1&e2e=1`,
  );
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(/localTest=|network=|room=|serverPlayerId=|serverSessionId=/);

  await page.reload();
  await expect(roomEntry).toBeVisible({ timeout: 30_000 });
  await expect(roomEntry).toHaveAttribute("data-local-test-mode-active", "true");
  await expect(page.locator("[data-room-entry-mode='solo']")).toBeVisible();
  await expect(page.locator("[data-room-entry-mode='multiplayer']")).toHaveCount(0);

  await page.locator("[data-room-entry-local-test-exit]").click();
  await expect(roomEntry).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-room-entry-mode='solo']")).toBeVisible();
  await expect(page.locator("[data-room-entry-mode='multiplayer']")).toBeVisible();

  const exitedSession = await page.evaluate(async () =>
    (await fetch("/api/auth/session", { cache: "no-store" })).json(),
  );
  expect(exitedSession).toBeNull();
});

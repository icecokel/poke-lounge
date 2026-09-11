import { devices, expect, test } from "@playwright/test";
import { gotoWithRetry } from "./test-helpers";

// UI regression, not an entire player-operated championship. No state injection.
test.use({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 664 },
  screenshot: "off",
  trace: "off",
  video: "off",
});

test("입력 포커스만으로 입장 폼과 제출 버튼의 위치가 바뀌지 않는다", async ({ page }, info) => {
  // Isolate focus layout from the panel-entry animation. Real first-tap tests
  // below retain the default motion preference.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge");
  const submit = page.locator("[data-room-entry-multiplayer-submit]");
  await expect(submit).toBeVisible();
  // Measure focus-driven layout only after the normal entry animation/fonts settle.
  await page.locator(".room-entry-create-panel").evaluate(async panel => {
    await document.fonts.ready;
    await Promise.all(panel.getAnimations().map(animation => animation.finished));
  });
  const top = () => submit.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await page.locator("[data-room-entry-display-name]").fill("터치검증");
  await expect(page.locator(".room-entry-duration")).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
  await page.locator("[data-room-entry-temporary-password]").focus();
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
  await page.keyboard.press("Tab");
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
  await page.screenshot({
    path: info.outputPath("entry-focus.png"),
    fullPage: true,
    mask: [page.locator("input[type=text]")],
  });
});

for (const focus of ["name", "password"] as const) {
  test(`실제 API: ${focus} 입력 직후 첫 탭으로 방을 한 번만 생성한다`, async ({
    page,
    baseURL,
  }, info) => {
    test.skip(
      process.env.POKE_LOUNGE_REAL_API_TESTS !== "1",
      "An isolated real local API is required",
    );
    expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL!).hostname);
    await gotoWithRetry(page, "/ko-KR/game/poke-lounge");
    const name = page.locator("[data-room-entry-display-name]");
    const password = page.locator("[data-room-entry-temporary-password]");
    const submit = page.locator("[data-room-entry-multiplayer-submit]");
    await name.fill("터치검증");
    if (focus === "password") await password.focus();
    await expect(focus === "name" ? name : password).toBeFocused();
    let creates = 0;
    page.on("request", request => {
      if (
        request.method() === "POST" &&
        /\/poke-lounge\/rooms\/?$/.test(new URL(request.url()).pathname)
      )
        creates++;
    });
    await page.screenshot({
      path: info.outputPath("before-first-tap.png"),
      mask: [name, password],
    });
    // No preliminary blur, second tap, force-click, or direct API submission.
    await submit.tap();
    await expect(page.getByRole("heading", { name: "챔피언십 대기실" })).toBeVisible({
      timeout: 20_000,
    });
    expect(creates).toBe(1);
    await page.getByRole("button", { name: "Poke Lounge 설정 열기" }).tap();
    await page.getByRole("button", { name: "방 나가기", exact: true }).tap();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible())
      await confirm.getByRole("button", { name: "방 나가기", exact: true }).tap();
    await expect(page.locator("[data-room-entry-multiplayer-submit]")).toBeVisible({
      timeout: 10_000,
    });
    expect(creates).toBe(1);
  });
}

test("실제 API: 대회 직전 예고의 상대가 실제 첫 경기 상대와 일치한다", async ({
  page,
  baseURL,
}, info) => {
  test.skip(
    process.env.POKE_LOUNGE_REAL_API_TESTS !== "1",
    "An isolated real local API is required",
  );
  test.setTimeout(150_000);
  expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL!).hostname);
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge");
  await page.locator("[data-room-entry-display-name]").fill("대진검증");
  await page.locator("[data-room-entry-multiplayer-submit]").tap();
  await expect(page.getByRole("heading", { name: "챔피언십 대기실" })).toBeVisible();
  await page.getByRole("button", { name: "준비", exact: true }).tap();
  await expect(page.getByRole("button", { name: "게임 시작", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "게임 시작", exact: true }).tap();
  await page.locator("[data-starter-confirm]").tap();
  // This regression observes the scheduled transition with the real 90-second
  // clock and real AI seats; it is not a player-operated championship run.
  const preview = page.locator('[data-poke-lounge-tournament-bracket="true"]');
  await expect(preview).toBeVisible({ timeout: 105_000 });
  const opponent = preview.locator('[data-own-match="true"] [title]:not([data-own-player])');
  await expect(opponent).toHaveCount(1);
  const expected = (await opponent.getAttribute("title"))!;
  expect(expected).not.toBe("");
  // The five-second announcement updates every second. Capture the page
  // without waiting for an element that the countdown may remount.
  await page.screenshot({ path: info.outputPath("bracket-preview.png") });
  const actual = page.locator('[data-poke-lounge-battle-trainer="opponent"]');
  await expect(actual).toBeVisible({ timeout: 20_000 });
  await expect(actual).toHaveText(expected);
  await info.attach("opponent-comparison", {
    body: JSON.stringify({ preview: expected, actual: await actual.innerText() }),
    contentType: "application/json",
  });
  await page
    .locator('[data-poke-lounge-battle-hp-panel="opponent"]')
    .screenshot({ path: info.outputPath("actual-opponent.png") });
  await page.getByRole("button", { name: "Poke Lounge 설정 열기" }).tap();
  await page.getByRole("button", { name: "방 나가기", exact: true }).tap();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible())
    await confirm.getByRole("button", { name: "방 나가기", exact: true }).tap();
  await expect(page.locator("[data-room-entry-multiplayer-submit]")).toBeVisible();
});

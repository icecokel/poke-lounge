import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { MOBILE_GAME_VIEWPORT_SIZE } from "../../src/components/poke-lounge/runtime/game/gameViewport";
import { gotoWithRetry } from "./test-helpers";

type WorldSnapshot = {
  player: { x: number; y: number; facing: string } | null;
  partyHudVisible: boolean;
  shortcutGuideOpen: boolean;
};

type CanvasSnapshot = {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
};

type AudioPlaybackSnapshot = {
  activeBgmId: "field-day" | "wild-battle" | null;
  activeBgmPlayback: "html-audio" | "web-audio" | null;
  activeBgmVolume: number | null;
  isActiveBgmUsingMasterGain: boolean;
  activeBufferSourceCount: number;
  activeHtmlAudioElementCount: number;
  isBgmPlaying: boolean;
  lastSfxId: string | null;
};

test("Poke Lounge 모바일 멀티플레이 진입은 게임 프레임 안에 맞는다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1");

  const screen = page.locator("[data-room-entry-screen='true']");
  await expect(screen).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-room-entry-display-name]")).toBeVisible();
  await expect(page.locator("[data-room-entry-temporary-password]")).toBeVisible();
  await expect(page.locator("[data-room-entry-multiplayer-submit]")).toBeVisible();
  await expect(page.locator("[data-room-entry-code]")).toHaveCount(0);
  await expect(page.locator("[data-room-entry-settings]")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>("[data-poke-lounge-game-frame='true']");
    const entry = document.querySelector<HTMLElement>("[data-room-entry-screen='true']");
    if (!frame || !entry) {
      return null;
    }

    const frameRect = frame.getBoundingClientRect();
    const entryRect = entry.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      entryFits:
        entryRect.left >= frameRect.left &&
        entryRect.right <= frameRect.right + 1 &&
        entryRect.top >= frameRect.top &&
        entryRect.bottom <= frameRect.bottom + 1,
    };
  });

  expect(layout).toEqual({ documentFits: true, entryFits: true });
});

test("Poke Lounge 모바일 로딩이 멈춰도 런처로 이탈할 수 있다", async ({ page }) => {
  let releaseGameChunk: (() => void) | undefined;
  const gameChunkGate = new Promise<void>(resolve => {
    releaseGameChunk = resolve;
  });
  const gameChunkPattern =
    "**/_next/static/chunks/_app-pages-browser_src_components_poke-lounge_poke-lounge-game_tsx.js";

  await page.route(gameChunkPattern, async route => {
    await gameChunkGate;
    await route.continue().catch(() => {});
  });

  try {
    await page.goto("/ko-KR/game/poke-lounge", { waitUntil: "commit" });

    const exitButton = page.getByTestId("poke-lounge-loading-exit");
    await expect(page.getByTestId("poke-lounge-loading-screen")).toBeVisible();
    await expect(exitButton).toBeVisible();
    await exitButton.click();
    await expect(page).toHaveURL(/\/ko-KR\/game$/);
    await expect(page.getByRole("heading", { name: "Poke Lounge" })).toBeVisible();
  } finally {
    releaseGameChunk?.();
    await page.unroute(gameChunkPattern);
  }
});

test("Poke Lounge는 오디오 로딩이 끝난 뒤 모바일 메인 씬을 연다", async ({ page }) => {
  let releaseAudio: (() => void) | undefined;
  const audioGate = new Promise<void>(resolve => {
    releaseAudio = resolve;
  });
  const fieldBgmPattern = "**/assets/poke-lounge/audio/bgm/field-day.mp3";

  await page.route(fieldBgmPattern, async route => {
    await audioGate;
    await route.continue().catch(() => {});
  });

  try {
    await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("[data-room-entry-solo]").click();
    await chooseStarterIfNeeded(page, { dismissInitialHelp: false });

    const gameRoot = page.locator("#game-root");
    await expect(gameRoot.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(gameRoot).toHaveAttribute("data-poke-lounge-resource-status", "loading");
    await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toHaveCount(0);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const activeSceneKey =
              (
                window as Window & {
                  __POKE_LOUNGE_E2E__?: { getActiveSceneKey(): string | null };
                }
              ).__POKE_LOUNGE_E2E__?.getActiveSceneKey() ?? null;

            return activeSceneKey === "world" || activeSceneKey === "battle";
          }),
        { timeout: 30_000 },
      )
      .toBe(false);

    releaseAudio?.();
    await expect(gameRoot).toHaveAttribute("data-poke-lounge-resource-status", "ready", {
      timeout: 30_000,
    });
    await page
      .locator("[data-poke-lounge-mobile-deck='world-help']")
      .locator("[data-poke-lounge-mobile-deck-close='true']")
      .click();
    await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => readAudioPlaybackSnapshot(page), { timeout: 30_000 })
      .toMatchObject({
        activeBgmId: "field-day",
        activeBgmPlayback: "html-audio",
        activeBufferSourceCount: 0,
        isBgmPlaying: true,
      });
  } finally {
    releaseAudio?.();
    await page.unroute(fieldBgmPattern);
  }
});

test("Poke Lounge는 오디오 로딩 실패 시 메인 씬 대신 재시도 화면을 연다", async ({ page }) => {
  const fieldBgmPattern = "**/assets/poke-lounge/audio/bgm/field-day.mp3";
  await page.route(fieldBgmPattern, route => route.abort("failed"));

  try {
    await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("[data-room-entry-solo]").click();
    await chooseStarterIfNeeded(page, { dismissInitialHelp: false });

    const gameRoot = page.locator("#game-root");
    await expect(gameRoot).toHaveAttribute("data-poke-lounge-resource-status", "error", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("poke-lounge-startup-error")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toHaveCount(0);
  } finally {
    await page.unroute(fieldBgmPattern);
  }
});

test("Poke Lounge 화면에서 이탈하면 재생 중인 모든 오디오를 종료한다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => readAudioPlaybackSnapshot(page).then(snapshot => snapshot?.activeBgmId ?? null))
    .toBe("field-day");

  expect(await startMobileWildBattleForTest(page)).toBe(true);
  expect(await readAudioPlaybackSnapshot(page)).toMatchObject({
    activeBgmId: null,
    isBgmPlaying: false,
  });
  await expect
    .poll(() => readAudioPlaybackSnapshot(page), { timeout: 10_000 })
    .toMatchObject({
      activeBgmId: "wild-battle",
      activeBgmPlayback: "html-audio",
      isBgmPlaying: true,
    });

  const snapshots = await page.evaluate(async () => {
    const pokeWindow = window as Window & {
      __POKE_LOUNGE_CLEANUP_FOR_TEST__?: () => void;
      __POKE_LOUNGE_E2E__?: {
        getAudioPlaybackSnapshot(): AudioPlaybackSnapshot;
      };
    };
    const controller = pokeWindow.__POKE_LOUNGE_E2E__;
    const cleanup = pokeWindow.__POKE_LOUNGE_CLEANUP_FOR_TEST__;

    if (!controller || !cleanup) {
      throw new Error("Poke Lounge E2E audio controller is unavailable");
    }

    const before = controller.getAudioPlaybackSnapshot();
    cleanup();
    await new Promise(resolve => setTimeout(resolve, 0));

    return {
      before,
      after: controller.getAudioPlaybackSnapshot(),
    };
  });

  expect(snapshots.before.activeBgmId).not.toBeNull();
  expect(snapshots.before.activeBgmPlayback).toBe("html-audio");
  expect(snapshots.after).toEqual({
    activeBgmId: null,
    activeBgmPlayback: null,
    activeBgmVolume: null,
    isActiveBgmUsingMasterGain: false,
    activeBufferSourceCount: 0,
    activeHtmlAudioElementCount: 0,
    isBgmPlaying: false,
    lastSfxId: null,
  });
});

test("Poke Lounge 모바일 새 게임 확인 버튼은 가로와 세로 중앙에 정렬된다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-new-start]").click();

  const actionButtons = page.locator(".room-entry-confirm-dialog-actions button");
  await expect(actionButtons).toHaveCount(2);

  for (const button of await actionButtons.all()) {
    await expect(button).toHaveCSS("align-items", "center");
    await expect(button).toHaveCSS("justify-items", "center");
    await expect(button).toHaveCSS("text-align", "center");
  }
});

test("Poke Lounge 모바일 메뉴에서 런처로 나간다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });

  await page.locator("[data-poke-lounge-mobile-menu='true']").click();
  const exitButton = page.locator("[data-poke-lounge-mobile-game-exit='true']");
  await expect(exitButton).toBeVisible();
  await exitButton.click();

  const exitDialog = page.locator("[data-poke-lounge-game-exit-dialog='true']");
  await expect(exitDialog).toBeVisible();
  await expect(page).toHaveURL(/\/ko-KR\/game\/poke-lounge/);
  const [exitDialogBounds, viewport] = await Promise.all([
    exitDialog.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(exitDialogBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(exitDialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(exitDialogBounds!.x + exitDialogBounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  await page.locator("[data-poke-lounge-game-exit-confirm='true']").click();
  await expect(page).toHaveURL(/\/ko-KR\/game$/);
});

test("Poke Lounge 모바일 설정에서 계정 저장을 다시 연결한다", async ({ page }) => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60, sub: "poke-player" }),
  ).toString("base64url");
  let getAttempts = 0;

  await page.route("**/api/auth/session", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "poke-player", name: "Poke Player", email: "poke@example.com" },
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        idToken: `${header}.${payload}.signature`,
        idTokenExpiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
      }),
    }),
  );
  await page.route("**/game/poke-lounge/state", route => {
    if (route.request().method() === "PUT") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { revision: 1 } }),
      });
    }

    getAttempts += 1;
    return route.fulfill({
      status: getAttempts === 1 ? 503 : 404,
      contentType: "application/json",
      body: JSON.stringify(
        getAttempts === 1 ? { success: false, message: "temporary save outage" } : {},
      ),
    });
  });

  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await page.locator("[data-poke-lounge-mobile-menu='true']").click();

  const settings = page.locator("[data-poke-lounge-mobile-settings-screen='true']");
  const fallback = settings.getByTestId("poke-lounge-state-hydration-local-fallback");
  const retry = settings.getByTestId("poke-lounge-state-hydration-retry");
  await expect(fallback).toContainText("현재 탭의 로컬 상태로 시작했습니다");
  await expect(retry).toHaveText("계정 저장 다시 연결");
  await retry.click();
  await expect.poll(() => getAttempts).toBe(2);
  await expect(fallback).toHaveCount(0);
  await expect(retry).toHaveCount(0);
});

test("Poke Lounge 모바일은 세로 필드와 전체 화면 메뉴를 제공한다", async ({ page }, testInfo) => {
  const probe = await readMobileEnvironment(page);
  await testInfo.attach("mobile-environment.json", {
    body: Buffer.from(`${JSON.stringify(probe, null, 2)}\n`),
    contentType: "application/json",
  });
  const probeRoot = path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? "../../output/playwright",
    "mobile-probes",
  );
  mkdirSync(probeRoot, { recursive: true });
  writeFileSync(
    path.join(probeRoot, `${testInfo.project.name}.json`),
    `${JSON.stringify(probe, null, 2)}\n`,
  );

  expect(probe.userAgent).not.toBe("");
  expect(probe.platform).not.toBe("");

  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await expectStarterSelectionFitsMobileViewport(page);
  await chooseStarterIfNeeded(page, { dismissInitialHelp: false });
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expectMobileGameLogicalViewport(page);
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.partyHudVisible), {
      timeout: 30_000,
    })
    .toBe(false);

  const controls = page.locator("[data-poke-lounge-mobile-deck='explore']");
  const controlDock = page.locator("[data-poke-lounge-mobile-control-dock='true']");
  const directionalJoystick = page.locator("[data-poke-lounge-mobile-joystick='true']");
  await expect(controls).toBeVisible();
  await expect(controlDock).toBeVisible();
  await expect(directionalJoystick).toBeVisible();
  await expect(page.locator("[data-poke-lounge-web-fullscreen-toggle='true']")).toHaveCount(0);
  await expect(directionalJoystick.locator("[data-mobile-control]")).toHaveCount(0);
  await expect(page.locator("[data-mobile-touch-controls='true']")).toHaveCount(0);
  await expectPortraitFieldAndControlDock(page, controlDock);

  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.player ?? null), {
      timeout: 30_000,
    })
    .not.toBeNull();
  const initialHelp = page.locator("[data-poke-lounge-mobile-deck='world-help']");
  await expectMobileFullscreenScene(page, initialHelp);
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.shortcutGuideOpen), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect.poll(() => readShortcutGuideViewed(page)).toBe(false);
  await initialHelp.locator("[data-poke-lounge-mobile-deck-close='true']").click();
  await expect(initialHelp).toHaveCount(0);
  await expect.poll(() => readShortcutGuideViewed(page)).toBe(true);
  const before = await readWorldSnapshot(page);
  const joystickBounds = await directionalJoystick.boundingBox();

  expect(joystickBounds).not.toBeNull();
  await directionalJoystick.dispatchEvent("pointerdown", {
    clientX: joystickBounds!.x + joystickBounds!.width * 0.84,
    clientY: joystickBounds!.y + joystickBounds!.height / 2,
    pointerId: 1,
    pointerType: "touch",
  });
  await expect(directionalJoystick).toHaveAttribute("data-active", "true");
  await expect(directionalJoystick).toHaveAttribute("data-direction", "right");
  await page.waitForTimeout(300);
  await directionalJoystick.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
  });
  await expect(directionalJoystick).not.toHaveAttribute("data-active", "true");
  const after = await readWorldSnapshot(page);

  expect(before?.player).not.toBeNull();
  expect(after?.player).not.toBeNull();
  expect(
    before?.player?.x !== after?.player?.x ||
      before?.player?.y !== after?.player?.y ||
      after?.player?.facing === "right",
  ).toBe(true);

  const beforeDiagonal = await readWorldSnapshot(page);
  await directionalJoystick.dispatchEvent("pointerdown", {
    clientX: joystickBounds!.x + joystickBounds!.width * 0.78,
    clientY: joystickBounds!.y + joystickBounds!.height * 0.22,
    pointerId: 4,
    pointerType: "touch",
  });
  await expect(directionalJoystick).toHaveAttribute("data-direction", "up-right");
  await expect
    .poll(async () => {
      const current = await readWorldSnapshot(page);

      return Boolean(
        beforeDiagonal?.player &&
        current?.player &&
        current.player.x > beforeDiagonal.player.x &&
        current.player.y < beforeDiagonal.player.y,
      );
    })
    .toBe(true);
  await directionalJoystick.dispatchEvent("pointerup", {
    pointerId: 4,
    pointerType: "touch",
  });
  await expect(directionalJoystick).not.toHaveAttribute("data-direction");

  const confirm = page.locator("[data-mobile-control='confirm']");
  await confirm.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch" });
  await expect(confirm).toHaveAttribute("data-pressed", "true");
  await confirm.dispatchEvent("pointercancel", { pointerId: 2, pointerType: "touch" });
  await expect(confirm).not.toHaveAttribute("data-pressed", "true");

  const bag = page.locator("[data-mobile-control='bag']");
  await bag.dispatchEvent("pointerdown", { pointerId: 3, pointerType: "touch" });
  const inventoryScene = page.locator("[data-poke-lounge-mobile-deck='world-inventory-items']");
  await expectMobileFullscreenScene(page, inventoryScene);
  await expectSceneOccludesControl(inventoryScene, bag);
  await expectNoModalDialog(page);
  await expectWorldInputIsLocked(page);
  await page.locator("[data-poke-lounge-mobile-deck-close='true']").click();
  await expect(controls).toBeVisible();

  await page.locator("[data-poke-lounge-mobile-help='true']").click();
  await expectMobileFullscreenScene(
    page,
    page.locator("[data-poke-lounge-mobile-deck='world-help']"),
  );
  await expectNoModalDialog(page);
  await page.locator("[data-poke-lounge-mobile-deck-close='true']").click();
  await expect(controls).toBeVisible();

  await page.locator("[data-poke-lounge-mobile-party='true']").click();
  const partyScreen = page.locator("[data-poke-lounge-mobile-deck='world-party']");
  await expectMobileFullscreenScene(page, partyScreen);
  await expect(partyScreen.locator("[data-empty]")).toHaveCount(5);
  await expectNoModalDialog(page);
  await page.locator("[data-poke-lounge-mobile-deck-close='true']").click();
  await expect(controls).toBeVisible();

  await page.locator("[data-poke-lounge-mobile-menu='true']").click();
  const settingsScreen = page.locator("[data-poke-lounge-mobile-settings-screen='true']");
  await expectMobileFullscreenScene(page, settingsScreen);
  await expect(settingsScreen.locator("[data-fullscreen-toggle]")).toHaveCount(0);
  await expect(settingsScreen.locator("[data-poke-lounge-party-slot]")).toHaveCount(6);
  await expect(settingsScreen.locator("[data-poke-lounge-party-slot='0']")).toHaveAttribute(
    "data-active",
    "true",
  );
  const volumeButton = settingsScreen.getByRole("button", { name: /소리/ });
  await expect
    .poll(async () => (await readAudioPlaybackSnapshot(page))?.isActiveBgmUsingMasterGain ?? false)
    .toBe(true);
  await expect(volumeButton).toHaveText("소리 30%");
  await volumeButton.click();
  await expect(volumeButton).toHaveText("소리 75%");
  await expect
    .poll(async () => (await readAudioPlaybackSnapshot(page))?.activeBgmVolume)
    .toBeCloseTo(0.18);
  await volumeButton.click();
  await expect(volumeButton).toHaveText("소리 80%");
  await volumeButton.click();
  await expect(volumeButton).toHaveText("소리 100%");
  await expect
    .poll(async () => (await readAudioPlaybackSnapshot(page))?.activeBgmVolume)
    .toBeCloseTo(0.24);
  await volumeButton.click();
  await expect(volumeButton).toHaveText("소리 꺼짐");
  await expect(volumeButton).toHaveAccessibleName("소리 음소거");
  await expect.poll(async () => (await readAudioPlaybackSnapshot(page))?.activeBgmVolume).toBe(0);
  await expectSceneOccludesControl(settingsScreen, controls);
  await expectNoModalDialog(page);
  await expectWorldInputIsLocked(page);
  await page.locator("[data-poke-lounge-mobile-settings-close='true']").click();
  await expect(settingsScreen).toHaveCount(0);
});

test("Poke Lounge 모바일 전투는 하단 조작 도크에서 행동을 고른다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expectMobileGameLogicalViewport(page);
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });
  expect(await startMobileWildBattleForTest(page)).toBe(true);

  const messageDeck = page.locator("[data-poke-lounge-mobile-deck='battle-message']");
  const nextMessageButton = messageDeck.getByRole("button");
  await expect(messageDeck).toBeVisible({ timeout: 30_000 });
  await expect(nextMessageButton).toBeEnabled({ timeout: 30_000 });
  await expect(
    messageDeck.locator("[data-poke-lounge-mobile-battle-message='true']"),
  ).toBeVisible();
  await expect(messageDeck.locator("p")).not.toHaveText("");
  await expect(nextMessageButton).toHaveAccessibleName(/다음/);

  const helpButton = page.locator("[data-poke-lounge-mobile-help='true']");
  await helpButton.click();
  const battleHelp = page.locator("[data-poke-lounge-mobile-deck='battle-help']");
  await expect(battleHelp).toBeVisible();
  await expect(battleHelp).toContainText("화면의 싸운다·가방·포켓몬·도망 버튼");
  await expectControlDeckStaysBelowField(page, battleHelp);
  await battleHelp.locator("li").last().scrollIntoViewIfNeeded();
  await expect(battleHelp.locator("li").last()).toBeVisible();
  await battleHelp.locator("[data-poke-lounge-mobile-battle-help-close='true']").click();
  await expect(battleHelp).toHaveCount(0);
  await expect(messageDeck).toBeVisible();

  const singleActionLayout = await page.evaluate(() => {
    const gamePage = document.querySelector<HTMLElement>("[data-testid='poke-lounge-page']");
    const gameFrame = document.querySelector<HTMLElement>("[data-poke-lounge-game-frame='true']");
    const controlDock = document.querySelector<HTMLElement>(
      "[data-poke-lounge-mobile-control-dock='true']",
    );
    const messageDeck = document.querySelector<HTMLElement>(
      "[data-poke-lounge-mobile-deck='battle-message']",
    );
    const nextButton = messageDeck?.querySelector<HTMLElement>("button");

    if (!gamePage || !gameFrame || !controlDock || !messageDeck || !nextButton) {
      return null;
    }

    const gamePageStyles = window.getComputedStyle(gamePage);
    const gamePageBounds = gamePage.getBoundingClientRect();
    const gameFrameBounds = gameFrame.getBoundingClientRect();
    const controlDockBounds = controlDock.getBoundingClientRect();
    const messageDeckBounds = messageDeck.getBoundingClientRect();
    const nextButtonBounds = nextButton.getBoundingClientRect();
    const verticalPadding =
      Number.parseFloat(gamePageStyles.paddingTop) +
      Number.parseFloat(gamePageStyles.paddingBottom);
    const messageDeckStyles = window.getComputedStyle(messageDeck);
    const messageDeckVerticalPadding =
      Number.parseFloat(messageDeckStyles.paddingTop) +
      Number.parseFloat(messageDeckStyles.paddingBottom);

    return {
      expectedControlDockBottom:
        gamePageBounds.bottom - Number.parseFloat(gamePageStyles.paddingBottom),
      expectedControlDockHeight:
        gamePageBounds.height -
        verticalPadding -
        gameFrameBounds.height -
        Number.parseFloat(gamePageStyles.rowGap),
      controlDockHeight: controlDockBounds.height,
      controlDockBottom: controlDockBounds.bottom,
      messageDeckCenterX: messageDeckBounds.left + messageDeckBounds.width / 2,
      messageDeckCenterY: messageDeckBounds.top + messageDeckBounds.height / 2,
      nextButtonCenterX: nextButtonBounds.left + nextButtonBounds.width / 2,
      nextButtonCenterY: nextButtonBounds.top + nextButtonBounds.height / 2,
      expectedNextButtonHeight: Math.max(
        80,
        Math.min((messageDeckBounds.height - messageDeckVerticalPadding) * 0.22, 112),
      ),
      nextButtonHeight: nextButtonBounds.height,
      expectedNextButtonWidth: Math.min(window.innerWidth * 0.62, 240),
      nextButtonWidth: nextButtonBounds.width,
    };
  });

  expect(singleActionLayout).not.toBeNull();
  expect(singleActionLayout!.controlDockHeight).toBeCloseTo(
    singleActionLayout!.expectedControlDockHeight,
    1,
  );
  expect(singleActionLayout!.controlDockBottom).toBeCloseTo(
    singleActionLayout!.expectedControlDockBottom,
    1,
  );
  expect(singleActionLayout!.nextButtonCenterX).toBeCloseTo(
    singleActionLayout!.messageDeckCenterX,
    1,
  );
  expect(singleActionLayout!.nextButtonCenterY).toBeCloseTo(
    singleActionLayout!.messageDeckCenterY,
    1,
  );
  expect(singleActionLayout!.nextButtonHeight).toBeCloseTo(
    singleActionLayout!.expectedNextButtonHeight,
    1,
  );
  expect(singleActionLayout!.nextButtonWidth).toBeCloseTo(
    singleActionLayout!.expectedNextButtonWidth,
    1,
  );
  await nextMessageButton.click();

  const commandDeck = page.locator("[data-poke-lounge-mobile-deck='battle-command']");
  await expect(commandDeck).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-mobile-touch-controls='true']")).toHaveCount(0);

  await commandDeck.locator("button").first().click();
  const moveDeck = page.locator("[data-poke-lounge-mobile-deck='battle-moves']");
  await expect(moveDeck).toBeVisible({
    timeout: 10_000,
  });
  await expectControlDeckStaysBelowField(page, moveDeck);
  const moveSlotGeometry = await expectBattleGrid(moveDeck, "moves", 4);

  await moveDeck.getByRole("button", { name: /뒤로/ }).click();
  await expect(commandDeck).toBeVisible();
  await commandDeck.getByRole("button", { name: "가방" }).click();

  const itemDeck = page.locator("[data-poke-lounge-mobile-deck='battle-bag']");
  await expect(itemDeck).toBeVisible({ timeout: 10_000 });
  await expectControlDeckStaysBelowField(page, itemDeck);
  const itemSlotGeometry = await expectBattleGrid(itemDeck, "items", 7);
  const itemGrid = itemDeck.locator("[data-poke-lounge-mobile-option-grid='items']");
  const lastItem = itemGrid.getByRole("button").last();
  await lastItem.scrollIntoViewIfNeeded();
  const [itemGridBounds, lastItemBounds] = await Promise.all([
    itemGrid.boundingBox(),
    lastItem.boundingBox(),
  ]);

  expect(itemGridBounds).not.toBeNull();
  expect(lastItemBounds).not.toBeNull();
  expect(lastItemBounds!.y).toBeGreaterThanOrEqual(itemGridBounds!.y - 1);
  expect(lastItemBounds!.y + lastItemBounds!.height).toBeLessThanOrEqual(
    itemGridBounds!.y + itemGridBounds!.height + 1,
  );

  await itemDeck.getByRole("button", { name: /뒤로/ }).click();
  await expect(commandDeck).toBeVisible();
  await commandDeck.getByRole("button", { name: "포켓몬" }).click();

  const partyDeck = page.locator("[data-poke-lounge-mobile-deck='battle-party']");
  await expect(partyDeck).toBeVisible({ timeout: 10_000 });
  const partySlotGeometry = await readBattleSlotGeometry(
    partyDeck.locator("button[data-current]").first(),
  );

  expect(moveSlotGeometry).toEqual(partySlotGeometry);
  expect(itemSlotGeometry).toEqual(partySlotGeometry);
});

test("Poke Lounge 모바일은 새 기술 습득 결과를 조작 도크에 표시한다", async ({ page }) => {
  await gotoWithRetry(
    page,
    "/ko-KR/game/poke-lounge?scene=battle&e2eBattle=wild-move-learning&e2e=1",
  );
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const controller = (
            window as Window & {
              __POKE_LOUNGE_E2E__?: {
                getActiveSceneKey(): string | null;
                getBattleSnapshot(): {
                  battleEntrancePlaying: boolean;
                } | null;
              };
            }
          ).__POKE_LOUNGE_E2E__;

          return (
            controller?.getActiveSceneKey() === "battle" &&
            controller.getBattleSnapshot()?.battleEntrancePlaying === false
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  const reachedMoveReplacementWithoutEndMessage = await page.evaluate(() => {
    type BattleSnapshot = {
      message: string | null;
      moveReplacement: { newMoveName: string } | null;
      phase: string;
    };
    const controller = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          setBattleCommand(command: "fight"): BattleSnapshot | null;
          setBattleMoveIndex(index: number): BattleSnapshot | null;
          confirmBattle(): BattleSnapshot | null;
          drainBattleMessages(): BattleSnapshot | null;
        };
      }
    ).__POKE_LOUNGE_E2E__;

    controller?.setBattleCommand("fight");
    controller?.confirmBattle();
    controller?.setBattleMoveIndex(0);
    let snapshot = controller?.confirmBattle() ?? null;

    for (let remaining = 20; snapshot?.message && remaining > 0; remaining -= 1) {
      if (
        snapshot.phase === "move-replace-select" &&
        snapshot.message === "전투가 종료되었다. 확인을 누르면 필드로 돌아간다."
      ) {
        return false;
      }

      snapshot = controller?.confirmBattle() ?? null;
    }

    return (
      snapshot?.phase === "move-replace-select" &&
      snapshot.message === null &&
      snapshot.moveReplacement?.newMoveName === "화염자동차"
    );
  });

  expect(reachedMoveReplacementWithoutEndMessage).toBe(true);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __POKE_LOUNGE_E2E__?: {
                  getBattleSnapshot(): { evolutionAnimationPlaying: boolean } | null;
                };
              }
            ).__POKE_LOUNGE_E2E__?.getBattleSnapshot()?.evolutionAnimationPlaying ?? true,
        ),
      { timeout: 10_000 },
    )
    .toBe(false);

  const moveReplacement = page.locator("[data-poke-lounge-mobile-move-replacement='true']");
  await expect(moveReplacement).toContainText(
    "마그케인의 새 기술 화염자동차. 잊을 기술을 선택하세요.",
  );
  await expect(moveReplacement).toContainText("화염자동차 · PP 25/25 · 불꽃");

  const replacementButton = page.getByRole("button", {
    name: "연막 · 이 기술을 잊기 → 화염자동차",
  });
  await expect(replacementButton).toBeVisible();
  await replacementButton.click();
  await expect(page.locator("[data-poke-lounge-mobile-battle-message='true']")).toContainText(
    "마그케인은 연막을 잊고 화염자동차를 배웠다!",
  );
});

test("Poke Lounge 모바일 진화는 한국판 ROM 문구의 줄바꿈을 유지한다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?scene=battle&e2eBattle=wild-evolution&e2e=1");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const controller = (
            window as Window & {
              __POKE_LOUNGE_E2E__?: {
                getBattleSnapshot(): {
                  battleEntrancePlaying: boolean;
                } | null;
              };
            }
          ).__POKE_LOUNGE_E2E__;

          return controller?.getBattleSnapshot()?.battleEntrancePlaying ?? true;
        }),
      { timeout: 30_000 },
    )
    .toBe(false);

  await expect(page.locator("[data-poke-lounge-mobile-deck='battle-command']")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "싸운다", exact: true }).click();
  const moveDeck = page.locator("[data-poke-lounge-mobile-deck='battle-moves']");

  await expect(moveDeck).toBeVisible({ timeout: 30_000 });
  await moveDeck
    .locator("[data-poke-lounge-mobile-option-grid='moves']")
    .getByRole("button")
    .first()
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const controller = (
            window as Window & {
              __POKE_LOUNGE_E2E__?: {
                getBattleSnapshot(): {
                  result: unknown;
                } | null;
              };
            }
          ).__POKE_LOUNGE_E2E__;

          return controller?.getBattleSnapshot()?.result ?? null;
        }),
      { timeout: 30_000 },
    )
    .not.toBeNull();

  const evolutionSnapshot = await page.evaluate(() => {
    type BattleSnapshot = {
      evolutionAnimationPlaying: boolean;
      message: string | null;
    };
    const controller = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          getBattleSnapshot(): BattleSnapshot | null;
          confirmBattle(): BattleSnapshot | null;
        };
      }
    ).__POKE_LOUNGE_E2E__;
    let snapshot = controller?.getBattleSnapshot() ?? null;

    while (snapshot?.message && !snapshot.message.startsWith("...오잉!?")) {
      snapshot = controller?.confirmBattle() ?? null;
    }

    return snapshot;
  });
  const message = page.locator("[data-poke-lounge-mobile-battle-message='true']");

  expect(evolutionSnapshot?.message).toBe("...오잉!?\n치코리타의 모습이...!");
  expect(evolutionSnapshot?.evolutionAnimationPlaying).toBe(true);
  await expect(message).toHaveText("...오잉!?\n치코리타의 모습이...!");
  expect(await message.evaluate(element => window.getComputedStyle(element).whiteSpace)).toBe(
    "pre-line",
  );
});

test("이상한사탕 레벨업은 모바일 가방에서 잊을 기술을 직접 선택한다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });

  await page.evaluate(() => {
    const controller = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          closeWorldShortcutGuide(): void;
          getGameStateSnapshot(): {
            currentPlayerId: string;
            playersById: Record<string, Record<string, unknown>>;
          };
          setCurrentLocalPlayerForTest(player: Record<string, unknown>): void;
        };
      }
    ).__POKE_LOUNGE_E2E__;

    if (!controller) {
      throw new Error("Poke Lounge E2E controller is unavailable");
    }

    controller.closeWorldShortcutGuide();
    const state = controller.getGameStateSnapshot();
    const currentPlayer = state.playersById[state.currentPlayerId];
    controller.setCurrentLocalPlayerForTest({
      ...currentPlayer,
      activePartySlotIndex: 0,
      inventory: { rareCandy: 1 },
      party: [
        {
          slotIndex: 0,
          pokemon: {
            speciesId: 155,
            name: "브케인",
            level: 18,
            moves: [
              { id: 52, name: "불꽃세례", pp: 25, maxPp: 25 },
              { id: 108, name: "연막", pp: 20, maxPp: 20 },
              { id: 98, name: "전광석화", pp: 30, maxPp: 30 },
              { id: 45, name: "울음소리", pp: 40, maxPp: 40 },
            ],
          },
        },
      ],
    });
  });

  const bag = page.locator("[data-mobile-control='bag']");
  await bag.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch" });
  await bag.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch" });
  const itemScreen = page.locator("[data-poke-lounge-mobile-deck='world-inventory-items']");
  await expect(itemScreen).toBeVisible();
  await itemScreen.getByRole("button", { name: /이상한사탕/ }).click();
  await itemScreen.getByRole("button", { name: "사용", exact: true }).click();

  const partyScreen = page.locator("[data-poke-lounge-mobile-deck='world-inventory-party']");
  await expect(partyScreen).toBeVisible();
  await partyScreen.getByRole("button", { name: /브케인/ }).click();
  await partyScreen.getByRole("button", { name: "사용", exact: true }).click();

  const replacementScreen = page.locator(
    "[data-poke-lounge-mobile-deck='world-inventory-move-replace']",
  );
  await expect(replacementScreen).toBeVisible();
  await expect(replacementScreen).toContainText("화염자동차");
  await replacementScreen.getByRole("button", { name: /연막/ }).click();
  await replacementScreen.getByRole("button", { name: "선택한 기술 잊기" }).click();
  await expect(itemScreen).toBeVisible();

  const progress = await page.evaluate(() => {
    const controller = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          getGameStateSnapshot(): {
            currentPlayerId: string;
            playersById: Record<
              string,
              {
                inventory: Record<string, number>;
                party: Array<{
                  pokemon?: {
                    level?: number;
                    moves?: Array<{ id: number }>;
                  } | null;
                }>;
              }
            >;
          };
        };
      }
    ).__POKE_LOUNGE_E2E__;
    const state = controller?.getGameStateSnapshot();
    const currentPlayer = state?.playersById[state.currentPlayerId];

    return {
      level: currentPlayer?.party[0]?.pokemon?.level ?? null,
      moveIds: currentPlayer?.party[0]?.pokemon?.moves?.map(move => move.id) ?? [],
      rareCandyCount: currentPlayer?.inventory.rareCandy ?? 0,
    };
  });

  expect(progress).toEqual({
    level: 19,
    moveIds: [52, 172, 98, 45],
    rareCandyCount: 0,
  });
});

test("Poke Lounge 모바일 필드 시설은 전체 화면 씬에서 처리한다", async ({ page }) => {
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30_000 });
  await expectMobileGameLogicalViewport(page);
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });

  for (const [surface, deck] of [
    ["shop", "world-shop"],
    ["pc", "world-pc"],
    ["dice", "world-dice"],
  ] as const) {
    expect(await openMobileWorldSurfaceForTest(page, surface)).toBe(true);
    await expectMobileFullscreenScene(
      page,
      page.locator(`[data-poke-lounge-mobile-deck='${deck}']`),
    );
    await expectNoModalDialog(page);
    await page.locator("[data-poke-lounge-mobile-deck-close='true']").click();
    await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible();
  }
});

async function readMobileEnvironment(page: Page): Promise<{
  maxTouchPoints: number;
  coarsePointer: boolean;
  userAgent: string;
  platform: string;
}> {
  await page.goto("about:blank");
  return page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    userAgent: navigator.userAgent ?? "",
    platform: navigator.platform ?? "",
  }));
}

async function chooseStarterIfNeeded(
  page: Page,
  { dismissInitialHelp = true }: { dismissInitialHelp?: boolean } = {},
): Promise<void> {
  const starterSelection = page.locator("[data-screen='starter-selection']");
  const gameCanvas = page.locator("#game-root canvas");

  await expect
    .poll(
      async () => {
        if (await starterSelection.isVisible().catch(() => false)) return "starter";
        if (await gameCanvas.isVisible().catch(() => false)) return "canvas";
        return null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();

  if (await starterSelection.isVisible().catch(() => false)) {
    await page.locator("[data-starter-confirm]").click();
  }

  if (!dismissInitialHelp || new URL(page.url()).searchParams.get("scene") === "battle") {
    return;
  }

  const initialHelp = page.locator("[data-poke-lounge-mobile-deck='world-help']");
  await expect(initialHelp).toBeVisible({ timeout: 30_000 });
  await initialHelp.locator("[data-poke-lounge-mobile-deck-close='true']").click();
  await expect(page.locator("[data-poke-lounge-mobile-deck='explore']")).toBeVisible({
    timeout: 30_000,
  });
}

async function expectStarterSelectionFitsMobileViewport(page: Page): Promise<void> {
  const starterSelection = page.locator("[data-screen='starter-selection']");
  await expect(starterSelection).toBeVisible({ timeout: 30_000 });

  const layout = await page.evaluate(() => {
    const screen = document.querySelector(
      "[data-screen='starter-selection']",
    ) as HTMLElement | null;
    const panel = document.querySelector(".starter-selection-modal") as HTMLElement | null;
    const root = document.querySelector("#game-root");
    const controls = [
      document.querySelector("[data-starter-confirm]"),
      ...document.querySelectorAll("[data-starter-card]"),
    ];

    if (!screen || !panel || !root || controls.some(control => !(control instanceof HTMLElement))) {
      return null;
    }

    const rootRect = root.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();

    return {
      panelFits: panel.scrollHeight <= panel.clientHeight + 1,
      screenFits: screen.scrollHeight <= screen.clientHeight + 1,
      screenFitsRoot:
        screenRect.top >= rootRect.top - 1 && screenRect.bottom <= rootRect.bottom + 1,
      controlsFit: controls.every(control => {
        const rect = (control as HTMLElement).getBoundingClientRect();

        return (
          rect.left >= 0 &&
          rect.right <= window.innerWidth + 1 &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight + 1
        );
      }),
    };
  });

  expect(layout).toEqual({
    panelFits: true,
    screenFits: true,
    screenFitsRoot: true,
    controlsFit: true,
  });
}

async function readWorldSnapshot(page: Page): Promise<WorldSnapshot | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getWorldSnapshot(): WorldSnapshot | null };
        }
      ).__POKE_LOUNGE_E2E__?.getWorldSnapshot() ?? null,
  );
}

async function readShortcutGuideViewed(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const state = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          getGameStateSnapshot(): {
            currentPlayerId: string;
            playersById: Record<string, { guide?: { shortcutGuideViewed?: boolean } }>;
          };
        };
      }
    ).__POKE_LOUNGE_E2E__?.getGameStateSnapshot();

    return state?.playersById[state.currentPlayerId]?.guide?.shortcutGuideViewed ?? null;
  });
}

async function readAudioPlaybackSnapshot(page: Page): Promise<AudioPlaybackSnapshot | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: {
            getAudioPlaybackSnapshot(): AudioPlaybackSnapshot;
          };
        }
      ).__POKE_LOUNGE_E2E__?.getAudioPlaybackSnapshot() ?? null,
  );
}

async function readCanvasSnapshot(page: Page): Promise<CanvasSnapshot | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getCanvasSnapshot(): CanvasSnapshot | null };
        }
      ).__POKE_LOUNGE_E2E__?.getCanvasSnapshot() ?? null,
  );
}

async function expectMobileGameLogicalViewport(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const canvas = await readCanvasSnapshot(page);

        return canvas ? { width: canvas.width, height: canvas.height } : null;
      },
      { timeout: 30_000 },
    )
    .toEqual(MOBILE_GAME_VIEWPORT_SIZE);
}

async function expectControlDeckStaysBelowField(page: Page, deck: Locator): Promise<void> {
  const field = page.locator("[data-poke-lounge-mobile-screen='top']");
  const [fieldBounds, deckBounds, letterbox] = await Promise.all([
    field.boundingBox(),
    deck.boundingBox(),
    readMobileLetterbox(page),
  ]);
  const viewport = page.viewportSize();

  expect(fieldBounds).not.toBeNull();
  expect(deckBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(deckBounds!.y).toBeGreaterThanOrEqual(fieldBounds!.y + fieldBounds!.height - 1);
  expect(deckBounds!.y + deckBounds!.height).toBeLessThanOrEqual(
    viewport!.height - letterbox.bottom + 1,
  );
}

async function expectBattleGrid(
  deck: Locator,
  gridName: "moves" | "items",
  optionCount: number,
): Promise<BattleSlotGeometry> {
  const grid = deck.locator(`[data-poke-lounge-mobile-option-grid='${gridName}']`);

  await expect(grid).toBeVisible();
  const slotCount = Math.max(4, optionCount);
  await expect(grid.locator(":scope > *")).toHaveCount(slotCount);
  await expect(grid.getByRole("button")).toHaveCount(optionCount);
  await expect(grid.locator("[data-poke-lounge-mobile-empty-slot='true']")).toHaveCount(
    slotCount - optionCount,
  );

  const layout = await grid.evaluate(element => {
    const positions = Array.from(element.children).map(child => {
      const bounds = child.getBoundingClientRect();

      return { x: Math.round(bounds.x), y: Math.round(bounds.y) };
    });

    return {
      columns: new Set(positions.map(position => position.x)).size,
      rows: new Set(positions.map(position => position.y)).size,
    };
  });

  expect(layout).toEqual({ columns: 2, rows: Math.ceil(slotCount / 2) });

  return readBattleSlotGeometry(grid.locator(":scope > *").first());
}

type BattleSlotGeometry = {
  height: number;
  width: number;
  x: number;
  y: number;
};

async function readBattleSlotGeometry(slot: Locator): Promise<BattleSlotGeometry> {
  const bounds = await slot.boundingBox();

  expect(bounds).not.toBeNull();

  return {
    height: Math.round(bounds!.height),
    width: Math.round(bounds!.width),
    x: Math.round(bounds!.x),
    y: Math.round(bounds!.y),
  };
}

async function expectPortraitFieldAndControlDock(page: Page, controlDock: Locator): Promise<void> {
  const field = page.locator("[data-poke-lounge-mobile-screen='top']");
  const [fieldBounds, controlDockBounds, letterbox] = await Promise.all([
    field.boundingBox(),
    controlDock.boundingBox(),
    readMobileLetterbox(page),
  ]);
  const viewport = page.viewportSize();

  expect(fieldBounds).not.toBeNull();
  expect(controlDockBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  await expect(page.locator("[data-poke-lounge-mobile-screen='bottom']")).toHaveCount(0);
  expect(viewport!.height).toBeGreaterThan(viewport!.width);
  expect(letterbox.top).toBeGreaterThanOrEqual(16);
  expect(letterbox.bottom).toBeGreaterThanOrEqual(16);
  expect(fieldBounds!.x).toBeGreaterThanOrEqual(-1);
  expect(fieldBounds!.y).toBeGreaterThanOrEqual(letterbox.top - 1);
  expect(fieldBounds!.x + fieldBounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(fieldBounds!.y + fieldBounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(fieldBounds!.width).toBeGreaterThanOrEqual(viewport!.width * 0.9);
  expect(Math.abs(fieldBounds!.width / fieldBounds!.height - 4 / 3)).toBeLessThanOrEqual(0.01);

  expect(controlDockBounds!.x).toBeGreaterThanOrEqual(-1);
  expect(controlDockBounds!.y).toBeGreaterThanOrEqual(-1);
  expect(controlDockBounds!.x + controlDockBounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(controlDockBounds!.y + controlDockBounds!.height).toBeLessThanOrEqual(
    viewport!.height - letterbox.bottom + 1,
  );
  expect(Math.abs(controlDockBounds!.width / controlDockBounds!.height - 4 / 3)).toBeGreaterThan(
    0.1,
  );
}

async function expectMobileFullscreenScene(page: Page, scene: Locator): Promise<void> {
  await expect(scene).toBeVisible({ timeout: 10_000 });
  await expect(scene).toHaveAttribute("data-poke-lounge-mobile-fullscreen-scene", "true");

  const [bounds, ownsViewportCenter, letterbox] = await Promise.all([
    scene.boundingBox(),
    scene.evaluate(element => {
      const centerElement = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2,
      );

      return centerElement !== null && element.contains(centerElement);
    }),
    readMobileLetterbox(page),
  ]);
  const viewport = page.viewportSize();

  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeLessThanOrEqual(1);
  expect(bounds!.y).toBeGreaterThanOrEqual(letterbox.top - 1);
  expect(bounds!.y).toBeLessThanOrEqual(letterbox.top + 1);
  expect(bounds!.width).toBeGreaterThanOrEqual(viewport!.width - 1);
  expect(bounds!.height).toBeGreaterThanOrEqual(
    viewport!.height - letterbox.top - letterbox.bottom - 1,
  );
  expect(ownsViewportCenter).toBe(true);
}

async function readMobileLetterbox(page: Page): Promise<{ top: number; bottom: number }> {
  return page.getByTestId("poke-lounge-page").evaluate(element => {
    const style = getComputedStyle(element);

    return {
      top: Number.parseFloat(style.paddingTop),
      bottom: Number.parseFloat(style.paddingBottom),
    };
  });
}

async function expectNoModalDialog(page: Page): Promise<void> {
  await expect(page.locator("[role='dialog'], dialog[open]")).toHaveCount(0);
}

async function expectSceneOccludesControl(scene: Locator, control: Locator): Promise<void> {
  const controlBounds = await control.boundingBox();

  if (!controlBounds) {
    return;
  }

  const ownsControlCenter = await scene.evaluate(
    (element, point) => {
      const centerElement = document.elementFromPoint(point.x, point.y);

      return centerElement !== null && element.contains(centerElement);
    },
    {
      x: controlBounds.x + controlBounds.width / 2,
      y: controlBounds.y + controlBounds.height / 2,
    },
  );

  expect(ownsControlCenter).toBe(true);
}

async function expectWorldInputIsLocked(page: Page): Promise<void> {
  const before = await readWorldSnapshot(page);

  expect(before?.player).not.toBeNull();
  await page.keyboard.down("ArrowRight");
  try {
    await page.waitForTimeout(250);
  } finally {
    await page.keyboard.up("ArrowRight");
  }

  const after = await readWorldSnapshot(page);

  expect(after?.player).toEqual(before?.player);
}

async function openMobileWorldSurfaceForTest(
  page: Page,
  surface: "shop" | "pc" | "dice",
): Promise<boolean> {
  return page.evaluate(target => {
    const game = (
      window as Window & {
        __POKE_LOUNGE_GAME__?: {
          scene?: { getScene(key: string): unknown };
        };
      }
    ).__POKE_LOUNGE_GAME__;
    const world = game?.scene?.getScene("world") as
      | {
          openDiceGambleForTest?(): void;
          openPcBoxForTest?(): void;
          openShopForTest?(): void;
        }
      | undefined;

    if (!world) {
      return false;
    }

    if (target === "shop") {
      world.openShopForTest?.();
    } else if (target === "pc") {
      world.openPcBoxForTest?.();
    } else {
      world.openDiceGambleForTest?.();
    }

    return true;
  }, surface);
}

async function startMobileWildBattleForTest(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const game = (
      window as Window & {
        __POKE_LOUNGE_GAME__?: {
          scene?: { getScene(key: string): unknown };
        };
      }
    ).__POKE_LOUNGE_GAME__;
    const world = game?.scene?.getScene("world") as
      | {
          startWildBattleForTest?(input: {
            encounter: {
              level: number;
              mapKey: string;
              name: string;
              speciesId: number;
              step: { from: { x: number; y: number }; to: { x: number; y: number } };
            };
            facing: "front";
            x: number;
            y: number;
          }): void;
        }
      | undefined;

    if (!world?.startWildBattleForTest) {
      return false;
    }

    world.startWildBattleForTest({
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
    });

    return true;
  });
}

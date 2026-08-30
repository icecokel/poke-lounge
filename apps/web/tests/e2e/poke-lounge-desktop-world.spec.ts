import { expect, type Page, test } from "@playwright/test";
import { gotoWithRetry } from "./test-helpers";

type WorldSnapshot = {
  player: { x: number; y: number; facing: string } | null;
  camera: { scrollX: number; scrollY: number; width: number; height: number };
  surface: "help" | "shop" | "inventory" | "pc" | "dice" | "party" | null;
  shopKind: "basic" | "premium" | null;
  nurseHealing: { active: boolean; effectCount: number };
  nurseMessage: string;
  shortcutGuideOpen: boolean;
  interactionPrompt: string | null;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await chooseStarterIfNeeded(page);
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-poke-lounge-world-screen='true']")).toBeVisible();
  await expect(page.locator("[data-world-layer]")).toHaveCount(5);
  await expect(page.locator("[data-world-npc]")).toHaveCount(6);
  await expect(page.locator("[data-world-local-player='true']")).toHaveCount(1);
  await expect(page.locator("[data-poke-lounge-world-ui='true']")).toBeVisible();
  await expect(page.locator("[data-poke-lounge-world-hud='true']")).toBeVisible();
  await expect(page.locator("[data-poke-lounge-world-party-hud='true']")).toBeVisible();
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.player != null))
    .toBe(true);
  await page.evaluate(() => {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { closeWorldShortcutGuide(): void };
      }
    ).__POKE_LOUNGE_E2E__?.closeWorldShortcutGuide();
  });
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.shortcutGuideOpen ?? true))
    .toBe(false);
  await expect(page.locator("[data-poke-lounge-world-surface='help']")).toHaveCount(0);
  await page.locator('#game-root[data-poke-lounge-game-surface="ready"]').focus();
  await page.waitForTimeout(100);
});

test("desktop 월드는 키보드 이동, 맵 경계 충돌과 카메라 clamp를 유지한다", async ({ page }) => {
  const before = await readWorldSnapshot(page);
  expect(before?.player).not.toBeNull();

  await holdGameMovementKey(page, "ArrowRight", 300);

  const moved = await readWorldSnapshot(page);
  expect(moved?.player?.x).toBeGreaterThan(before?.player?.x ?? Number.POSITIVE_INFINITY);
  expect(moved?.player?.facing).toBe("right");

  await setWorldPlayerPosition(page, { x: 368, y: 452, facing: "back" });
  await holdGameMovementKey(page, "ArrowUp", 700);
  expect((await readWorldSnapshot(page))?.player?.y).toBeGreaterThan(416);

  await setWorldPlayerPosition(page, { x: 512, y: 384, facing: "back" });
  await holdGameMovementKey(page, "ArrowUp", 700);
  expect((await readWorldSnapshot(page))?.player?.y).toBeGreaterThanOrEqual(330);

  await setWorldPlayerPosition(page, { x: 12, y: 288, facing: "left" });
  await holdGameMovementKey(page, "ArrowLeft", 350);
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.camera.scrollX ?? -1))
    .toBe(0);
  expect((await readWorldSnapshot(page))?.player?.x).toBeGreaterThanOrEqual(12);

  await setWorldPlayerPosition(page, { x: 1268, y: 564, facing: "right" });
  await expect
    .poll(
      () =>
        readWorldSnapshot(page).then(snapshot =>
          snapshot
            ? {
                x: snapshot.camera.scrollX,
                y: snapshot.camera.scrollY,
                maxX: 1280 - snapshot.camera.width,
                maxY: 576 - snapshot.camera.height,
              }
            : null,
        ),
      { timeout: 10_000 },
    )
    .toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  const camera = (await readWorldSnapshot(page))?.camera;
  expect(camera).toBeDefined();
  expect(camera?.scrollX).toBeGreaterThanOrEqual(0);
  expect(camera?.scrollX).toBeLessThanOrEqual(1280 - (camera?.width ?? 0));
  expect(camera?.scrollY).toBeGreaterThanOrEqual(0);
  expect(camera?.scrollY).toBeLessThanOrEqual(576 - (camera?.height ?? 0));
});

test("desktop 월드의 6개 NPC 시설은 근접 상호작용에서만 열린다", async ({ page }) => {
  await setWorldPlayerPosition(page, { x: 64, y: 512, facing: "front" });
  await pressGameKey(page, "Enter");
  expect((await readWorldSnapshot(page))?.surface).toBeNull();

  await openNearbySurface(page, { x: 512, y: 360 }, "shop", "basic", 4);
  await openNearbySurface(page, { x: 896, y: 360 }, "shop", "premium", 13);
  await openNearbySurface(page, { x: 688, y: 292 }, "pc");
  await openNearbySurface(page, { x: 768, y: 360 }, "dice");

  const nurseBefore = (await readWorldSnapshot(page))?.nurseHealing.effectCount ?? 0;
  await setWorldPlayerPosition(page, { x: 640, y: 300, facing: "back" });
  await pressGameKey(page, "Enter");
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.nurseHealing.effectCount ?? 0))
    .toBe(nurseBefore + 1);
  await expect(page.locator("[data-poke-lounge-nurse-effect='true']")).toBeVisible();
  expect((await readWorldSnapshot(page))?.nurseMessage).toContain("회복");

  await setWorldPlayerPosition(page, { x: 1024, y: 360, facing: "back" });
  await pressGameKey(page, "Enter");
  await expect
    .poll(() =>
      page
        .locator("[data-world-battle-transition='true']")
        .evaluate(element => Number.parseFloat(getComputedStyle(element).opacity)),
    )
    .toBeGreaterThan(0);
  await expect.poll(() => readActiveScene(page), { timeout: 30_000 }).toBe("battle");
  const battleScreen = page.locator("[data-poke-lounge-battle-screen='true']");
  await expect(battleScreen).toBeVisible();
  await expect(battleScreen.locator("[data-poke-lounge-battle-pokemon]")).toHaveCount(2);
  await expect(battleScreen.locator("[data-poke-lounge-battle-hp-panel]")).toHaveCount(2);
  await expect(battleScreen.locator("[data-poke-lounge-battle-surface='message']")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __POKE_LOUNGE_E2E__?: {
                getBattleSnapshot(): { battleEntrancePlaying: boolean } | null;
              };
            }
          ).__POKE_LOUNGE_E2E__?.getBattleSnapshot()?.battleEntrancePlaying ?? true,
      ),
    )
    .toBe(false);
  await battleScreen.locator("[data-poke-lounge-battle-help='true']").click();
  const battleHelp = battleScreen.locator("[data-poke-lounge-battle-surface='help']");
  await expect(battleHelp).toBeVisible();
  await battleHelp.getByRole("button", { name: "닫기" }).click();
  const commandSurface = battleScreen.locator("[data-poke-lounge-battle-surface='command']");
  await expect(commandSurface).toBeVisible({ timeout: 30_000 });
  await commandSurface.getByRole("button", { name: "싸운다" }).click();
  await expect(battleScreen.locator("[data-poke-lounge-battle-surface='moves']")).toBeVisible();
});

async function chooseStarterIfNeeded(page: Page): Promise<void> {
  const starter = page.locator("[data-screen='starter-selection']");
  await expect
    .poll(
      async () =>
        (await starter.isVisible().catch(() => false)) ||
        (await page
          .locator('#game-root[data-poke-lounge-game-surface="ready"]')
          .isVisible()
          .catch(() => false)),
    )
    .toBe(true);

  if (await starter.isVisible().catch(() => false)) {
    await page.locator("[data-starter-confirm]").click();
  }
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

async function setWorldPlayerPosition(
  page: Page,
  position: { x: number; y: number; facing: "front" | "back" | "left" | "right" },
): Promise<void> {
  await page.evaluate(value => {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setWorldPlayerPositionForTest(position: typeof value): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setWorldPlayerPositionForTest(value);
  }, position);
  await page.waitForTimeout(100);
}

async function openNearbySurface(
  page: Page,
  position: { x: number; y: number },
  surface: NonNullable<WorldSnapshot["surface"]>,
  shopKind?: NonNullable<WorldSnapshot["shopKind"]>,
  shopItemCount?: number,
): Promise<void> {
  await setWorldPlayerPosition(page, { ...position, facing: "back" });
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.interactionPrompt ?? ""))
    .not.toBe("");
  await pressGameKey(page, "Enter");
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.surface ?? null))
    .toBe(surface);
  await expect(page.locator(`[data-poke-lounge-world-surface='${surface}']`)).toBeVisible();
  if (shopKind) {
    expect((await readWorldSnapshot(page))?.shopKind).toBe(shopKind);
  }
  if (shopItemCount !== undefined) {
    await expect(page.locator("[data-poke-lounge-shop-item]")).toHaveCount(shopItemCount);
  }
  await pressGameKey(page, "Backspace");
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.surface ?? null))
    .toBeNull();
  await expect(page.locator("[data-poke-lounge-world-surface]")).toHaveCount(0);
}

async function readActiveScene(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getActiveSceneKey(): string | null };
        }
      ).__POKE_LOUNGE_E2E__?.getActiveSceneKey() ?? null,
  );
}

async function pressGameKey(page: Page, key: "Backspace" | "Enter"): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(50);
  await page.keyboard.up(key);
}

async function holdGameMovementKey(
  page: Page,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp",
  durationMs: number,
): Promise<void> {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

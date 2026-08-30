import { expect, type Page, test } from "@playwright/test";
import { gotoWithRetry } from "./test-helpers";

type WorldSnapshot = {
  player: { x: number; y: number; facing: string } | null;
  shortcutGuideOpen: boolean;
  nurseHealing: { effectCount: number };
  surface: string | null;
};

type BattleSnapshot = {
  battleEntrancePlaying: boolean;
  message: string | null;
  phase: string;
  result: unknown;
};

test("싱글 플레이어는 탐색·시설·야생전 뒤 같은 위치로 복귀하고 진행을 복원한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoWithRetry(page, "/ko-KR/game/poke-lounge?e2e=1&wildEncounterRate=0");
  await enterSoloWorld(page);

  const gameSurface = page.locator('#game-root[data-poke-lounge-game-surface="ready"]');
  await expect(page.locator("[data-poke-lounge-world-screen='true']")).toBeVisible();
  await gameSurface.focus();
  await closeWorldHelp(page);
  await gameSurface.focus();

  const beforeMovement = await readWorldSnapshot(page);
  await holdKey(page, "ArrowRight", 300);
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.player?.x ?? 0))
    .toBeGreaterThan(beforeMovement?.player?.x ?? Number.POSITIVE_INFINITY);

  await pressKey(page, "i");
  await expect(page.locator("[data-poke-lounge-world-surface='inventory-items']")).toBeVisible();
  expect((await readWorldSnapshot(page))?.surface).toBe("inventory");
  await pressKey(page, "Backspace");
  await expect(page.locator("[data-poke-lounge-world-surface='inventory-items']")).toHaveCount(0);

  const nurseEffectCount = (await readWorldSnapshot(page))?.nurseHealing.effectCount ?? 0;
  await setWorldPlayerPosition(page, { x: 640, y: 300, facing: "back" });
  await pressKey(page, "Enter");
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.nurseHealing.effectCount ?? 0))
    .toBe(nurseEffectCount + 1);
  await expect(page.locator("[data-poke-lounge-nurse-effect='true']")).toBeVisible();

  const returnPosition = { x: 656, y: 446, facing: "front" as const };
  await startWildBattle(page, returnPosition);
  await expect.poll(() => readActiveScene(page), { timeout: 30_000 }).toBe("battle");
  await expect(page.locator("[data-poke-lounge-battle-screen='true']")).toBeVisible();
  await expect(page.locator("[data-poke-lounge-battle-pokemon]")).toHaveCount(2);
  await expect(page.locator("[data-poke-lounge-battle-hp-panel]")).toHaveCount(2);
  await expect
    .poll(() => readBattleSnapshot(page).then(snapshot => snapshot?.battleEntrancePlaying ?? true))
    .toBe(false);

  await finishWildBattleThroughUi(page);
  await expect.poll(() => readActiveScene(page), { timeout: 30_000 }).toBe("world");
  await expect(page.locator("[data-poke-lounge-world-screen='true']")).toBeVisible();
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.player))
    .toMatchObject(returnPosition);

  await page.reload();
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
  await expect(page.locator("[data-screen='starter-selection']")).toHaveCount(0);
  await expect(gameSurface).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.player))
    .toMatchObject(returnPosition);
});

async function enterSoloWorld(page: Page): Promise<void> {
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-room-entry-solo]").click();
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
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function closeWorldHelp(page: Page): Promise<void> {
  if ((await readWorldSnapshot(page))?.shortcutGuideOpen) {
    await page
      .locator("[data-poke-lounge-world-surface='help']")
      .getByRole("button", { name: "뒤로" })
      .click();
  }
  await expect
    .poll(() => readWorldSnapshot(page).then(snapshot => snapshot?.shortcutGuideOpen ?? true))
    .toBe(false);
}

async function startWildBattle(
  page: Page,
  position: { x: number; y: number; facing: "front" },
): Promise<void> {
  await page.evaluate(value => {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: {
          startWildBattleForTest(input: {
            encounter: {
              mapKey: string;
              step: { from: { x: number; y: number }; to: { x: number; y: number } };
              speciesId: number;
              name: string;
              level: number;
            };
            x: number;
            y: number;
            facing: "front";
          }): unknown;
        };
      }
    ).__POKE_LOUNGE_E2E__?.startWildBattleForTest({
      encounter: {
        mapKey: "town",
        step: { from: { x: 20, y: 13 }, to: { x: 20, y: 14 } },
        speciesId: 129,
        name: "잉어킹",
        level: 1,
      },
      ...value,
    });
  }, position);
}

async function finishWildBattleThroughUi(page: Page): Promise<void> {
  const battle = page.locator("[data-poke-lounge-battle-screen='true']");

  for (let actionCount = 0; actionCount < 50; actionCount += 1) {
    if ((await readActiveScene(page)) === "world") return;
    const snapshot = await readBattleSnapshot(page);

    if (snapshot?.message) {
      const message = battle.locator("[data-poke-lounge-battle-surface='message']");
      await expect(message).toBeEnabled({ timeout: 10_000 });
      await message.click();
      continue;
    }
    if (snapshot?.phase === "command") {
      await battle
        .locator("[data-poke-lounge-battle-surface='command']")
        .getByRole("button", { name: /싸운다/ })
        .click();
      continue;
    }
    if (snapshot?.phase === "move-select") {
      await battle
        .locator("[data-poke-lounge-battle-surface='moves'] button:not(:disabled)")
        .first()
        .click();
      continue;
    }
    if (snapshot?.phase === "ended" || snapshot?.result) {
      const message = battle.locator("[data-poke-lounge-battle-surface='message']");
      await expect(message).toBeEnabled({ timeout: 10_000 });
      await message.click();
      continue;
    }

    await expect
      .poll(async () => {
        const next = await readBattleSnapshot(page);
        return `${next?.phase}:${next?.message ?? ""}:${Boolean(next?.result)}`;
      })
      .not.toBe(`${snapshot?.phase}:${snapshot?.message ?? ""}:${Boolean(snapshot?.result)}`);
  }

  throw new Error("싱글 야생전이 50번의 UI 진행 안에 종료되지 않았습니다.");
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

async function readBattleSnapshot(page: Page): Promise<BattleSnapshot | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getBattleSnapshot(): BattleSnapshot | null };
        }
      ).__POKE_LOUNGE_E2E__?.getBattleSnapshot() ?? null,
  );
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

async function setWorldPlayerPosition(
  page: Page,
  position: { x: number; y: number; facing: "back" },
): Promise<void> {
  await page.evaluate(value => {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setWorldPlayerPositionForTest(position: typeof value): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setWorldPlayerPositionForTest(value);
  }, position);
}

async function pressKey(page: Page, key: "Backspace" | "Enter" | "i") {
  await page.keyboard.press(key);
}

async function holdKey(page: Page, key: "ArrowRight", durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

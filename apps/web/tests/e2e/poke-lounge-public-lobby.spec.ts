import { randomUUID } from "node:crypto";
import { expect, type Page, type Response, test } from "@playwright/test";

type PublicRoom = {
  roomCode: string;
  participants: Array<{
    playerId: string;
    displayName: string;
  }>;
  round: {
    durationMs: number;
    startedAtMs: number | null;
    endsAtMs: number | null;
  };
};

type PokeLoungeWindow = Window & {
  __POKE_LOUNGE_E2E__?: {
    getGameStateSnapshot(): {
      tournament: {
        serverProjection: {
          roomRound: PublicRoom["round"];
        } | null;
      };
    };
  };
};

const publicGameUrl = "/ko-KR/game/poke-lounge?e2e=1";

test.use({ trace: "off" });

test("공개 임시 비밀번호로 입장한 두 사용자는 방장 시작 시 같은 3분을 받는다", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  expect(process.env.POKE_LOUNGE_E2E_ENV_ISOLATED).toBe("1");
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const temporaryPassword = randomUUID();
  const roomRequests: Array<{ authorization?: string; path: string }> = [];

  for (const page of [hostPage, guestPage]) {
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/poke-lounge/rooms")) {
        roomRequests.push({ authorization: request.headers().authorization, path });
      }
    });
  }

  try {
    const hostRoomResponse = hostPage.waitForResponse(isRoomCreationResponse);
    await enterPublicRoom(hostPage, "빠른 레드", temporaryPassword);
    const hostRoom = await readRoom(await hostRoomResponse);
    await expect(hostPage.locator("[data-room-lobby='true']")).toBeVisible();

    const guestRoomResponse = guestPage.waitForResponse(isRoomCreationResponse);
    await enterPublicRoom(guestPage, "침착한 그린", temporaryPassword);
    const guestRoom = await readRoom(await guestRoomResponse);
    await expect(guestPage.locator("[data-room-lobby='true']")).toBeVisible();
    await expect(hostPage.locator("[data-room-lobby-participant='true']")).toHaveCount(2);
    await expect(hostPage.locator("[data-room-lobby-badge='true']")).toHaveCount(7);
    await expect(hostPage.locator("[data-room-lobby-actions='true']")).toBeVisible();
    await expect(hostPage.locator("[data-room-lobby-status='true']")).toBeVisible();

    expect(guestRoom.roomCode === hostRoom.roomCode).toBe(true);
    expect(guestRoom.participants.map(participant => participant.displayName)).toEqual([
      "빠른 레드",
      "침착한 그린",
    ]);
    expect(new Set(guestRoom.participants.map(participant => participant.playerId)).size).toBe(2);
    for (const page of [hostPage, guestPage]) {
      expect(new URL(page.url()).searchParams.has("room")).toBe(false);
      expect(
        await page.locator("body").evaluate((body, roomCode) => {
          return !body.textContent?.includes(roomCode);
        }, hostRoom.roomCode),
      ).toBe(true);
    }

    const hostReady = hostPage.locator("[data-room-lobby-ready='true']");
    const guestReady = guestPage.locator("[data-room-lobby-ready='true']");
    await expect(hostReady).toBeEnabled();
    await expect(guestReady).toBeEnabled();
    await hostReady.click();
    await guestReady.click();

    const startButton = hostPage.locator("[data-room-lobby-start='true']");
    await expect(startButton).toBeEnabled();
    const startResponse = hostPage.waitForResponse(response => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" && url.pathname.endsWith("/start") && response.ok()
      );
    });
    await startButton.click();
    const startedRoom = await readRoom(await startResponse);
    expect(startedRoom.round.startedAtMs).not.toBeNull();
    expect(startedRoom.round.endsAtMs).not.toBeNull();
    expect(startedRoom.round.endsAtMs! - startedRoom.round.startedAtMs!).toBe(180_000);

    const expectedClock = {
      durationMs: 180_000,
      startedAtMs: startedRoom.round.startedAtMs,
      endsAtMs: startedRoom.round.endsAtMs,
    };
    for (const page of [hostPage, guestPage]) {
      await expect.poll(() => getRoundClock(page), { timeout: 30_000 }).toEqual(expectedClock);
      await expect(page.locator("[data-room-lobby='true']")).toBeHidden();
    }

    expect(roomRequests.some(request => request.path.endsWith("/competitive-seat"))).toBe(false);
    expect(roomRequests.every(request => request.authorization === undefined)).toBe(true);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

async function enterPublicRoom(
  page: Page,
  displayName: string,
  temporaryPassword: string,
): Promise<void> {
  const response = await page.goto(publicGameUrl, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();
  await page.locator("[data-room-entry-tab='multiplayer']").click();
  await page.locator("[data-room-entry-display-name='true']").fill(displayName);
  await page.locator("[data-room-entry-temporary-password='true']").fill(temporaryPassword);
  await page.locator("[data-room-entry-multiplayer-submit='true']").click();

  const starterSelection = page.locator("[data-screen='starter-selection']");
  const surface = page.locator('#game-root[data-poke-lounge-game-surface="ready"]');
  await expect
    .poll(async () => {
      if (await starterSelection.isVisible().catch(() => false)) return "starter";
      if (await surface.isVisible().catch(() => false)) return "surface";
      return null;
    })
    .not.toBeNull();
  if (await starterSelection.isVisible().catch(() => false)) {
    await page.locator("[data-starter-confirm]").click();
  }
}

function isRoomCreationResponse(response: {
  request(): { method(): string };
  url(): string;
  ok(): boolean;
}) {
  const url = new URL(response.url());
  return (
    response.request().method() === "POST" &&
    url.pathname.endsWith("/poke-lounge/rooms") &&
    response.ok()
  );
}

async function getRoundClock(page: Page): Promise<PublicRoom["round"] | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;
    const roomRound =
      pokeWindow.__POKE_LOUNGE_E2E__?.getGameStateSnapshot().tournament.serverProjection?.roomRound;
    return roomRound
      ? {
          durationMs: roomRound.durationMs,
          startedAtMs: roomRound.startedAtMs,
          endsAtMs: roomRound.endsAtMs,
        }
      : null;
  });
}

async function readRoom(response: Response): Promise<PublicRoom> {
  const body = (await response.json()) as PublicRoom | { data: PublicRoom };
  return "data" in body ? body.data : body;
}

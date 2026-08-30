import fs from "node:fs";
import path from "node:path";
import { expect, type Browser, type Page, type Request, test } from "@playwright/test";
import {
  COMPETITIVE_RULESET_HASH,
  createTournamentBracketState,
  getReadyTournamentMatches,
  recordTournamentMatchResult,
} from "@poke-lounge/battle";
import {
  isLegalAuthoritativeAction,
  toAuthoritativeBattleState,
} from "../../src/components/poke-lounge/runtime/game/battle/authoritative-battle-adapter";
import { parseCompetitiveProjection } from "../../src/components/poke-lounge/runtime/game/network/competitive-projection";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  loadRuntimeGameDataJson,
  POKEMON_DATA_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
} from "../../src/components/poke-lounge/runtime/game/data/game-data-json";
import { createCompetitiveBattleLaunchCache } from "../../src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch";
import type { CompetitiveProjection } from "../../src/components/poke-lounge/runtime/game/network/localPreviewRoom";
import { createGameStateStore } from "../../src/components/poke-lounge/runtime/game/state/gameStateStore";
import { buildPokeLoungeSaveSnapshot } from "../../src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";
import { getPokeLoungeCopy } from "../../src/components/poke-lounge/poke-lounge-copy";
import { gotoWithRetry } from "./test-helpers";

type PokeLoungeWindow = Window & {
  __POKE_LOUNGE_E2E__?: {
    getActiveSceneKey(): string | null;
    getRoomSnapshot(): {
      roomId: string | null;
      sessionId: string | null;
    };
    getGameStateSnapshot(): {
      currentPlayerId: string;
      round: {
        phase: string;
      };
      session: {
        connectionStatus: "offline" | "connecting" | "online";
      };
    };
    getWorldSnapshot(): {
      player: { x: number; y: number } | null;
    } | null;
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
      facing: "front" | "back" | "left" | "right";
    }): unknown;
    getBattleSnapshot(): {
      competitive: { matchId: string } | null;
    } | null;
    setBattlePartySlotIndex(index: number): unknown;
    sendCurrentPlayerChangedMapForTest(overrides?: Record<string, unknown>): boolean;
    disposeRoomForTest(): void;
    reconnectRoomForTest(): boolean;
    beginWorldBattleLaunchTracking(): void;
    getWorldBattleLaunches(): Array<{ matchId: string }>;
  };
  __POKE_LOUNGE_SOCKET_TEST__?: PokeLoungeSocketTestControl;
};

interface PokeLoungeSocketTestControl {
  createdCount(): number;
  connected(): boolean;
  disconnect(): void;
  emitConnectError(): void;
  emitRevisionConflict(room: unknown): void;
  emitSnapshot(room: unknown): void;
  emitSubscriptionError(): void;
  reconnect(): void;
  subscriptions(): Array<{
    roomCode: string;
    playerId: string;
    sessionId: string;
    afterRevision: number;
  }>;
  transportErrors(): string[];
}

const LOCALE = "ko-KR";
const copy = getPokeLoungeCopy(LOCALE);
const ROOM_CODE = "SRV001";
const BRACKET_MATCH_ID = "game-round-1-bracket-1-match-1";
const ROOM_EXPIRES_AT_MS = 253402300799999;
const COMPETITIVE_TURN_ENDS_AT_MS = Date.now() + 60 * 60 * 1000;
const AUTH_ID_TOKEN_EXPIRES_AT = Math.floor(Date.now() / 1000) + 60 * 60;
const AUTH_ID_TOKEN = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ exp: AUTH_ID_TOKEN_EXPIRES_AT })).toString("base64url")}.signature`;
const webRoot = process.cwd();

test.beforeAll(async () => {
  await loadRuntimeGameDataJson(async input => {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    if (
      ![
        POKEMON_DATA_JSON_PATH,
        LEVEL_UP_MOVE_TABLE_JSON_PATH,
        WILD_BATTLE_MOVE_SETS_JSON_PATH,
        BATTLE_POKEMON_ASSETS_JSON_PATH,
      ].includes(requestPath)
    ) {
      return new Response(null, { status: 404 });
    }
    return new Response(
      fs.readFileSync(path.join(webRoot, "public", requestPath.replace(/^\//, "")), "utf8"),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
});

test.afterAll(() => resetRuntimeGameDataJsonStateForTest());

const createCompetitiveProjection = (
  overrides: Partial<CompetitiveProjection> = {},
): CompetitiveProjection => ({
  matchId: "11111111-1111-4111-8111-111111111111",
  bracketMatchId: "game-round-1-bracket-1-match-1",
  kind: "tournament-unranked",
  assignmentRevision: 7,
  rulesetVersion: 2,
  rulesetHash: COMPETITIVE_RULESET_HASH,
  currentTurn: 3,
  turnEndsAtMs: COMPETITIVE_TURN_ENDS_AT_MS,
  status: "active",
  playerIds: ["player-a", "player-b"],
  stateHash: "b".repeat(64),
  currentState: {
    rulesetVersion: 2,
    turn: 3,
    participantIds: ["player-a", "player-b"],
    playersById: {
      "player-a": {
        playerId: "player-a",
        activeSlotIndex: 1,
        team: [
          {
            slotIndex: 1,
            speciesId: 7,
            level: 11,
            maxHp: 34,
            currentHp: 20,
            status: "normal",
            statStages: createZeroStatStages(),
            moves: [
              { moveId: 55, pp: 18 },
              { moveId: 86, pp: 9 },
            ],
          },
          {
            slotIndex: 3,
            speciesId: 158,
            level: 13,
            maxHp: 38,
            currentHp: 31,
            status: "paralyzed",
            statStages: createZeroStatStages(),
            moves: [
              { moveId: 55, pp: 19 },
              { moveId: 44, pp: 7 },
            ],
          },
        ],
      },
      "player-b": {
        playerId: "player-b",
        activeSlotIndex: 0,
        team: [
          {
            slotIndex: 0,
            speciesId: 4,
            level: 11,
            maxHp: 32,
            currentHp: 14,
            status: "normal",
            statStages: createZeroStatStages(),
            moves: [
              { moveId: 33, pp: 17 },
              { moveId: 52, pp: 9 },
            ],
          },
          {
            slotIndex: 2,
            speciesId: 1,
            level: 12,
            maxHp: 35,
            currentHp: 35,
            status: "normal",
            statStages: createZeroStatStages(),
            moves: [
              { moveId: 33, pp: 20 },
              { moveId: 73, pp: 10 },
            ],
          },
        ],
      },
    },
    terminal: null,
  },
  submittedPlayerIds: [],
  terminal: null,
  ...overrides,
});

function createZeroStatStages() {
  return {
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

function createServerCompetitiveProjection(
  server: MockServerState,
  overrides: Partial<CompetitiveProjection> = {},
): CompetitiveProjection {
  const [first, second] = getStateParticipants(server);
  const template = createCompetitiveProjection();
  const firstState = template.currentState.playersById["player-a"];
  const secondState = template.currentState.playersById["player-b"];

  return {
    ...template,
    playerIds: [first.playerId, second.playerId],
    currentState: {
      ...template.currentState,
      participantIds: [first.playerId, second.playerId],
      playersById: {
        [first.playerId]: { ...firstState, playerId: first.playerId },
        [second.playerId]: { ...secondState, playerId: second.playerId },
      },
    },
    ...overrides,
  };
}

function createCompetitiveProjectionForPlayers(
  playerIds: [string, string],
  overrides: Partial<CompetitiveProjection> = {},
): CompetitiveProjection {
  const template = createCompetitiveProjection();
  const [firstState, secondState] = Object.values(template.currentState.playersById);

  return {
    ...template,
    playerIds,
    currentState: {
      ...template.currentState,
      participantIds: playerIds,
      playersById: {
        [playerIds[0]]: { ...firstState, playerId: playerIds[0] },
        [playerIds[1]]: { ...secondState, playerId: playerIds[1] },
      },
    },
    ...overrides,
  };
}

test.describe("Poke Lounge authoritative battle adapter", () => {
  test("socket projection의 active slot HP와 PP를 canonical 값 그대로 렌더 상태로 옮긴다", () => {
    const state = toAuthoritativeBattleState(createCompetitiveProjection(), "player-a");

    expect(state.phase).toBe("command");
    expect(state.turn).toBe(3);
    expect(state.player.activePartySlotIndex).toBe(1);
    expect(state.player.pokemon).toMatchObject({ currentHp: 20, maxHp: 34, status: "normal" });
    expect(state.player.pokemon.moves[1]).toMatchObject({ name: "전기자석파", pp: 9 });
    expect(state.opponent.pokemon).toMatchObject({ currentHp: 14, maxHp: 32 });
    expect(state.opponent.pokemon.moves[1]).toMatchObject({ name: "불꽃세례", pp: 9 });
  });

  test("PP가 없거나 현재 슬롯인 교체 대상과 전투불능 슬롯은 제출 불가다", () => {
    const projection = createCompetitiveProjection();
    const player = projection.currentState.playersById["player-a"];
    player.team[player.activeSlotIndex].moves[1].pp = 0;
    player.team[0].currentHp = 0;

    expect(
      isLegalAuthoritativeAction(projection, "player-a", {
        kind: "move",
        moveId: 44,
      }),
    ).toBe(false);
    expect(
      isLegalAuthoritativeAction(projection, "player-a", { kind: "switch", slotIndex: 1 }),
    ).toBe(false);
    expect(
      isLegalAuthoritativeAction(projection, "player-a", { kind: "switch", slotIndex: 0 }),
    ).toBe(false);
    expect(
      isLegalAuthoritativeAction(projection, "player-a", { kind: "switch", slotIndex: 2 }),
    ).toBe(false);
  });

  test("active Pokemon의 HP가 0이면 PP가 남은 move도 제출 불가다", () => {
    const projection = createCompetitiveProjection();
    projection.currentState.playersById["player-a"].team[0].currentHp = 0;

    expect(
      isLegalAuthoritativeAction(projection, "player-a", {
        kind: "move",
        moveId: 55,
      }),
    ).toBe(false);
  });

  test("자신이 현재 턴을 제출한 projection은 reconnect에서도 waiting으로 복원한다", () => {
    const projection = createCompetitiveProjection({ submittedPlayerIds: ["player-a"] });

    const state = toAuthoritativeBattleState(projection, "player-a");

    expect(state.phase).toBe("resolving");
    expect(state.messageQueue).toEqual(["상대의 선택을 기다리는 중..."]);
  });

  test("terminal winner와 loser는 서버 projection만 사용한다", () => {
    const terminal = {
      winnerPlayerId: "player-b",
      loserPlayerId: "player-a",
      reason: "faint" as const,
      scoreByPlayerId: { "player-a": 50 as const, "player-b": 100 as const },
    };
    const projection = createCompetitiveProjection({
      status: "completed",
      terminal,
      currentState: {
        ...createCompetitiveProjection().currentState,
        terminal,
      },
    });

    const state = toAuthoritativeBattleState(projection, "player-a");

    expect(state.phase).toBe("ended");
    expect(state.result).toEqual({
      winnerPlayerId: "player-b",
      loserPlayerId: "player-a",
      reason: "faint",
    });
    expect(state.messageQueue).toEqual(["패배했습니다."]);
  });
});

test.describe("Poke Lounge competitive projection parser", () => {
  test("revision과 state turn 불일치 및 participant 위조를 거부한다", () => {
    expect(() =>
      parseCompetitiveProjection(createCompetitiveProjection({ assignmentRevision: -1 })),
    ).toThrow();
    expect(() =>
      parseCompetitiveProjection({
        ...createCompetitiveProjection(),
        currentState: { ...createCompetitiveProjection().currentState, turn: 2 },
      }),
    ).toThrow();
    expect(() =>
      parseCompetitiveProjection(
        createCompetitiveProjection({ playerIds: ["player-a", "player-a"] }),
      ),
    ).toThrow();
    expect(() =>
      parseCompetitiveProjection(createCompetitiveProjection({ playerIds: ["player-a", ""] })),
    ).toThrow();
    expect(() =>
      parseCompetitiveProjection(
        createCompetitiveProjection({ submittedPlayerIds: ["unknown-player"] }),
      ),
    ).toThrow();
  });

  test("team active slot과 승인되지 않은 species/move 및 HP/PP 범위를 거부한다", () => {
    const invalidActive = structuredClone(createCompetitiveProjection());
    invalidActive.currentState.playersById["player-a"].activeSlotIndex = 5;
    expect(() => parseCompetitiveProjection(invalidActive)).toThrow();

    const invalidTeamSize = structuredClone(createCompetitiveProjection());
    invalidTeamSize.currentState.playersById["player-a"].team.splice(0);
    expect(() => parseCompetitiveProjection(invalidTeamSize)).toThrow();

    const invalidSpecies = structuredClone(createCompetitiveProjection());
    invalidSpecies.currentState.playersById["player-a"].team[0].speciesId = "unknown" as never;
    expect(() => parseCompetitiveProjection(invalidSpecies)).toThrow();

    const invalidMove = structuredClone(createCompetitiveProjection());
    invalidMove.currentState.playersById["player-a"].team[0].moves[0].moveId = "unknown" as never;
    expect(() => parseCompetitiveProjection(invalidMove)).toThrow();

    const invalidHp = structuredClone(createCompetitiveProjection());
    invalidHp.currentState.playersById["player-a"].team[0].currentHp = 121;
    expect(() => parseCompetitiveProjection(invalidHp)).toThrow();

    const invalidPp = structuredClone(createCompetitiveProjection());
    invalidPp.currentState.playersById["player-a"].team[0].moves[0].pp = 100;
    expect(() => parseCompetitiveProjection(invalidPp)).toThrow();
  });

  test("playersById prototype key와 terminal 참가자/점수 위조를 거부한다", () => {
    const prototypeKey = structuredClone(createCompetitiveProjection());
    Object.defineProperty(prototypeKey.currentState.playersById, "__proto__", {
      value: prototypeKey.currentState.playersById["player-a"],
      enumerable: true,
    });
    expect(() => parseCompetitiveProjection(prototypeKey)).toThrow();

    const invalidTerminal = structuredClone(createCompetitiveProjection());
    invalidTerminal.status = "completed";
    invalidTerminal.terminal = {
      winnerPlayerId: "player-a",
      loserPlayerId: "unknown-player",
      reason: "faint",
      scoreByPlayerId: { "player-a": 100, "unknown-player": 50 },
    };
    invalidTerminal.currentState.terminal = invalidTerminal.terminal;
    expect(() => parseCompetitiveProjection(invalidTerminal)).toThrow();

    const scorePrototypeKey = structuredClone(createCompetitiveProjection());
    const validTerminal = {
      winnerPlayerId: "player-a",
      loserPlayerId: "player-b",
      reason: "faint" as const,
      scoreByPlayerId: { "player-a": 100 as const, "player-b": 50 as const },
    };
    Object.defineProperty(validTerminal.scoreByPlayerId, "__proto__", {
      value: 100,
      enumerable: true,
    });
    scorePrototypeKey.status = "completed";
    scorePrototypeKey.terminal = validTerminal;
    scorePrototypeKey.currentState.terminal = validTerminal;
    expect(() => parseCompetitiveProjection(scorePrototypeKey)).toThrow();
  });

  test("oversized record는 key 정렬 전에 거부한다", () => {
    const oversized = createCompetitiveProjection() as unknown as Record<string, unknown>;
    for (let index = 0; index < 100; index += 1) {
      oversized[`unexpected-${index}`] = index;
    }
    const originalSort = Array.prototype.sort;
    let sortCalls = 0;
    Array.prototype.sort = function <T>(this: T[], compareFn?: (left: T, right: T) => number): T[] {
      sortCalls += 1;
      return originalSort.call(this, compareFn);
    };

    try {
      expect(() => parseCompetitiveProjection(oversized)).toThrow();
    } finally {
      Array.prototype.sort = originalSort;
    }

    expect(sortCalls).toBe(0);
  });
});

test.describe("Poke Lounge competitive battle launch cache", () => {
  test("intro 도중 도착한 최신 turn projection을 launch 시점에 반환한다", () => {
    const cache = createCompetitiveBattleLaunchCache();
    const initial = createCompetitiveProjection();
    const latest = {
      ...initial,
      currentTurn: 4,
      currentState: { ...initial.currentState, turn: 4 },
    };

    expect(cache.begin({ projection: initial, ownPlayerId: "player-a" })).toBe(true);
    cache.update({ projection: latest, ownPlayerId: "player-a" });

    expect(cache.get(initial.matchId, initial.assignmentRevision)?.projection.currentTurn).toBe(4);
  });

  test("intro 도중 terminal projection이 오면 interactive command 상태를 열지 않는다", () => {
    const cache = createCompetitiveBattleLaunchCache();
    const initial = createCompetitiveProjection();
    const terminal = {
      winnerPlayerId: "player-b",
      loserPlayerId: "player-a",
      reason: "faint" as const,
      scoreByPlayerId: { "player-a": 50 as const, "player-b": 100 as const },
    };
    const completed = {
      ...initial,
      status: "completed" as const,
      terminal,
      currentState: { ...initial.currentState, terminal },
    };

    cache.begin({ projection: initial, ownPlayerId: "player-a" });
    cache.update({ projection: completed, ownPlayerId: "player-a" });
    cache.update({ projection: initial, ownPlayerId: "player-a" });
    const launch = cache.get(initial.matchId, initial.assignmentRevision);

    expect(launch).not.toBeNull();
    expect(toAuthoritativeBattleState(launch!.projection, launch!.ownPlayerId).phase).toBe("ended");
  });
});

test.describe("Poke Lounge server multiplayer", () => {
  test("authenticated server room은 메모리 ID token으로 competitive seat를 연결하고 저장하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    const authSession = await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, { competitive: true, waitForResult: true, wrapped: true });
    await startServerRoom(page);

    expect(authSession.requestCount()).toBeGreaterThan(0);
    await expect.poll(() => Promise.resolve(server.competitiveSeatBodies.length)).toBe(1);
    expect(server.competitiveSeatBodies[0]).toEqual({
      sessionId: server.joinedParticipants[0]?.sessionId,
    });
    expect(server.competitiveAuthHeaders).toEqual([`Bearer ${AUTH_ID_TOKEN}`]);

    const storedValues = await page.evaluate(() => [
      ...Object.values(sessionStorage),
      ...Object.values(localStorage),
    ]);
    expect(storedValues).not.toContain(AUTH_ID_TOKEN);
  });

  test("competitive seat가 ineligible이면 server room은 casual world로 계속된다", async ({
    page,
  }) => {
    const server = createMockServerState();

    const authSession = await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitiveSeatIneligible: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);

    expect(authSession.requestCount()).toBeGreaterThan(0);
    await expect.poll(() => Promise.resolve(server.competitiveSeatBodies.length)).toBe(1);
    expect(await getActiveSceneKey(page)).toBe("world");
    await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible();
  });

  test("malformed competitive seat projection은 battle로 열지 않고 REST recovery한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      malformedCompetitiveSeat: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);

    await expect.poll(() => Promise.resolve(server.competitiveSeatBodies.length)).toBe(1);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.filter(call => call === `GET /poke-lounge/rooms/${ROOM_CODE}`).length,
        ),
      )
      .toBeGreaterThanOrEqual(3);
    expect(await getActiveSceneKey(page)).toBe("world");
  });

  test("competitive assignment는 host 여부와 무관하게 authoritative battle을 시작한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);

    await waitForActiveScene(page, "battle");
    expect(await getBattleSnapshot(page)).toMatchObject({
      battleEntrancePlaying: true,
      message: copy.mobile.preparing,
    });
    await waitForBattleReady(page);
    expect(await getBattleSnapshot(page)).toMatchObject({
      battleKind: "trainer",
      phase: "command",
      message: null,
      turn: 3,
    });
  });

  test("authoritative action은 서버 응답 전 전송 중이고 접수 후 상대 대기로 전환한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveActionResponseDeferred: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(1);
    expect(await getBattleSnapshot(page)).toMatchObject({
      phase: "resolving",
      message: copy.mobile.actionSending,
    });

    server.resolveCompetitiveActionResponse?.();
    await expect
      .poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.message))
      .toBe(copy.mobile.waiting);
  });

  test("authoritative battle은 연결 중단부터 projection 복구까지 안내하고 입력을 잠근다", async ({
    browser,
  }) => {
    const server = createMockServerState();
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await disconnectSocket(page);
    await expect
      .poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.message))
      .toBe(copy.mobile.connectionRecovering);

    const recoveryDeck = page.locator("[data-poke-lounge-mobile-deck='battle-message']");
    if (await recoveryDeck.isVisible()) {
      const [gamePageBounds, fieldBounds, recoveryDeckBounds] = await Promise.all([
        page.locator("[data-testid='poke-lounge-page']").boundingBox(),
        page.locator("[data-poke-lounge-mobile-screen='top']").boundingBox(),
        recoveryDeck.boundingBox(),
      ]);

      expect(gamePageBounds).not.toBeNull();
      expect(fieldBounds).not.toBeNull();
      expect(recoveryDeckBounds).not.toBeNull();
      expect(recoveryDeckBounds!.y).toBeGreaterThanOrEqual(
        fieldBounds!.y + fieldBounds!.height - 1,
      );
      expect(recoveryDeckBounds!.x).toBeGreaterThanOrEqual(gamePageBounds!.x - 1);
      expect(recoveryDeckBounds!.x + recoveryDeckBounds!.width).toBeLessThanOrEqual(
        gamePageBounds!.x + gamePageBounds!.width + 1,
      );
      expect(recoveryDeckBounds!.y + recoveryDeckBounds!.height).toBeLessThanOrEqual(
        gamePageBounds!.y + gamePageBounds!.height + 1,
      );
    }

    await reconnectSocket(page);
    server.revision += 1;
    await emitSocketSnapshot(page, {
      ...createTournamentRoomState(server),
      competitive: createServerCompetitiveProjection(server),
    });
    await expect
      .poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.phase))
      .toBe("command");
    expect((await getBattleSnapshot(page))?.message).toBeNull();
    await context.close();
  });

  test("assignment 생성 알림은 야생전 참가자와 신규 참가자 모두 같은 battle을 시작한다", async ({
    browser,
  }) => {
    const server = createMockServerState();
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await mockAuthenticatedPokeSession(hostPage);
    await mockAuthenticatedPokeSession(guestPage);
    await mockServerRoom(hostPage, server, {
      competitive: true,
      waitForResult: true,
      wrapped: true,
    });
    await mockServerRoom(guestPage, server, {
      competitive: true,
      waitForResult: true,
      wrapped: true,
    });

    await startServerRoom(
      hostPage,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=host-player&serverSessionId=host-session&e2e=1`,
    );
    await expect.poll(() => Promise.resolve(server.competitiveSeatBodies.length)).toBe(1);
    expect(await getActiveSceneKey(hostPage)).toBe("world");
    await hostPage.evaluate(() => {
      (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.startWildBattleForTest({
        encounter: {
          mapKey: "town",
          step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
          speciesId: 19,
          name: "꼬렛",
          level: 5,
        },
        x: 656,
        y: 446,
        facing: "front",
      });
    });
    await waitForActiveScene(hostPage, "battle");
    expect((await getBattleSnapshot(hostPage))?.battleKind).toBe("wild");

    await startServerRoom(
      guestPage,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=guest-player&serverSessionId=guest-session&e2e=1`,
    );
    await waitForActiveScene(guestPage, "battle");

    const projection = createServerCompetitiveProjection(server);
    server.revision += 1;
    await emitSocketSnapshot(hostPage, {
      ...createTournamentRoomState(server),
      competitive: projection,
    });

    await waitForActiveScene(hostPage, "battle");
    await waitForBattleReady(hostPage);
    expect((await getBattleSnapshot(hostPage))?.turn).toBe(
      (await getBattleSnapshot(guestPage))?.turn,
    );

    const surface = hostPage.locator('#game-root[data-poke-lounge-game-surface="ready"]');
    await surface.focus();
    await hostPage.keyboard.press("Enter");
    await expect
      .poll(() => getBattleSnapshot(hostPage).then(snapshot => snapshot?.phase))
      .toBe("move-select");
    await hostPage.keyboard.press("Enter");
    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(1);

    await hostContext.close();
    await guestContext.close();
  });

  test("authoritative move는 UUIDv4 command로 한 번만 제출하고 waiting으로 전환한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(1);
    expect(server.competitiveActionBodies[0]).toMatchObject({
      assignmentRevision: 7,
      turn: 3,
      action: { kind: "move", moveId: 86 },
    });
    expect(server.competitiveActionBodies[0]?.clientCommandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(server.competitiveActionAuthHeaders).toEqual([`Bearer ${AUTH_ID_TOKEN}`]);
    await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("resolving");
    expect((await getBattleSnapshot(page))?.message).toBe(copy.mobile.waiting);
  });

  test("authoritative action 400 응답 후 fresh projection에서 입력을 다시 허용한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveActionRejected: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(1);
    await expect
      .poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.phase))
      .toBe("command");

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);
    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(2);
  });

  test("authoritative switch는 선택한 slot만 제출한다", async ({ page }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await setBattleCommand(page, "pokemon");
    await confirmBattle(page);
    await setBattlePartySlot(page, 3);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(1);
    expect(server.competitiveActionBodies[0]?.action).toEqual({ kind: "switch", slotIndex: 3 });
  });

  test("authoritative switch는 HP 0 슬롯을 제출하지 않는다", async ({ page }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveFaintedSwitchSlot: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await setBattleCommand(page, "pokemon");
    await confirmBattle(page);
    await setBattlePartySlot(page, 0);
    await confirmBattle(page);
    await page.waitForTimeout(300);

    expect(server.competitiveActionBodies).toEqual([]);
    expect(await getBattleSnapshot(page)).toMatchObject({
      phase: "party-select",
      message: null,
      selectedPartySlotIndex: 0,
    });
  });

  test("reconnect projection의 submittedPlayerIds는 자신의 waiting 상태를 복원한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      competitivePendingImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(
      page,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=reconnect-player&serverSessionId=reconnect-session&e2e=1`,
    );

    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);
    await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("resolving");
    expect((await getBattleSnapshot(page))?.message).toBe(copy.mobile.waiting);
  });

  test("competitive action network retry는 같은 UUID command를 재사용한다", async ({ page }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveActionNetworkFailure: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);
    await confirmBattle(page);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(2);
    expect(server.competitiveActionBodies[1]).toEqual(server.competitiveActionBodies[0]);
  });

  test("competitive action transport가 두 번 실패하면 REST 복구 후 새 UUID 재입력을 허용한다", async ({
    page,
  }) => {
    const server = createMockServerState();
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveActionNetworkFailureCount: 2,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);

    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(2);
    expect(server.competitiveActionBodies[1]?.clientCommandId).toBe(
      server.competitiveActionBodies[0]?.clientCommandId,
    );
    await expect.poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.turn)).toBe(4);
    await expect
      .poll(() => getBattleSnapshot(page).then(snapshot => snapshot?.phase))
      .toBe("command");

    await confirmBattle(page);
    await setBattleMoveIndex(page, 1);
    await confirmBattle(page);
    await expect.poll(() => Promise.resolve(server.competitiveActionBodies.length)).toBe(3);
    expect(server.competitiveActionBodies[2]?.clientCommandId).not.toBe(
      server.competitiveActionBodies[0]?.clientCommandId,
    );
    expect(pageErrors).toEqual([]);
  });

  test("stale turn 409는 REST snapshot으로 resync하고 로컬 결과를 만들지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveActionStaleConflict: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");
    await waitForBattleReady(page);
    await confirmBattle(page);
    await confirmBattle(page);

    await expect.poll(() => getBattleSnapshot(page).then(value => value?.turn)).toBe(4);
    await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("command");
    expect(server.calls).toContain(`GET /poke-lounge/rooms/${ROOM_CODE}`);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/result`);
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
  });

  test("authoritative terminal은 서버 winner/loser만 렌더하고 score API를 호출하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();
    const scoreRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/game/result") scoreRequests.push(request.url());
    });

    await mockAuthenticatedPokeSession(page);
    await mockServerRoom(page, server, {
      competitive: true,
      competitiveImmediately: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await waitForActiveScene(page, "battle");

    const projection = createServerCompetitiveProjection(server);
    const [winner, loser] = projection.playerIds;
    const terminal = {
      winnerPlayerId: winner,
      loserPlayerId: loser,
      reason: "faint" as const,
      scoreByPlayerId: { [winner]: 100 as const, [loser]: 50 as const },
    };
    const terminalRevision = server.revision + 1;
    const completedProjection = {
      ...projection,
      currentTurn: projection.currentTurn + 1,
      status: "completed" as const,
      currentState: {
        ...projection.currentState,
        turn: projection.currentTurn + 1,
        terminal,
      },
      terminal,
      terminalEventId: `terminal-authoritative-${terminalRevision}`,
      terminalRoomRevision: terminalRevision,
    };
    server.revision = terminalRevision;
    await emitSocketSnapshot(page, {
      ...createCompletedRoomStateForWinner(server, winner),
      competitiveTransitions: [
        {
          terminalEventId: completedProjection.terminalEventId,
          terminalRoomRevision: completedProjection.terminalRoomRevision,
          projection: completedProjection,
        },
      ],
    });

    await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("ended");
    expect((await getBattleSnapshot(page))?.result).toEqual({
      winnerPlayerId: winner,
      loserPlayerId: loser,
      reason: "faint",
    });
    expect((await getBattleSnapshot(page))?.message).toBe("승리했습니다.");
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
    expect(scoreRequests).toEqual([]);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/result`);
  });

  for (const role of ["winner", "loser"] as const) {
    test(`terminal transition ${role}는 결과 확인 후 WorldScene으로 돌아간다`, async ({ page }) => {
      const server = createMockServerState();

      await mockAuthenticatedPokeSession(page);
      await mockServerRoom(page, server, {
        competitive: true,
        competitiveImmediately: true,
        waitForResult: true,
        wrapped: true,
      });
      await startServerRoom(page);
      await waitForActiveScene(page, "battle");

      const projection = createServerCompetitiveProjection(server);
      const ownPlayerId = projection.playerIds[0];
      const opponentPlayerId = projection.playerIds[1];
      const winnerPlayerId = role === "winner" ? ownPlayerId : opponentPlayerId;
      const loserPlayerId = role === "winner" ? opponentPlayerId : ownPlayerId;
      const terminal = {
        winnerPlayerId,
        loserPlayerId,
        reason: "faint" as const,
        scoreByPlayerId: { [winnerPlayerId]: 100 as const, [loserPlayerId]: 50 as const },
      };
      const terminalRevision = server.revision + 1;
      const completedProjection = {
        ...projection,
        currentTurn: projection.currentTurn + 1,
        submittedPlayerIds: [...projection.playerIds],
        status: "completed" as const,
        currentState: {
          ...projection.currentState,
          turn: projection.currentTurn + 1,
          terminal,
        },
        terminal,
        terminalEventId: `terminal-${role}-${terminalRevision}`,
        terminalRoomRevision: terminalRevision,
      };
      server.revision = terminalRevision;

      await emitSocketSnapshot(page, {
        ...createCompletedRoomStateForWinner(server, winnerPlayerId),
        competitiveTransitions: [
          {
            terminalEventId: completedProjection.terminalEventId,
            terminalRoomRevision: completedProjection.terminalRoomRevision,
            projection: completedProjection,
          },
        ],
      });

      await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("ended");
      expect((await getBattleSnapshot(page))?.battleEntrancePlaying).toBe(false);
      expect((await getBattleSnapshot(page))?.authoritativeInputPending).toBe(false);
      expect((await getBattleSnapshot(page))?.result).toMatchObject({
        winnerPlayerId,
        loserPlayerId,
      });

      await confirmBattle(page);
      await waitForActiveScene(page, "world");
    });
  }

  for (const role of ["winner", "loser"] as const) {
    test(`next assignment ${role}는 이전 결과 확인 후 올바른 scene에 남는다`, async ({ page }) => {
      const server = createMockServerState();

      await mockAuthenticatedPokeSession(page);
      await mockServerRoom(page, server, {
        competitive: true,
        competitiveImmediately: true,
        waitForResult: true,
        wrapped: true,
      });
      await startServerRoom(page);
      await waitForActiveScene(page, "battle");

      const fixture = createNextAssignmentRoomState(server, role);
      await emitSocketSnapshot(page, fixture.room);

      await expect.poll(() => getBattleSnapshot(page).then(value => value?.phase)).toBe("ended");
      await trackWorldBattleStarts(page);
      await confirmBattle(page);

      if (role === "winner") {
        await expect
          .poll(() => getAuthoritativeBattleMatchId(page), { timeout: 30000 })
          .toBe(fixture.nextMatchId);
        await expect
          .poll(() => getTrackedWorldBattleStarts(page), { timeout: 30000 })
          .toEqual([fixture.nextMatchId]);

        await emitSocketSnapshot(page, fixture.room);
        await page.waitForTimeout(250);
        expect(await getTrackedWorldBattleStarts(page)).toEqual([fixture.nextMatchId]);
        return;
      }

      await waitForActiveScene(page, "world");
      await page.waitForTimeout(250);
      expect(await getTrackedWorldBattleStarts(page)).toEqual([]);
    });
  }

  test("network=server room 완료 상태는 generic score overlay를 노출하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { wrapped: true });
    await startServerRoom(page);

    await expect
      .poll(() => getRoomSnapshot(page).then(snapshot => snapshot?.roomId ?? null), {
        timeout: 30000,
      })
      .toBe(ROOM_CODE);
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/result`);

    expect(server.calls).toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/join`);
    await expect
      .poll(
        () =>
          Promise.resolve(
            server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
  });

  test("완료 방 새로고침은 mutation 없이 canonical GET으로 결과를 복구한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { wrapped: true });
    await startServerRoom(page);
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    await expect
      .poll(
        () =>
          Promise.resolve(
            server.calls.filter(
              call => call === `POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`,
            ).length,
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(1);

    const postCountBeforeReload = server.calls.filter(call => call.startsWith("POST ")).length;
    const getCountBeforeReload = server.calls.filter(call => call.startsWith("GET ")).length;

    await page.reload();

    await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
      timeout: 30000,
    });
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    expect(server.calls.filter(call => call.startsWith("POST "))).toHaveLength(
      postCountBeforeReload,
    );
    expect(server.calls.filter(call => call.startsWith("GET ")).length).toBeGreaterThan(
      getCountBeforeReload,
    );
  });

  test("server room이 completed 전이면 GET polling으로 최신 상태를 반영한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { completeOnGet: true, wrapped: true });
    await startServerRoom(page);

    await expect
      .poll(() => Promise.resolve(server.recoveryAfterRevisions.length), { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
  });

  test("newer socket revision은 지연된 stale REST recovery보다 우선한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      deferRecoveryGet: true,
      recoveryGetRevision: 99,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect.poll(() => getSocketState(page).then(state => state.createdCount)).toBe(1);
    await expect.poll(() => Promise.resolve(server.recoveryAfterRevisions.length)).toBe(1);

    server.revision = 100;
    await emitSocketSnapshot(page, createCompletedRoomState(server));
    server.resolveRecoveryGet?.();
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
    await expect.poll(() => getServerProjectionRevision(page)).toBe(100);
  });

  test("disconnect와 reconnect는 한 socket에서 REST recovery와 재구독을 수행한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(page);
    await expect.poll(() => getSocketState(page).then(state => state.subscriptions.length)).toBe(1);
    const terminalCursorBeforeDisconnect = (await getSocketState(page)).subscriptions.at(
      -1,
    )?.afterRevision;

    await emitSocketSnapshot(page, createTournamentRoomState(server));
    const recoveryBeforeDisconnect = server.recoveryAfterRevisions.length;
    await disconnectSocket(page);
    await expect
      .poll(() => Promise.resolve(server.recoveryAfterRevisions.length), { timeout: 3000 })
      .toBeGreaterThan(recoveryBeforeDisconnect);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/leave`);

    await reconnectSocket(page);
    await expect.poll(() => getSocketState(page).then(state => state.subscriptions.length)).toBe(2);
    await expect.poll(() => getSocketState(page).then(state => state.createdCount)).toBe(1);
    expect((await getSocketState(page)).subscriptions.at(-1)?.afterRevision).toBe(
      terminalCursorBeforeDisconnect,
    );

    server.revision += 1;
    await emitSocketSnapshot(page, createTournamentRoomState(server));
    const recoveryAfterSubscribedSnapshot = server.recoveryAfterRevisions.length;
    await page.waitForTimeout(750);
    expect(server.recoveryAfterRevisions).toHaveLength(recoveryAfterSubscribedSnapshot);
  });

  test("준비 중 야생전에 진입해도 멀티플레이 연결을 유지한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(page);
    await expect.poll(() => getConnectionStatus(page)).toBe("online");

    await page.evaluate(() => {
      (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.startWildBattleForTest({
        encounter: {
          mapKey: "town",
          step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
          speciesId: 19,
          name: "꼬렛",
          level: 5,
        },
        x: 656,
        y: 446,
        facing: "front",
      });
    });

    await waitForActiveScene(page, "battle");
    expect(await getConnectionStatus(page)).toBe("online");
    expect((await getSocketState(page)).connected).toBe(true);
  });

  test("최초 connect_error는 capped REST recovery를 시작하고 dispose 후 정리된다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      socketAutoConnect: false,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect.poll(() => getSocketState(page).then(state => state.createdCount)).toBe(1);
    const recoveryBeforeError = server.recoveryAfterRevisions.length;

    await emitSocketConnectError(page);
    await expect
      .poll(() => Promise.resolve(server.recoveryAfterRevisions.length), { timeout: 3000 })
      .toBeGreaterThan(recoveryBeforeError);

    await disposeServerRoom(page);
    const recoveryAfterDispose = server.recoveryAfterRevisions.length;
    await emitSocketConnectError(page);
    await page.waitForTimeout(750);
    expect(server.recoveryAfterRevisions).toHaveLength(recoveryAfterDispose);
  });

  test("subscription 실패 recovery는 유효한 snapshot에서 timer를 정리한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(page);
    await expect.poll(() => getSocketState(page).then(state => state.connected)).toBe(true);
    const recoveryBeforeFailure = server.recoveryAfterRevisions.length;
    const subscriptionsBeforeFailure = (await getSocketState(page)).subscriptions.length;

    await emitSocketSubscriptionError(page);
    await expect.poll(() => getConnectionStatus(page)).toBe("connecting");
    await expect
      .poll(() => Promise.resolve(server.recoveryAfterRevisions.length), { timeout: 3000 })
      .toBeGreaterThan(recoveryBeforeFailure);
    await expect
      .poll(() => getSocketState(page).then(state => state.subscriptions.length), { timeout: 3000 })
      .toBeGreaterThan(subscriptionsBeforeFailure);
    await emitSocketSnapshot(page, createTournamentRoomState(server));
    await expect.poll(() => getConnectionStatus(page)).toBe("online");
    await page.waitForTimeout(300);
    const recoveryAfterSnapshot = server.recoveryAfterRevisions.length;
    await page.waitForTimeout(750);

    expect(server.recoveryAfterRevisions).toHaveLength(recoveryAfterSnapshot);
  });

  test("cursor regression은 stale identity를 종료하고 fresh server room entry로 전환한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      deferLeaveResponse: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(
      page,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=stale-player&serverSessionId=stale-session&e2e=1`,
    );
    await expect.poll(() => getSocketState(page).then(state => state.connected)).toBe(true);
    server.revision = 20;
    await emitSocketSnapshot(page, createCompletedRoomState(server));
    await emitSocketRevisionConflict(page, {
      ...createTournamentRoomState(server),
      revision: 19,
    });

    await expect.poll(() => getSocketState(page).then(state => state.connected)).toBe(false);
    await expect
      .poll(() => getSocketState(page).then(state => state.transportErrors.join("\n")))
      .toContain("fresh room session");
    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();
    expect(server.leaveRequestDeferred).toBe(true);
    await expect
      .poll(() =>
        Promise.resolve(server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/leave`)),
      )
      .toBe(true);

    const url = new URL(page.url());
    expect(url.searchParams.has("network")).toBe(false);
    expect(url.searchParams.has("room")).toBe(false);
    expect(url.searchParams.has("serverPlayerId")).toBe(false);
    expect(url.searchParams.has("serverSessionId")).toBe(false);
    server.resolveLeaveResponse?.();

    const recoveryAfterConflict = server.recoveryAfterRevisions.length;
    const subscriptionsAfterConflict = (await getSocketState(page)).subscriptions.length;
    await page.waitForTimeout(750);
    expect(server.recoveryAfterRevisions).toHaveLength(recoveryAfterConflict);
    expect((await getSocketState(page)).subscriptions).toHaveLength(subscriptionsAfterConflict);

    await startServerRoom(page, createServerRoomUrl());
    await expect.poll(() => Promise.resolve(server.joinedParticipants.length)).toBeGreaterThan(1);
    expect(server.joinedParticipants.at(-1)).not.toMatchObject({
      playerId: "stale-player",
      sessionId: "stale-session",
    });
  });

  test("cursor regression leave reject는 fresh 전환을 막거나 rejection을 누수하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await mockServerRoom(page, server, {
      rejectLeave: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect.poll(() => getSocketState(page).then(state => state.connected)).toBe(true);
    server.revision = 20;
    await emitSocketSnapshot(page, createCompletedRoomState(server));
    await emitSocketRevisionConflict(page, {
      ...createTournamentRoomState(server),
      revision: 19,
    });

    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();
    const recoveryAfterTransition = server.recoveryAfterRevisions.length;
    await page.waitForTimeout(750);

    expect(pageErrors).toEqual([]);
    expect(server.recoveryAfterRevisions).toHaveLength(recoveryAfterTransition);
  });

  test("response body stream read failure는 동일 command를 한 번만 재시도한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      bodyReadFailureSuffix: "/party-snapshot",
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect
      .poll(() =>
        Promise.resolve(
          server.commandRequests.filter(request => request.suffix === "/party-snapshot").length,
        ),
      )
      .toBe(2);
    const [first, retry] = server.commandRequests.filter(
      request => request.suffix === "/party-snapshot",
    );

    expect(retry).toEqual(first);
  });

  for (const responseFailure of ["json", "schema"] as const) {
    test(`성공 응답 ${responseFailure} 처리 오류는 mutation을 재시도하지 않는다`, async ({
      page,
    }) => {
      const server = createMockServerState();

      await mockServerRoom(page, server, {
        malformedSuccessSuffix: "/party-snapshot",
        malformedSuccessType: responseFailure,
        waitForResult: true,
        wrapped: true,
      });
      await startServerRoom(page);
      await expect
        .poll(() =>
          Promise.resolve(
            server.commandRequests.filter(request => request.suffix === "/party-snapshot").length,
          ),
        )
        .toBe(1);
      await page.waitForTimeout(500);

      expect(
        server.commandRequests.filter(request => request.suffix === "/party-snapshot"),
      ).toHaveLength(1);
    });
  }

  test("server room은 client-asserted tournament result 이벤트를 무시한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { rejectResult: true });
    await startServerRoom(page);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);

    await page.evaluate((matchId: string) => {
      window.dispatchEvent(
        new CustomEvent("poke-lounge:e2e-server-result", {
          detail: {
            matchId,
            winnerPlayerId: "player-1",
            loserPlayerId: "player-2",
            reason: "faint",
          },
        }),
      );
    }, BRACKET_MATCH_ID);

    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden({ timeout: 3000 });
    await expect
      .poll(() => getRoundPhase(page), {
        timeout: 3000,
      })
      .not.toBe("game-result");
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/result`);
  });

  test("server room은 로컬 player id를 legacy result payload로 변환하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(
      page,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=server-player-alpha&serverSessionId=server-session-alpha&e2e=1`,
    );
    await expect
      .poll(() => Promise.resolve(server.joinedParticipants.length), { timeout: 30000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);

    const localPlayerId = await getCurrentPlayerId(page);
    const [joinedParticipant] = server.joinedParticipants;

    expect(joinedParticipant).toMatchObject({
      playerId: "server-player-alpha",
      sessionId: "server-session-alpha",
    });
    expect(localPlayerId).not.toBe(joinedParticipant.playerId);

    await page.evaluate(
      ({ matchId, winnerPlayerId }: { matchId: string; winnerPlayerId: string }) => {
        window.dispatchEvent(
          new CustomEvent("poke-lounge:e2e-server-result", {
            detail: {
              matchId,
              winnerPlayerId,
              reason: "faint",
            },
          }),
        );
      },
      { matchId: BRACKET_MATCH_ID, winnerPlayerId: localPlayerId ?? "player-1" },
    );

    await page.waitForTimeout(300);
    expect(server.resultBodies).toEqual([]);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/result`);
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
  });

  test("명시적인 server room 나가기는 확인 뒤 leave를 한 번 전송한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      deferLeaveResponse: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);
    const firstIdentity = server.joinedParticipants.at(-1);
    if (!firstIdentity) {
      throw new Error("Expected the first server room identity");
    }

    await page.locator("[data-poke-lounge-desktop-settings-toggle='true']").click();
    await page.locator("[data-poke-lounge-game-exit='true']").click();
    await expect(page.locator("[data-poke-lounge-game-exit-dialog='true']")).toHaveCount(0);
    const leaveDialog = page.locator("[data-poke-lounge-leave-dialog='true']");
    await expect(leaveDialog).toBeVisible();
    await leaveDialog.getByRole("button", { name: "방 나가기", exact: true }).click();

    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.filter(call => call === `POST /poke-lounge/rooms/${ROOM_CODE}/leave`).length,
        ),
      )
      .toBe(1);
    await expect.poll(() => Promise.resolve(server.leaveRequestDeferred)).toBe(true);
    await expect(page.locator("[data-room-entry-screen='true']")).toHaveCount(0);

    server.resolveLeaveResponse?.();
    await expect.poll(() => Promise.resolve(server.activeMutations)).toBe(0);
    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible();

    const joinedCountBeforeRejoin = server.joinedParticipants.length;
    await startServerRoom(page, joinServerRoomUrl());
    await expect
      .poll(() => Promise.resolve(server.joinedParticipants.length))
      .toBeGreaterThan(joinedCountBeforeRejoin);
    const rejoinedIdentity = server.joinedParticipants.at(-1);
    if (!rejoinedIdentity) {
      throw new Error("Expected a new server room identity after explicit leave");
    }
    expect(rejoinedIdentity.playerId).not.toBe(firstIdentity.playerId);
    expect(rejoinedIdentity.sessionId).not.toBe(firstIdentity.sessionId);
  });

  test("server room cleanup은 e2e global 없이도 unmount 시 leave를 전송하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(
      page,
      `/${LOCALE}/game/poke-lounge?network=server&room=${ROOM_CODE}&serverPlayerId=server-player-cleanup&serverSessionId=server-session-cleanup&e2e=1`,
    );
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);

    await page.evaluate(() => {
      delete (window as Window & { __POKE_LOUNGE_E2E__?: unknown }).__POKE_LOUNGE_E2E__;
    });

    await page.evaluate(() => {
      (
        window as Window & {
          __POKE_LOUNGE_CLEANUP_FOR_TEST__?: () => void;
        }
      ).__POKE_LOUNGE_CLEANUP_FOR_TEST__?.();
    });

    await page.waitForTimeout(750);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/leave`);
    await expect.poll(() => getSocketState(page).then(state => state.connected)).toBe(false);
  });

  test("create 응답 전 dispose는 pending 방과 실제 방 모두에 leave를 전송하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      deferCreateResponse: true,
      waitForResult: true,
      wrapped: true,
    });
    await beginServerRoom(page, createServerRoomUrl());
    await expect.poll(() => Promise.resolve(server.createRequestReceived)).toBe(true);

    await disposeServerRoom(page);
    expect(server.calls).not.toContain("POST /poke-lounge/rooms/server-pending/leave");

    server.resolveCreateResponse?.();
    await page.waitForTimeout(1000);

    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/leave`);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`);
    expect(server.calls).not.toContain(`POST /poke-lounge/rooms/${ROOM_CODE}/ready`);
    expect(server.calls).not.toContain(`GET /poke-lounge/rooms/${ROOM_CODE}`);
  });

  test("server room direct URL은 닉네임과 준비 시간을 전달하고 두 컨텍스트 identity를 분리한다", async ({
    browser,
  }) => {
    const server = createMockServerState();
    const hostPage = await newMockedPage(browser, server, {
      lobbyLifecycle: true,
      wrapped: true,
    });
    const guestPage = await newMockedPage(browser, server, {
      lobbyLifecycle: true,
      mobile: true,
      wrapped: true,
    });

    await startServerRoom(hostPage, createServerRoomUrl(600_000), "레드");
    await expectServerRoomUrl(hostPage);
    await expect
      .poll(() => getRoomSnapshot(hostPage).then(snapshot => snapshot?.roomId ?? null), {
        timeout: 30000,
      })
      .toBe(ROOM_CODE);

    await startServerRoom(guestPage, joinServerRoomUrl(), "그린");
    await expectServerRoomUrl(guestPage);
    await expect
      .poll(() => getRoomSnapshot(guestPage).then(snapshot => snapshot?.roomId ?? null), {
        timeout: 30000,
      })
      .toBe(ROOM_CODE);

    await expect.poll(() => Promise.resolve(server.joinedPlayerIds.size)).toBe(2);
    await expect.poll(() => Promise.resolve(server.joinedSessionIds.size)).toBe(2);

    const [hostSessionId, guestSessionId] = await Promise.all([
      getRoomSnapshot(hostPage).then(snapshot => snapshot?.sessionId ?? null),
      getRoomSnapshot(guestPage).then(snapshot => snapshot?.sessionId ?? null),
    ]);

    expect(hostSessionId).not.toBe(guestSessionId);
    expect(server.joinedParticipants).toHaveLength(2);
    expect(server.joinedParticipants[0]?.sessionId).not.toBe(
      server.joinedParticipants[1]?.sessionId,
    );
    expect(server.joinedParticipants[0]?.playerId).not.toBe(server.joinedParticipants[1]?.playerId);
    expect(server.joinedParticipants.map(participant => participant.displayName)).toEqual([
      "레드",
      "그린",
    ]);
    const createRequest = server.commandRequests.find(
      request => request.suffix === "/poke-lounge/rooms",
    );
    expect(createRequest).toBeDefined();
    expect(JSON.parse(createRequest?.body ?? "{}")).toMatchObject({
      displayName: "레드",
      roundDurationMs: 600_000,
    });

    const waitingRoom = createLobbyWaitingRoomState(server);
    await emitSocketSnapshot(hostPage, waitingRoom);
    await emitSocketSnapshot(guestPage, waitingRoom);
    const hostLobby = hostPage.locator("[data-room-lobby='true']");
    const guestLobby = guestPage.locator("[data-room-lobby='true']");
    await expect(hostLobby).toBeVisible();
    await expect(guestLobby).toBeVisible();
    await expect(hostLobby).toContainText("참가자 2/6");
    await expect(hostLobby).toContainText("레드");
    await expect(hostLobby).toContainText("그린");
    await expect(hostPage.locator("[data-room-lobby-start='true']")).toBeDisabled();
    await expect(guestPage.locator("[data-room-lobby-start='true']")).toHaveCount(0);
    expect(server.commandRequests.filter(request => request.suffix === "/ready")).toHaveLength(0);

    const beforeMovement = await getWorldPlayerPosition(hostPage);
    await hostPage.keyboard.down("ArrowRight");
    await hostPage.waitForTimeout(200);
    await hostPage.keyboard.up("ArrowRight");
    expect(await getWorldPlayerPosition(hostPage)).toEqual(beforeMovement);

    server.joinedParticipants.push(
      ...Array.from({ length: 4 }, (_, index) => ({
        playerId: `layout-player-${index + 3}`,
        sessionId: `layout-session-${index + 3}`,
        displayName: `Layout ${index + 3}`,
        joinedAtMs: index + 2,
      })),
    );
    server.revision += 1;
    const fullWaitingRoom = createLobbyWaitingRoomState(server);
    await emitSocketSnapshot(hostPage, fullWaitingRoom);
    await emitSocketSnapshot(guestPage, fullWaitingRoom);
    await expect(hostLobby).toContainText("참가자 6/6");
    await expect(guestLobby).toContainText("참가자 6/6");

    for (const page of [hostPage, guestPage]) {
      const participantList = page.locator("[data-room-lobby-participants='true']");
      await participantList.focus();
      await expect(participantList).toBeFocused();
      await page.keyboard.press("End");
    }

    const lobbyBounds = await Promise.all(
      [hostPage, guestPage].map(page =>
        page.locator("#game-root").evaluate(gameRoot => {
          const lobby = gameRoot.querySelector<HTMLElement>("[data-room-lobby='true']");
          const participantList = gameRoot.querySelector<HTMLElement>(
            "[data-room-lobby-participants='true']",
          );
          const lastParticipant = participantList?.querySelector<HTMLElement>("li:last-child");
          const leaveButton = gameRoot.querySelector<HTMLElement>("[data-room-leave='true']");

          return {
            rootBox: gameRoot.getBoundingClientRect(),
            lobbyBox: lobby?.getBoundingClientRect(),
            listBox: participantList?.getBoundingClientRect(),
            lastBox: lastParticipant?.getBoundingClientRect(),
            leaveBox: leaveButton?.getBoundingClientRect(),
            leaveMinHeight: leaveButton
              ? Number.parseFloat(getComputedStyle(leaveButton).minHeight)
              : null,
          };
        }),
      ),
    );
    for (const bounds of lobbyBounds) {
      expect(bounds.lobbyBox?.left).toBeGreaterThanOrEqual(bounds.rootBox.left);
      expect(bounds.lobbyBox?.right).toBeLessThanOrEqual(bounds.rootBox.right);
      expect(bounds.lobbyBox?.top).toBeGreaterThanOrEqual(bounds.rootBox.top);
      expect(bounds.lobbyBox?.bottom).toBeLessThanOrEqual(bounds.rootBox.bottom);
      expect(bounds.lastBox?.top).toBeGreaterThanOrEqual((bounds.listBox?.top ?? 0) - 1);
      expect(bounds.lastBox?.bottom).toBeLessThanOrEqual((bounds.listBox?.bottom ?? 0) + 1);
    }
    const mobileBounds = lobbyBounds[1];
    expect(mobileBounds.leaveMinHeight).toBeGreaterThanOrEqual(44);
    expect(mobileBounds.leaveBox?.right).toBeLessThanOrEqual(mobileBounds.rootBox.right);
    expect(mobileBounds.leaveBox?.top).toBeGreaterThanOrEqual(mobileBounds.rootBox.top);

    server.joinedParticipants.splice(2);
    server.revision += 1;
    const restoredWaitingRoom = createLobbyWaitingRoomState(server);
    await emitSocketSnapshot(hostPage, restoredWaitingRoom);
    await emitSocketSnapshot(guestPage, restoredWaitingRoom);

    await hostPage.locator("[data-room-lobby-ready='true']").click();
    await guestPage.locator("[data-room-lobby-ready='true']").click();
    const readyRoom = createLobbyWaitingRoomState(server);
    await emitSocketSnapshot(hostPage, readyRoom);
    await emitSocketSnapshot(guestPage, readyRoom);
    await expect(hostPage.locator("[data-room-lobby-start='true']")).toBeEnabled();
    await expect(guestLobby).toContainText("방장이 챔피언십을 시작할 때까지");

    await hostPage.locator("[data-room-lobby-start='true']").click();
    await expect(hostLobby).toBeHidden();
    await emitSocketSnapshot(guestPage, createLobbyStartedRoomState(server));
    await expect(guestLobby).toBeHidden();
    expect(server.commandRequests.filter(request => request.suffix === "/ready")).toHaveLength(2);
    expect(server.commandRequests.filter(request => request.suffix === "/start")).toHaveLength(1);

    await hostPage.context().close();
    await guestPage.context().close();
  });

  test("server room은 connect 시점과 로컬 파티 변경 시점에 party snapshot을 전송한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { lobbyLifecycle: true, wrapped: true });
    await startServerRoom(page);

    await page.evaluate(() => {
      const controller = (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__;
      controller?.sendCurrentPlayerChangedMapForTest({
        activePartySlotIndex: 0,
        party: [
          {
            slotIndex: 0,
            pokemon: {
              speciesId: 25,
              name: "Pikachu",
              level: 12,
              currentHp: 18,
              maxHp: 30,
              status: "normal",
              individualValues: {
                hp: 12,
                attack: 13,
                defense: 14,
                specialAttack: 15,
                specialDefense: 16,
                speed: 17,
              },
              moves: [{ id: 33, name: "몸통박치기", pp: 20, maxPp: 35 }],
            },
          },
        ],
      });
    });

    await expect
      .poll(
        () =>
          Promise.resolve(
            server.calls.filter(
              call => call === `POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`,
            ).length,
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(2);

    const snapshotWithPikachu = server.partySnapshotBodies.find(body =>
      body.competitiveParty?.members.some(member => member.speciesId === 25),
    );

    expect(snapshotWithPikachu).toMatchObject({
      playerId: expect.any(String),
      sessionId: expect.any(String),
      competitiveParty: {
        version: 2,
        activeSlotIndex: 0,
        members: [
          {
            slotIndex: 0,
            speciesId: 25,
            level: 12,
            currentHp: 18,
            status: "normal",
            individualValues: {
              hp: 12,
              attack: 13,
              defense: 14,
              specialAttack: 15,
              specialDefense: 16,
              speed: 17,
            },
            moves: [{ moveId: 33, pp: 20 }],
          },
        ],
      },
    });
  });

  test("수동 ready revision conflict는 최신 snapshot과 인라인 오류를 표시한다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      lobbyLifecycle: true,
      revisionConflictSuffix: "/ready",
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    const readyButton = page.locator("[data-room-lobby-ready='true']");
    await expect(readyButton).toBeVisible();
    expect(server.commandHeaders.filter(headers => headers.suffix === "/ready")).toHaveLength(0);

    await readyButton.click();

    await expect
      .poll(
        () =>
          Promise.resolve(
            server.commandHeaders.filter(headers => headers.suffix === "/ready").length,
          ),
        { timeout: 30000 },
      )
      .toBe(1);
    await expect(page.locator("[data-room-lobby-error='true']")).not.toBeEmpty();

    await readyButton.click();
    await expect
      .poll(() =>
        Promise.resolve(
          server.commandHeaders.filter(headers => headers.suffix === "/ready").length,
        ),
      )
      .toBe(2);
    await expect(page.locator("[data-room-lobby-error='true']")).toBeEmpty();

    const readyHeaders = server.commandHeaders.filter(headers => headers.suffix === "/ready");
    expect(readyHeaders).toHaveLength(2);
    expect(readyHeaders[0].revision).not.toBe(String(server.conflictRevision));
    expect(readyHeaders[1].revision).toBe(String(server.conflictRevision));
    expect(readyHeaders[1].idempotencyKey).not.toBe(readyHeaders[0].idempotencyKey);
  });

  test("stale conflict snapshot은 최신 socket revision을 덮거나 POST를 재시도하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      lobbyLifecycle: true,
      revisionConflictDelayMs: 1000,
      revisionConflictAttempt: 2,
      revisionConflictSuffix: "/party-snapshot",
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);
    await page.waitForTimeout(800);
    const partyRequestsBefore = server.commandRequests.filter(
      request => request.suffix === "/party-snapshot",
    ).length;

    await sendPartySnapshot(page);

    await expect
      .poll(
        () =>
          Promise.resolve(
            server.commandRequests.filter(request => request.suffix === "/party-snapshot").length,
          ),
        { timeout: 5000 },
      )
      .toBe(partyRequestsBefore + 1);
    server.revision += 2;
    await emitSocketSnapshot(page, createLobbyWaitingRoomState(server));
    const socketRevision = server.revision;
    await page.waitForTimeout(1200);
    await expect.poll(() => getServerProjectionRevision(page)).toBe(socketRevision);

    const [request] = server.commandRequests
      .filter(request => request.suffix === "/party-snapshot")
      .slice(-1);

    expect(request).toMatchObject({
      method: "POST",
    });
    expect(Number(request.revision)).toBeLessThan(socketRevision);

    const commandCount = server.commandRequests.length;
    await sendPartySnapshot(page);
    await expect
      .poll(() => Promise.resolve(server.commandRequests.length))
      .toBeGreaterThan(commandCount);
    expect(server.commandRequests.at(-1)?.revision).toBe(String(socketRevision));
  });

  test("idempotency conflict snapshot은 적용하고 동일 command를 재시도하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      idempotencyConflictSuffix: "/ready",
      lobbyLifecycle: true,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await page.locator("[data-room-lobby-ready='true']").click();

    await expect
      .poll(() =>
        Promise.resolve(
          server.commandRequests.filter(request => request.suffix === "/ready").length,
        ),
      )
      .toBe(1);
    await expect.poll(() => getRoundPhase(page)).toBe("game-result");
    await expect(page.getByTestId("poke-lounge-result-panel")).toBeHidden();
  });

  test("room connect 재호출은 같은 identity의 join과 socket을 추가 생성하지 않는다", async ({
    page,
  }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, { waitForResult: true, wrapped: true });
    await startServerRoom(page);
    await expect
      .poll(() =>
        Promise.resolve(
          server.calls.includes(`POST /poke-lounge/rooms/${ROOM_CODE}/party-snapshot`),
        ),
      )
      .toBe(true);
    const joinCount = server.commandHeaders.filter(header => header.suffix === "/join").length;

    expect(await reconnectServerRoom(page)).toBe(true);
    await page.waitForTimeout(500);

    expect(server.commandHeaders.filter(header => header.suffix === "/join")).toHaveLength(
      joinCount,
    );
    expect((await getSocketState(page)).createdCount).toBe(1);
  });

  test("server room network 재시도는 같은 command header를 재사용한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      networkFailureSuffix: "/party-snapshot",
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);

    await expect
      .poll(
        () =>
          Promise.resolve(
            server.commandHeaders.filter(headers => headers.suffix === "/party-snapshot").length,
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(2);

    const [first, retry] = server.commandRequests.filter(
      request => request.suffix === "/party-snapshot",
    );
    expect(retry).toMatchObject({
      method: first.method,
      body: first.body,
      idempotencyKey: first.idempotencyKey,
      revision: first.revision,
    });
  });

  test("server room mutation queue는 동시에 발생한 POST를 직렬화한다", async ({ page }) => {
    const server = createMockServerState();

    await mockServerRoom(page, server, {
      mutationDelayMs: 100,
      waitForResult: true,
      wrapped: true,
    });
    await startServerRoom(page);
    await expect.poll(() => Promise.resolve(server.activeMutations), { timeout: 30000 }).toBe(0);
    const initialSnapshots = server.partySnapshotBodies.length;
    server.maxConcurrentMutations = 0;

    await page.evaluate(() => {
      const controller = (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__;
      controller?.sendCurrentPlayerChangedMapForTest();
      controller?.sendCurrentPlayerChangedMapForTest();
    });

    await expect
      .poll(() => Promise.resolve(server.partySnapshotBodies.length), { timeout: 30000 })
      .toBeGreaterThanOrEqual(initialSnapshots + 2);
    expect(server.maxConcurrentMutations).toBe(1);
  });
});

async function startServerRoom(
  page: Page,
  url = joinServerRoomUrl(),
  displayName?: string,
): Promise<void> {
  await beginServerRoom(page, url, displayName);
  await expect(page.locator('#game-root[data-poke-lounge-game-surface="ready"]')).toBeVisible({
    timeout: 30000,
  });
}

async function beginServerRoom(page: Page, url: string, displayName?: string): Promise<void> {
  await gotoWithRetry(page, url);
  await confirmDirectMultiplayerEntry(page, displayName);
  await chooseStarterIfNeeded(page);
}

function createServerRoomUrl(roundDurationMs?: number): string {
  const searchParams = new URLSearchParams({ e2e: "1", network: "server", create: "1" });
  if (roundDurationMs) {
    searchParams.set("roundMs", String(roundDurationMs));
  }

  return `/${LOCALE}/game/poke-lounge?${searchParams.toString()}`;
}

function joinServerRoomUrl(roomCode = ROOM_CODE): string {
  return `/${LOCALE}/game/poke-lounge?network=server&room=${roomCode}&e2e=1`;
}

async function confirmDirectMultiplayerEntry(page: Page, displayName?: string): Promise<void> {
  const directEntry = page.locator("[data-room-entry-direct-multiplayer='true']");
  await expect(directEntry).toBeVisible({ timeout: 30000 });

  const nameInput = page.locator("[data-room-entry-direct-multiplayer-name='true']");
  if (displayName) {
    await nameInput.fill(displayName);
  }

  await page.locator("[data-room-entry-direct-multiplayer-submit='true']").click();
}

async function chooseStarterIfNeeded(page: Page): Promise<void> {
  const starterSelection = page.locator("[data-screen='starter-selection']");
  const gameSurface = page.locator('#game-root[data-poke-lounge-game-surface="ready"]');

  await expect
    .poll(
      async () => {
        if (await starterSelection.isVisible().catch(() => false)) {
          return "starter";
        }

        if (await gameSurface.isVisible().catch(() => false)) {
          return "surface";
        }

        return null;
      },
      { timeout: 30000 },
    )
    .not.toBeNull();

  if (await starterSelection.isVisible().catch(() => false)) {
    await page.locator("[data-starter-confirm]").click();
  }
}

async function getRoomSnapshot(
  page: Page,
): Promise<{ roomId: string | null; sessionId: string | null } | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;

    return pokeWindow.__POKE_LOUNGE_E2E__?.getRoomSnapshot() ?? null;
  });
}

async function getRoundPhase(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;

    return pokeWindow.__POKE_LOUNGE_E2E__?.getGameStateSnapshot().round.phase ?? null;
  });
}

async function getServerProjectionRevision(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;

    return (
      pokeWindow.__POKE_LOUNGE_E2E__?.getGameStateSnapshot().tournament.serverProjection
        ?.revision ?? null
    );
  });
}

async function getWorldPlayerPosition(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const player = (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.getWorldSnapshot()?.player;

    return player ? { x: player.x, y: player.y } : null;
  });
}

async function getActiveSceneKey(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (
        window as Window & { __POKE_LOUNGE_E2E__?: { getActiveSceneKey(): string | null } }
      ).__POKE_LOUNGE_E2E__?.getActiveSceneKey() ?? null,
  );
}

async function getAuthoritativeBattleMatchId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.getBattleSnapshot()?.competitive?.matchId ??
      null,
  );
}

async function trackWorldBattleStarts(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.beginWorldBattleLaunchTracking();
  });
}

async function getTrackedWorldBattleStarts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    ((window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.getWorldBattleLaunches() ?? []).map(
      launch => launch.matchId,
    ),
  );
}

async function waitForActiveScene(page: Page, sceneKey: string): Promise<void> {
  await expect.poll(() => getActiveSceneKey(page), { timeout: 30000 }).toBe(sceneKey);
}

async function getBattleSnapshot(page: Page): Promise<{
  phase: string;
  message: string | null;
  battleKind: string;
  battleEntrancePlaying: boolean;
  authoritativeInputPending: boolean;
  result: { winnerPlayerId: string; loserPlayerId: string; reason: string } | null;
  turn: number;
} | null> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: {
            getBattleSnapshot(): {
              phase: string;
              message: string | null;
              battleKind: string;
              battleEntrancePlaying: boolean;
              authoritativeInputPending: boolean;
              result: { winnerPlayerId: string; loserPlayerId: string; reason: string } | null;
              turn: number;
            } | null;
          };
        }
      ).__POKE_LOUNGE_E2E__?.getBattleSnapshot() ?? null,
  );
}

async function waitForBattleReady(page: Page): Promise<void> {
  await expect
    .poll(() => getBattleSnapshot(page).then(value => value?.battleEntrancePlaying))
    .toBe(false);
}

async function confirmBattle(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as Window & { __POKE_LOUNGE_E2E__?: { confirmBattle(): unknown } }
    ).__POKE_LOUNGE_E2E__?.confirmBattle();
  });
}

async function setBattleMoveIndex(page: Page, index: number): Promise<void> {
  await page.evaluate(value => {
    (
      window as Window & { __POKE_LOUNGE_E2E__?: { setBattleMoveIndex(index: number): unknown } }
    ).__POKE_LOUNGE_E2E__?.setBattleMoveIndex(value);
  }, index);
}

async function setBattleCommand(page: Page, command: "pokemon"): Promise<void> {
  await page.evaluate(value => {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setBattleCommand(command: "pokemon"): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setBattleCommand(value);
  }, command);
}

async function setBattlePartySlot(page: Page, slotIndex: number): Promise<void> {
  await page.evaluate(value => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.setBattlePartySlotIndex(value);
  }, slotIndex);
}

async function getCurrentPlayerId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;

    return pokeWindow.__POKE_LOUNGE_E2E__?.getGameStateSnapshot().currentPlayerId ?? null;
  });
}

async function getConnectionStatus(
  page: Page,
): Promise<"offline" | "connecting" | "online" | null> {
  return page.evaluate(() => {
    const pokeWindow = window as PokeLoungeWindow;

    return pokeWindow.__POKE_LOUNGE_E2E__?.getGameStateSnapshot().session.connectionStatus ?? null;
  });
}

async function disposeServerRoom(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.disposeRoomForTest();
  });
}

async function sendPartySnapshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.sendCurrentPlayerChangedMapForTest();
  });
}

async function reconnectServerRoom(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as PokeLoungeWindow).__POKE_LOUNGE_E2E__?.reconnectRoomForTest() ?? false,
  );
}

async function getSocketState(page: Page): Promise<{
  connected: boolean;
  createdCount: number;
  subscriptions: ReturnType<PokeLoungeSocketTestControl["subscriptions"]>;
  transportErrors: string[];
}> {
  return page.evaluate(() => {
    const control = (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__;

    return {
      connected: control?.connected() ?? false,
      createdCount: control?.createdCount() ?? 0,
      subscriptions: control?.subscriptions() ?? [],
      transportErrors: control?.transportErrors() ?? [],
    };
  });
}

async function emitSocketSnapshot(page: Page, room: unknown): Promise<void> {
  await page.evaluate(value => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.emitSnapshot(value);
  }, room);
}

async function emitSocketRevisionConflict(page: Page, room: unknown): Promise<void> {
  await page.evaluate(value => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.emitRevisionConflict(value);
  }, room);
}

async function emitSocketSubscriptionError(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.emitSubscriptionError();
  });
}

async function emitSocketConnectError(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.emitConnectError();
  });
}

async function disconnectSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.disconnect();
  });
}

async function reconnectSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as PokeLoungeWindow).__POKE_LOUNGE_SOCKET_TEST__?.reconnect();
  });
}

async function expectServerRoomUrl(page: Page): Promise<void> {
  await expect
    .poll(
      () => {
        const url = new URL(page.url());

        return `${url.searchParams.get("network")}:${url.searchParams.get("room")}`;
      },
      { timeout: 30000 },
    )
    .toBe(`server:${ROOM_CODE}`);
}

async function installSocketFixture(
  page: Page,
  autoConnect = true,
  bodyReadFailureSuffix?: string,
): Promise<void> {
  await page.addInitScript(
    ({ autoConnect, bodyReadFailureSuffix }) => {
      type Listener = (...args: unknown[]) => void;
      type Subscription = {
        roomCode: string;
        playerId: string;
        sessionId: string;
        afterRevision: number;
      };

      const sockets: FixtureSocket[] = [];
      const subscriptions: Subscription[] = [];
      const transportErrors: string[] = [];
      const nativeFetch = window.fetch.bind(window);
      let bodyReadFailed = false;
      window.fetch = async (...args): Promise<Response> => {
        const response = await nativeFetch(...args);
        const requestUrl =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof URL
              ? args[0].href
              : args[0].url;

        if (
          !bodyReadFailed &&
          bodyReadFailureSuffix &&
          new URL(requestUrl, window.location.href).pathname.endsWith(bodyReadFailureSuffix)
        ) {
          bodyReadFailed = true;
          return new Proxy(response, {
            get(target, property) {
              if (property === "text") {
                return () => Promise.reject(new TypeError("response body stream failed"));
              }

              const value = Reflect.get(target, property, target) as unknown;
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        }

        return response;
      };
      window.addEventListener("poke-lounge:server-room-error", event => {
        const detail = (event as CustomEvent<{ message?: unknown }>).detail;

        if (typeof detail?.message === "string") {
          transportErrors.push(detail.message);
        }
      });

      class FixtureSocket {
        connected = false;
        private readonly listeners = new Map<string, Set<Listener>>();

        on(eventName: string, listener: Listener): this {
          const eventListeners = this.listeners.get(eventName) ?? new Set<Listener>();
          eventListeners.add(listener);
          this.listeners.set(eventName, eventListeners);
          return this;
        }

        off(eventName: string, listener?: Listener): this {
          if (listener) {
            this.listeners.get(eventName)?.delete(listener);
          } else {
            this.listeners.delete(eventName);
          }
          return this;
        }

        emit(eventName: string, payload?: unknown): this {
          if (eventName === "room.subscribe" && payload && typeof payload === "object") {
            subscriptions.push(structuredClone(payload) as Subscription);
          }
          return this;
        }

        disconnect(): this {
          this.disconnectFromServer("io client disconnect");
          return this;
        }

        connectFromServer(): void {
          if (this.connected) {
            return;
          }
          this.connected = true;
          this.dispatch("connect");
        }

        disconnectFromServer(reason: string): void {
          if (!this.connected) {
            return;
          }
          this.connected = false;
          this.dispatch("disconnect", reason);
        }

        dispatch(eventName: string, ...args: unknown[]): void {
          for (const listener of this.listeners.get(eventName) ?? []) {
            listener(...args);
          }
        }
      }

      const fixtureWindow = window as Window & {
        __POKE_LOUNGE_E2E_SOCKET_FACTORY__?: () => FixtureSocket;
        __POKE_LOUNGE_SOCKET_TEST__?: PokeLoungeSocketTestControl;
      };
      const latestSocket = () => sockets.at(-1);

      fixtureWindow.__POKE_LOUNGE_E2E_SOCKET_FACTORY__ = () => {
        const socket = new FixtureSocket();
        sockets.push(socket);
        if (autoConnect) {
          queueMicrotask(() => socket.connectFromServer());
        }
        return socket;
      };
      fixtureWindow.__POKE_LOUNGE_SOCKET_TEST__ = {
        createdCount: () => sockets.length,
        connected: () => latestSocket()?.connected ?? false,
        subscriptions: () => structuredClone(subscriptions),
        transportErrors: () => [...transportErrors],
        disconnect: () => latestSocket()?.disconnectFromServer("transport close"),
        emitConnectError: () => latestSocket()?.dispatch("connect_error", new Error("offline")),
        reconnect: () => latestSocket()?.connectFromServer(),
        emitSnapshot: room => latestSocket()?.dispatch("room.snapshot", { room }),
        emitRevisionConflict: room => latestSocket()?.dispatch("room.revision-conflict", { room }),
        emitSubscriptionError: () =>
          latestSocket()?.dispatch("room.subscription-error", {
            code: "POKE_LOUNGE_SUBSCRIPTION_REJECTED",
            message: "Poke Lounge room subscription rejected",
          }),
      };
    },
    { autoConnect, bodyReadFailureSuffix },
  );
}

async function mockServerRoom(
  page: Page,
  server: MockServerState,
  options: {
    advanceRevisionOnGetAfterConflict?: boolean;
    bodyReadFailureSuffix?: string;
    completeOnGet?: boolean;
    competitive?: boolean;
    competitiveActionNetworkFailure?: boolean;
    competitiveActionNetworkFailureCount?: number;
    competitiveActionRejected?: boolean;
    competitiveActionResponseDeferred?: boolean;
    competitiveActionStaleConflict?: boolean;
    competitiveImmediately?: boolean;
    competitiveFaintedSwitchSlot?: boolean;
    competitivePendingImmediately?: boolean;
    competitiveSeatIneligible?: boolean;
    deferCreateResponse?: boolean;
    deferLeaveResponse?: boolean;
    deferRecoveryGet?: boolean;
    idempotencyConflictSuffix?: string;
    malformedSuccessSuffix?: string;
    malformedSuccessType?: "json" | "schema";
    malformedCompetitiveSeat?: boolean;
    lobbyLifecycle?: boolean;
    mutationDelayMs?: number;
    networkFailureSuffix?: string;
    rejectLeave?: boolean;
    rejectResult?: boolean;
    recoveryGetRevision?: number;
    revisionConflictAttempt?: number;
    revisionConflictDelayMs?: number;
    revisionConflictSuffix?: string;
    socketAutoConnect?: boolean;
    waitForResult?: boolean;
    wrapped?: boolean;
  } = {},
): Promise<void> {
  if (options.competitive) {
    server.activeMatchAuthority = "server";
  }
  await installSocketFixture(
    page,
    options.socketAutoConnect !== false,
    options.bodyReadFailureSuffix,
  );
  let completedOnRecoveryGet = false;
  await page.route("**/poke-lounge/rooms**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const suffix = url.pathname.replace(`/poke-lounge/rooms/${ROOM_CODE}`, "");
    const mutation =
      method === "POST" && suffix !== "/competitive-seat" && !suffix.includes("/actions");

    server.calls.push(`${method} ${url.pathname}`);

    const afterRevision = url.searchParams.get("afterRevision");

    if (method === "GET" && afterRevision !== null) {
      server.recoveryAfterRevisions.push(Number(afterRevision));

      if (options.deferRecoveryGet && !server.recoveryGetDeferred) {
        server.recoveryGetDeferred = true;
        await new Promise<void>(resolve => {
          server.resolveRecoveryGet = resolve;
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: stringifyResponse(
            {
              ...createTournamentRoomState(server),
              revision: options.recoveryGetRevision ?? Math.max(0, server.revision - 1),
            },
            options,
          ),
        });
        return;
      }

      if (options.completeOnGet && !completedOnRecoveryGet) {
        server.revision += 1;
        completedOnRecoveryGet = true;
      }
    }

    if (mutation) {
      const idempotencyKey = request.headers()["x-idempotency-key"];
      const revision = request.headers()["if-match-revision"];

      expect(idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(revision).toMatch(/^(0|[1-9][0-9]*)$/);
      server.commandHeaders.push({ suffix, idempotencyKey, revision });
      server.commandRequests.push({
        body: request.postData() ?? "",
        idempotencyKey,
        method,
        revision,
        suffix,
      });
      server.activeMutations += 1;
      server.maxConcurrentMutations = Math.max(
        server.maxConcurrentMutations,
        server.activeMutations,
      );

      if (options.mutationDelayMs) {
        await new Promise(resolve => setTimeout(resolve, options.mutationDelayMs));
      }
    }

    try {
      if (mutation && suffix === "/leave" && options.deferLeaveResponse) {
        server.leaveRequestDeferred = true;
        await new Promise<void>(resolve => {
          server.resolveLeaveResponse = resolve;
        });
      }

      if (mutation && suffix === "/leave" && options.rejectLeave) {
        await route.abort("failed");
        return;
      }

      if (mutation && suffix === options.networkFailureSuffix && !server.networkFailureReturned) {
        server.networkFailureReturned = true;
        await route.abort("failed");
        return;
      }

      if (mutation && suffix === options.malformedSuccessSuffix) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body:
            options.malformedSuccessType === "json"
              ? "{not-json"
              : JSON.stringify({ status: "waiting" }),
        });
        return;
      }

      if (
        mutation &&
        suffix === options.revisionConflictSuffix &&
        server.commandRequests.filter(request => request.suffix === suffix).length ===
          (options.revisionConflictAttempt ?? 1) &&
        !server.revisionConflictReturned
      ) {
        server.revisionConflictReturned = true;
        server.revision += 1;
        server.conflictRevision = server.revision;
        const snapshot = options.lobbyLifecycle
          ? createLobbyWaitingRoomState(server)
          : createWaitingRoomState(server);

        if (options.revisionConflictDelayMs) {
          await new Promise(resolve => setTimeout(resolve, options.revisionConflictDelayMs));
        }

        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 409,
            code: "POKE_LOUNGE_REVISION_CONFLICT",
            message: "Poke Lounge room revision conflict",
            snapshot,
          }),
        });
        return;
      }

      if (
        mutation &&
        suffix === options.idempotencyConflictSuffix &&
        !server.idempotencyConflictReturned
      ) {
        server.idempotencyConflictReturned = true;
        server.revision += 1;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 409,
            code: "POKE_LOUNGE_IDEMPOTENCY_CONFLICT",
            message: "Poke Lounge room idempotency conflict",
            snapshot: createCompletedRoomState(server),
          }),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/poke-lounge/rooms") {
        expect(request.headers()["if-match-revision"]).toBe("0");
        server.revision = 0;
        await recordJoinedIdentity(request, server);
        if (options.deferCreateResponse) {
          server.createRequestReceived = true;
          await new Promise<void>(resolve => {
            server.resolveCreateResponse = resolve;
          });
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: stringifyResponse(
            options.lobbyLifecycle
              ? createLobbyWaitingRoomState(server)
              : createWaitingRoomState(server),
            options,
          ),
        });
        return;
      }

      if (method === "POST" && suffix === "/join") {
        await recordJoinedIdentity(request, server);
      }

      if (method === "POST" && suffix === "/party-snapshot") {
        server.partySnapshotBodies.push(
          (await request.postDataJSON()) as MockServerState["partySnapshotBodies"][number],
        );
      }

      if (method === "POST" && suffix === "/ready" && options.lobbyLifecycle) {
        const body = (await request.postDataJSON()) as { playerId?: string; ready?: boolean };
        if (body.playerId && body.ready === true) {
          server.readyPlayerIds.add(body.playerId);
        } else if (body.playerId) {
          server.readyPlayerIds.delete(body.playerId);
        }
      }

      if (method === "POST" && suffix === "/start" && options.lobbyLifecycle) {
        server.lobbyStarted = true;
      }

      if (method === "POST" && suffix === "/competitive-seat") {
        server.competitiveAuthHeaders.push(request.headers().authorization ?? "");
        server.competitiveSeatBodies.push((await request.postDataJSON()) as { sessionId?: string });
        if (options.competitiveSeatIneligible) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              statusCode: 409,
              code: "POKE_LOUNGE_COMPETITIVE_ASSIGNMENT_INELIGIBLE",
              message: "Account is not eligible for this competitive assignment",
              eligible: false,
            }),
          });
          return;
        }
        if (options.malformedCompetitiveSeat) {
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: stringifyResponse(
              createServerCompetitiveProjection(server, { currentTurn: -1 }),
              options,
            ),
          });
          return;
        }
        const seatProjection =
          options.competitive &&
          (options.competitiveImmediately || server.joinedParticipants.length >= 2)
            ? createServerCompetitiveProjection(server, {
                submittedPlayerIds: options.competitivePendingImmediately
                  ? [getStateParticipants(server)[0].playerId]
                  : [],
              })
            : null;
        if (seatProjection && options.competitiveFaintedSwitchSlot) {
          const ownPlayerId = getStateParticipants(server)[0].playerId;
          seatProjection.currentState.playersById[ownPlayerId].team[0].currentHp = 0;
          seatProjection.currentState.playersById[ownPlayerId].team[0].status = "fainted";
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: stringifyResponse(seatProjection, options),
        });
        return;
      }

      if (method === "POST" && suffix.includes("/actions")) {
        server.competitiveActionAuthHeaders.push(request.headers().authorization ?? "");
        const body =
          (await request.postDataJSON()) as MockServerState["competitiveActionBodies"][number];
        server.competitiveActionBodies.push(body);
        if (options.competitiveActionRejected && server.competitiveActionBodies.length === 1) {
          server.competitiveResyncRequested = true;
          server.revision += 1;
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              statusCode: 400,
              message: "Competitive action is illegal",
            }),
          });
          return;
        }
        const networkFailureCount =
          options.competitiveActionNetworkFailureCount ??
          (options.competitiveActionNetworkFailure ? 1 : 0);
        if (server.competitiveActionNetworkFailuresReturned < networkFailureCount) {
          server.competitiveActionNetworkFailuresReturned += 1;
          server.competitiveActionNetworkFailureReturned = true;
          if (
            networkFailureCount > 1 &&
            server.competitiveActionNetworkFailuresReturned === networkFailureCount
          ) {
            server.competitiveResyncRequested = true;
            server.revision += 1;
          }
          await route.abort("failed");
          return;
        }
        if (options.competitiveActionStaleConflict && !server.competitiveActionStaleReturned) {
          server.competitiveActionStaleReturned = true;
          server.competitiveResyncRequested = true;
          server.revision += 1;
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              statusCode: 409,
              code: "POKE_LOUNGE_COMPETITIVE_STALE_TURN",
              message: "Competitive action conflict",
            }),
          });
          return;
        }
        if (
          options.competitiveActionResponseDeferred &&
          !server.competitiveActionResponseDeferred
        ) {
          server.competitiveActionResponseDeferred = true;
          await new Promise<void>(resolve => {
            server.resolveCompetitiveActionResponse = resolve;
          });
        }
        const ownPlayerId = getStateParticipants(server)[0].playerId;
        const projection = createServerCompetitiveProjection(server, {
          submittedPlayerIds: [ownPlayerId],
        });
        const responseProjection = server.competitiveResyncRequested
          ? {
              ...projection,
              currentTurn: 4,
              currentState: { ...projection.currentState, turn: 4 },
            }
          : projection;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: stringifyResponse(responseProjection, options),
        });
        return;
      }

      if (method === "POST" && suffix === "/result") {
        const body = (await request.postDataJSON()) as MockServerState["resultBodies"][number];
        server.resultBodies.push(body);
        const resultError = validateResultBody(body, server);

        if (!options.rejectResult && !resultError) {
          server.revision += 1;
        }

        await route.fulfill({
          status: options.rejectResult || resultError ? 400 : 201,
          contentType: "application/json",
          body: stringifyResponse(
            options.rejectResult || resultError
              ? { message: resultError ?? "Invalid match result" }
              : markResultAccepted(server),
            options,
          ),
        });
        return;
      }

      if (mutation) {
        server.revision += 1;
      }

      if (options.lobbyLifecycle) {
        await route.fulfill({
          status: method === "GET" ? 200 : 201,
          contentType: "application/json",
          body: stringifyResponse(
            server.lobbyStarted
              ? createLobbyStartedRoomState(server)
              : createLobbyWaitingRoomState(server),
            options,
          ),
        });
        return;
      }

      if (
        method === "GET" &&
        options.advanceRevisionOnGetAfterConflict &&
        server.revisionConflictReturned &&
        !server.concurrentPollRevision
      ) {
        server.revision += 1;
        server.concurrentPollRevision = server.revision;
      }

      let responseState: Record<string, unknown> =
        options.advanceRevisionOnGetAfterConflict &&
        method === "GET" &&
        server.concurrentPollRevision
          ? createTournamentRoomState(server)
          : options.rejectResult ||
              (options.completeOnGet && !completedOnRecoveryGet) ||
              (options.waitForResult && !server.resultAccepted)
            ? createTournamentRoomState(server)
            : createCompletedRoomState(server);

      if (method === "GET" && server.competitiveResyncRequested) {
        const projection = createServerCompetitiveProjection(server);
        responseState = {
          ...createTournamentRoomState(server),
          competitive: {
            ...projection,
            currentTurn: 4,
            currentState: { ...projection.currentState, turn: 4 },
            submittedPlayerIds: [],
          },
        };
      }

      if (method === "GET" && server.returnStaleGet) {
        server.returnStaleGet = false;
        responseState = {
          ...createTournamentRoomState(server),
          revision: Math.max(0, server.revision - 1),
        };
      }

      await route.fulfill({
        status: method === "GET" ? 200 : 201,
        contentType: "application/json",
        body: stringifyResponse(responseState, options),
      });
    } finally {
      if (mutation) {
        server.activeMutations -= 1;
      }
    }
  });
}

async function newMockedPage(
  browser: Browser,
  server: MockServerState,
  options: { lobbyLifecycle?: boolean; mobile?: boolean; wrapped?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext(
    options.mobile
      ? {
          hasTouch: true,
          isMobile: true,
          viewport: { width: 390, height: 844 },
        }
      : undefined,
  );
  const page = await context.newPage();

  await mockServerRoom(page, server, options);

  return page;
}

interface MockServerState {
  activeMatchAuthority: "casual" | "server";
  activeMutations: number;
  calls: string[];
  commandRequests: Array<{
    body: string;
    idempotencyKey: string;
    method: string;
    revision: string;
    suffix: string;
  }>;
  commandHeaders: Array<{
    suffix: string;
    idempotencyKey: string;
    revision: string;
  }>;
  competitiveAuthHeaders: string[];
  competitiveActionAuthHeaders: string[];
  competitiveActionBodies: Array<{
    assignmentRevision?: number;
    turn?: number;
    clientCommandId?: string;
    action?: { kind?: string; moveId?: number | string; slotIndex?: number };
  }>;
  competitiveActionNetworkFailureReturned: boolean;
  competitiveActionNetworkFailuresReturned: number;
  competitiveActionResponseDeferred: boolean;
  competitiveActionStaleReturned: boolean;
  competitiveResyncRequested: boolean;
  competitiveSeatBodies: Array<{ sessionId?: string }>;
  conflictRevision: number | null;
  concurrentPollRevision: number | null;
  createRequestReceived: boolean;
  resolveCreateResponse?: () => void;
  idempotencyConflictReturned: boolean;
  leaveRequestDeferred: boolean;
  maxConcurrentMutations: number;
  networkFailureReturned: boolean;
  recoveryAfterRevisions: number[];
  recoveryGetDeferred: boolean;
  resolveCompetitiveActionResponse?: () => void;
  resolveRecoveryGet?: () => void;
  resolveLeaveResponse?: () => void;
  partySnapshotBodies: Array<{
    playerId?: string;
    sessionId?: string;
    displayName?: string;
    competitiveParty?: {
      version: 2;
      activeSlotIndex: number;
      members: Array<{
        slotIndex: number;
        speciesId: number;
        level: number;
        currentHp: number;
        status: "normal" | "poisoned" | "burned" | "paralyzed";
        individualValues: {
          hp: number;
          attack: number;
          defense: number;
          specialAttack: number;
          specialDefense: number;
          speed: number;
        };
        moves: Array<{ moveId: number; pp: number }>;
      }>;
    };
  }>;
  resultBodies: Array<{
    reportingPlayerId?: string;
    reportingSessionId?: string;
    matchId?: string;
    winnerPlayerId?: string;
    loserPlayerId?: string;
    reason?: string;
  }>;
  resultAccepted: boolean;
  revision: number;
  revisionConflictReturned: boolean;
  returnStaleGet: boolean;
  joinedPlayerIds: Set<string>;
  joinedSessionIds: Set<string>;
  joinedParticipants: Array<{
    playerId: string;
    sessionId: string;
    displayName?: string;
    joinedAtMs: number;
  }>;
  lobbyStarted: boolean;
  readyPlayerIds: Set<string>;
}

function createMockServerState(): MockServerState {
  return {
    activeMatchAuthority: "casual",
    activeMutations: 0,
    calls: [],
    commandRequests: [],
    commandHeaders: [],
    competitiveAuthHeaders: [],
    competitiveActionAuthHeaders: [],
    competitiveActionBodies: [],
    competitiveActionNetworkFailureReturned: false,
    competitiveActionNetworkFailuresReturned: 0,
    competitiveActionResponseDeferred: false,
    competitiveActionStaleReturned: false,
    competitiveResyncRequested: false,
    competitiveSeatBodies: [],
    conflictRevision: null,
    concurrentPollRevision: null,
    createRequestReceived: false,
    idempotencyConflictReturned: false,
    leaveRequestDeferred: false,
    maxConcurrentMutations: 0,
    networkFailureReturned: false,
    recoveryAfterRevisions: [],
    recoveryGetDeferred: false,
    partySnapshotBodies: [],
    resultBodies: [],
    resultAccepted: false,
    revision: 0,
    revisionConflictReturned: false,
    returnStaleGet: false,
    joinedPlayerIds: new Set(),
    joinedSessionIds: new Set(),
    joinedParticipants: [],
    lobbyStarted: false,
    readyPlayerIds: new Set(),
  };
}

async function mockAuthenticatedPokeSession(page: Page): Promise<{ requestCount(): number }> {
  let requestCount = 0;
  const snapshot = buildPokeLoungeSaveSnapshot(createGameStateStore());
  await page.route("**/api/auth/session", route => {
    requestCount += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "account-a", name: "Player A", email: "player-a@example.test" },
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        idToken: AUTH_ID_TOKEN,
        idTokenExpiresAt: AUTH_ID_TOKEN_EXPIRES_AT,
      }),
    });
  });
  await page.route("**/game/poke-lounge/state", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { state: snapshot, revision: 0 } }),
      });
      return;
    }

    const body = route.request().postDataJSON() as { expectedRevision?: number };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { revision: (body.expectedRevision ?? 0) + 1 },
      }),
    });
  });
  return { requestCount: () => requestCount };
}

async function recordJoinedIdentity(request: Request, server: MockServerState) {
  const body = (await request.postDataJSON()) as {
    playerId?: string;
    sessionId?: string;
    displayName?: string;
  };

  if (!body.playerId || !body.sessionId) {
    return;
  }

  server.joinedPlayerIds.add(body.playerId);
  server.joinedSessionIds.add(body.sessionId);

  if (!server.joinedParticipants.some(participant => participant.playerId === body.playerId)) {
    server.joinedParticipants.push({
      playerId: body.playerId,
      sessionId: body.sessionId,
      displayName: body.displayName,
      joinedAtMs: server.joinedParticipants.length,
    });
  }
}

function stringifyResponse(value: unknown, options: { wrapped?: boolean }): string {
  return JSON.stringify(options.wrapped ? { success: true, data: value } : value);
}

function markResultAccepted(server: MockServerState) {
  server.resultAccepted = true;

  return createCompletedRoomState(server);
}

function validateResultBody(
  body: MockServerState["resultBodies"][number],
  server: MockServerState,
): string | null {
  const participants = getStateParticipants(server);
  const reporter = participants.find(
    participant => participant.playerId === body.reportingPlayerId,
  );
  const participantIds = new Set(participants.map(participant => participant.playerId));

  if (!reporter || reporter.sessionId !== body.reportingSessionId) {
    return "Invalid reporter";
  }

  if (
    body.matchId !== BRACKET_MATCH_ID ||
    !body.winnerPlayerId ||
    !body.loserPlayerId ||
    body.winnerPlayerId === body.loserPlayerId ||
    !participantIds.has(body.winnerPlayerId) ||
    !participantIds.has(body.loserPlayerId)
  ) {
    return "Invalid match participants";
  }

  return null;
}

function createWaitingRoomState(server: MockServerState) {
  return {
    ...createCompletedRoomState(server),
    status: "waiting",
    round: {
      index: 1,
      phase: "waiting",
      durationMs: 1000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
    partySnapshots: createPartySnapshots(server),
  };
}

function createLobbyWaitingRoomState(server: MockServerState) {
  return {
    roomCode: ROOM_CODE,
    hostPlayerId: server.joinedParticipants[0]?.playerId ?? null,
    revision: server.revision,
    expiresAtMs: ROOM_EXPIRES_AT_MS,
    status: "waiting",
    participants: server.joinedParticipants.map(participant => ({
      playerId: participant.playerId,
      displayName: participant.displayName ?? participant.playerId,
      role: "participant",
      ready: server.readyPlayerIds.has(participant.playerId),
      connected: true,
      joinedAtMs: participant.joinedAtMs,
    })),
    partySnapshots: createPartySnapshots(server),
    round: {
      index: 1,
      phase: "waiting",
      durationMs: 300_000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
  };
}

function createLobbyStartedRoomState(server: MockServerState) {
  return {
    ...createLobbyWaitingRoomState(server),
    status: "round-started",
    round: {
      index: 1,
      phase: "round-started",
      durationMs: 300_000,
      startedAtMs: 1_000,
      endsAtMs: 301_000,
    },
  };
}

function createTournamentRoomState(server: MockServerState) {
  const completed = createCompletedRoomState(server);
  const [first, second] = getStateParticipants(server);
  const participants = createBracketParticipants(first, second);
  const currentRound = createBracketRound(participants, false);

  return {
    ...completed,
    status: "tournament",
    tournament: {
      version: 2,
      bracket: {
        version: 1,
        gameRoundIndex: 1,
        status: "in-progress",
        participants,
        currentRound,
        completedRounds: [],
        eliminations: [],
        championPlayerId: null,
      },
      activeMatchId: BRACKET_MATCH_ID,
      activeMatchAuthority: server.activeMatchAuthority,
      cumulativeScores: {},
    },
    finalStandings: [],
    partySnapshots: createPartySnapshots(server),
  };
}

function createNextAssignmentRoomState(server: MockServerState, role: "winner" | "loser") {
  const [ownParticipant, opponentParticipant] = getStateParticipants(server);
  const seedOne = {
    playerId: "seed-one-player",
    displayName: "Seed One",
    role: "participant",
    ready: true,
    connected: true,
    joinedAtMs: 2,
  } as const;
  const bracket = createTournamentBracketState(
    [
      { playerId: seedOne.playerId, displayName: seedOne.displayName },
      {
        playerId: ownParticipant.playerId,
        displayName: ownParticipant.displayName ?? "Player 1",
      },
      {
        playerId: opponentParticipant.playerId,
        displayName: opponentParticipant.displayName ?? "Player 2",
      },
    ],
    1,
  );
  const completedMatch = getReadyTournamentMatches(bracket)[0];
  const winnerPlayerId = role === "winner" ? ownParticipant.playerId : opponentParticipant.playerId;
  const loserPlayerId = role === "winner" ? opponentParticipant.playerId : ownParticipant.playerId;
  const advancedBracket = recordTournamentMatchResult(
    bracket,
    completedMatch.matchId,
    winnerPlayerId,
    { reason: "faint", completedAtMs: 1000 },
  );
  const nextMatch = getReadyTournamentMatches(advancedBracket)[0];
  const activeProjection = createServerCompetitiveProjection(server, {
    bracketMatchId: completedMatch.matchId,
    kind: "tournament-unranked",
  });
  const terminalRevision = server.revision + 1;
  const terminal = {
    winnerPlayerId,
    loserPlayerId,
    reason: "faint" as const,
    scoreByPlayerId: { [winnerPlayerId]: 100 as const, [loserPlayerId]: 50 as const },
  };
  const completedProjection: CompetitiveProjection = {
    ...activeProjection,
    currentTurn: activeProjection.currentTurn + 1,
    status: "completed",
    currentState: {
      ...activeProjection.currentState,
      turn: activeProjection.currentTurn + 1,
      terminal,
    },
    terminal,
    terminalEventId: `terminal-next-${role}-${terminalRevision}`,
    terminalRoomRevision: terminalRevision,
  };
  const nextProjection = createCompetitiveProjectionForPlayers(
    [nextMatch.participantIds[0], nextMatch.participantIds[1]],
    {
      matchId: "22222222-2222-4222-8222-222222222222",
      bracketMatchId: nextMatch.matchId,
      kind: "tournament-unranked",
      assignmentRevision: activeProjection.assignmentRevision + 1,
    },
  );
  server.revision = terminalRevision;
  const room = createTournamentRoomState(server);

  return {
    nextMatchId: nextProjection.matchId,
    room: {
      ...room,
      participants: [...room.participants, seedOne],
      tournament: {
        version: 2,
        bracket: advancedBracket,
        activeMatchId: nextMatch.matchId,
        activeMatchAuthority: "server",
        cumulativeScores: {
          [winnerPlayerId]: 100,
          [loserPlayerId]: 50,
          [seedOne.playerId]: 0,
        },
      },
      competitiveTransitions: [
        {
          terminalEventId: completedProjection.terminalEventId,
          terminalRoomRevision: completedProjection.terminalRoomRevision,
          projection: completedProjection,
        },
      ],
      competitive: nextProjection,
    },
  };
}

function createCompletedRoomState(server?: MockServerState) {
  const [first, second] = getStateParticipants(server);
  const participants = createBracketParticipants(first, second);
  const completedRound = createBracketRound(participants, true);

  return {
    roomCode: ROOM_CODE,
    hostPlayerId: first.playerId,
    revision: server?.revision ?? 0,
    expiresAtMs: ROOM_EXPIRES_AT_MS,
    status: "completed",
    participants: [
      {
        playerId: first.playerId,
        displayName: first.displayName ?? "Player 1",
        role: "participant",
        ready: true,
        connected: true,
        joinedAtMs: first.joinedAtMs,
      },
      {
        playerId: second.playerId,
        displayName: second.displayName ?? "Player 2",
        role: "participant",
        ready: true,
        connected: true,
        joinedAtMs: second.joinedAtMs,
      },
    ],
    partySnapshots: createPartySnapshots(server),
    round: {
      index: 1,
      phase: "tournament",
      durationMs: 1000,
      startedAtMs: 0,
      endsAtMs: 1000,
    },
    tournament: {
      version: 2,
      bracket: {
        version: 1,
        gameRoundIndex: 1,
        status: "completed",
        participants,
        currentRound: null,
        completedRounds: [completedRound],
        eliminations: [
          {
            playerId: second.playerId,
            displayName: second.displayName ?? "Player 2",
            seed: 2,
            roundNumber: 1,
            matchId: BRACKET_MATCH_ID,
            order: 1,
          },
        ],
        championPlayerId: first.playerId,
      },
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {
        [first.playerId]: 100,
        [second.playerId]: 50,
      },
    },
    finalStandings: [
      {
        playerId: first.playerId,
        displayName: first.displayName ?? "Player 1",
        rank: 1,
        score: 100,
      },
      {
        playerId: second.playerId,
        displayName: second.displayName ?? "Player 2",
        rank: 2,
        score: 50,
      },
    ],
  };
}

function createCompletedRoomStateForWinner(server: MockServerState, winnerPlayerId: string) {
  const state = createCompletedRoomState(server);
  const [first, second] = getStateParticipants(server);
  const winner = winnerPlayerId === first.playerId ? first : second;
  const loser = winnerPlayerId === first.playerId ? second : first;
  const match = state.tournament.bracket.completedRounds[0].matches[0];

  match.winnerPlayerId = winner.playerId;
  match.loserPlayerId = loser.playerId;
  state.tournament.bracket.championPlayerId = winner.playerId;
  state.tournament.bracket.eliminations = [
    {
      playerId: loser.playerId,
      displayName: loser.displayName ?? loser.playerId,
      seed: winnerPlayerId === first.playerId ? 2 : 1,
      roundNumber: 1,
      matchId: BRACKET_MATCH_ID,
      order: 1,
    },
  ];
  state.tournament.cumulativeScores = {
    [winner.playerId]: 100,
    [loser.playerId]: 50,
  };
  state.finalStandings = [
    {
      playerId: winner.playerId,
      displayName: winner.displayName ?? winner.playerId,
      rank: 1,
      score: 100,
    },
    {
      playerId: loser.playerId,
      displayName: loser.displayName ?? loser.playerId,
      rank: 2,
      score: 50,
    },
  ];

  return state;
}

function createBracketParticipants(
  first: ReturnType<typeof getStateParticipants>[0],
  second: ReturnType<typeof getStateParticipants>[1],
) {
  return [
    {
      playerId: first.playerId,
      displayName: first.displayName ?? "Player 1",
      seed: 1,
    },
    {
      playerId: second.playerId,
      displayName: second.displayName ?? "Player 2",
      seed: 2,
    },
  ] as const;
}

function createBracketRound(
  participants: ReturnType<typeof createBracketParticipants>,
  completed: boolean,
) {
  const [first, second] = participants;
  return {
    roundNumber: 1,
    matches: [
      {
        matchId: BRACKET_MATCH_ID,
        roundNumber: 1,
        matchNumber: 1,
        participantA: first,
        participantB: second,
        participantIds: [first.playerId, second.playerId],
        status: completed ? "completed" : "ready",
        winnerPlayerId: completed ? first.playerId : null,
        loserPlayerId: completed ? second.playerId : null,
        resultReason: completed ? "faint" : null,
        completedAtMs: completed ? 1000 : null,
      },
    ],
    byes: [],
    slots: [{ kind: "match", matchId: BRACKET_MATCH_ID }],
  };
}

function createPartySnapshots(server?: MockServerState) {
  return Object.fromEntries(
    (server?.partySnapshotBodies ?? [])
      .filter(
        (snapshot): snapshot is NonNullable<typeof snapshot> & { playerId: string } =>
          typeof snapshot.playerId === "string" && snapshot.playerId.length > 0,
      )
      .flatMap(snapshot => {
        const party = snapshot.competitiveParty;
        const representative = party?.members.find(
          member => member.slotIndex === party.activeSlotIndex,
        );
        if (!party || !representative) {
          return [];
        }

        return [
          [
            snapshot.playerId,
            {
              playerId: snapshot.playerId,
              ...(snapshot.displayName ? { displayName: snapshot.displayName } : {}),
              representativePokemon: {
                speciesId: representative.speciesId,
                level: representative.level,
                currentHp: representative.currentHp,
                maxHp: representative.currentHp,
              },
              partySize: party.members.length,
              updatedAtMs: 0,
            },
          ] as const,
        ];
      }),
  );
}

function getStateParticipants(server?: MockServerState) {
  const first = server?.joinedParticipants[0] ?? {
    sessionId: "server-session-1",
    playerId: "player-1",
    displayName: "Player 1",
    joinedAtMs: 0,
  };
  const second = server?.joinedParticipants[1] ?? {
    sessionId: "server-session-2",
    playerId: "player-2",
    displayName: "Player 2",
    joinedAtMs: 1,
  };

  return [first, second] as const;
}

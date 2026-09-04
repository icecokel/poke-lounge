import assert from "node:assert/strict";
import test from "node:test";
import { COMPETITIVE_RULESET_HASH } from "@poke-lounge/battle/competitive-ruleset-config";
import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  recordTournamentMatchResult,
} from "@poke-lounge/battle/tournament-bracket";
import { createGameStateStore } from "../state/game-state-store";
import { selectCompetitiveAssignment } from "./competitive-projection";
import type { CompetitiveProjection, RoomEvent } from "./local-preview-room";

test("동시 경기 선택은 본인 경기를 우선하고 비전투자는 같은 경기를 안정적으로 관전한다", function testCase() {
  const assignments = [
    {
      matchId: "match-1",
      bracketMatchId: "game-round-1-bracket-1-match-1",
      playerIds: ["player-1", "player-2"],
    },
    {
      matchId: "match-2",
      bracketMatchId: "game-round-1-bracket-1-match-2",
      playerIds: ["player-3", "player-4"],
    },
  ] as unknown as CompetitiveProjection[];

  assert.equal(selectCompetitiveAssignment(assignments, "player-3", 1)?.matchId, "match-2");
  const watched = selectCompetitiveAssignment(assignments, "player-5", 1)?.matchId;
  assert.ok(watched === "match-1" || watched === "match-2");
  assert.equal(selectCompetitiveAssignment(assignments, "player-5", 1)?.matchId, watched);
});

interface FixtureSocket {
  readonly connected: boolean;
  readonly io: { readonly engine: { readonly transport: { readonly name: string } } };
  on(eventName: string, listener: (event?: unknown) => void): FixtureSocket;
  off(eventName: string, listener: (event?: unknown) => void): FixtureSocket;
  emit(eventName: string, payload: unknown): FixtureSocket;
  disconnect(): FixtureSocket;
  pushSnapshot(room: unknown): void;
  pushWorldSnapshot(snapshot: unknown): void;
  pushWorldCursor(cursor: unknown): void;
  pushPlayerEvent(event: unknown): void;
  disconnectFromServer(): void;
  failConnection(error?: unknown): void;
  pushSubscriptionError(): void;
  reconnectFromServer(): void;
  setActiveTransport(name: string): void;
  subscriptions(): Array<{ afterRevision: number }>;
  emissions(eventName: string): unknown[];
}

function createSocket(initiallyConnected = true): FixtureSocket {
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  const recordedSubscriptions: Array<{ afterRevision: number }> = [];
  const recordedEmissions = new Map<string, unknown[]>();
  let connected = initiallyConnected;
  let activeTransport = "websocket";

  const dispatch = (eventName: string, event?: unknown) => {
    for (const listener of listeners.get(eventName) ?? []) {
      listener(event);
    }
  };

  return {
    get connected() {
      return connected;
    },
    get io() {
      return { engine: { transport: { name: activeTransport } } };
    },
    on(eventName, listener) {
      const eventListeners = listeners.get(eventName) ?? new Set();
      eventListeners.add(listener);
      listeners.set(eventName, eventListeners);
      return this;
    },
    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
      return this;
    },
    emit(eventName, payload) {
      const emissions = recordedEmissions.get(eventName) ?? [];
      emissions.push(payload);
      recordedEmissions.set(eventName, emissions);
      if (eventName === "room.subscribe" && payload && typeof payload === "object") {
        const afterRevision = (payload as { afterRevision?: unknown }).afterRevision;
        if (typeof afterRevision === "number") {
          recordedSubscriptions.push({ afterRevision });
        }
      }
      return this;
    },
    disconnect() {
      connected = false;
      return this;
    },
    pushSnapshot(room) {
      dispatch("room.snapshot", { room });
    },
    pushWorldSnapshot(snapshot) {
      dispatch("room.world-snapshot", snapshot);
    },
    pushWorldCursor(cursor) {
      dispatch("room.world-cursor", cursor);
    },
    pushPlayerEvent(event) {
      dispatch("room.player-event", event);
    },
    disconnectFromServer() {
      if (connected) {
        connected = false;
        dispatch("disconnect");
      }
    },
    failConnection(error) {
      connected = false;
      dispatch("connect_error", error);
    },
    pushSubscriptionError() {
      dispatch("room.subscription-error");
    },
    reconnectFromServer() {
      if (!connected) {
        connected = true;
        dispatch("connect");
      }
    },
    setActiveTransport(name) {
      activeTransport = name;
    },
    subscriptions() {
      return [...recordedSubscriptions];
    },
    emissions(eventName) {
      return [...(recordedEmissions.get(eventName) ?? [])];
    },
  };
}

function createManualRecoveryTimers(search = "") {
  let nextTimerId = 1;
  const pending = new Map<number, { callback: () => void; delayMs: number }>();

  return {
    window: {
      location: { href: `http://web.test/game${search}`, search },
      setTimeout(callback: () => void, delayMs = 0) {
        const timerId = nextTimerId;
        nextTimerId += 1;
        pending.set(timerId, { callback, delayMs });
        return timerId;
      },
      clearTimeout(timerId: number) {
        pending.delete(timerId);
      },
    },
    nextDelay(): number | null {
      return [...pending.values()][0]?.delayMs ?? null;
    },
    captureNextCallback(): () => void {
      const next = pending.entries().next().value as
        [number, { callback: () => void; delayMs: number }] | undefined;
      if (!next) {
        throw new Error("Expected a pending recovery timer");
      }

      pending.delete(next[0]);
      return next[1].callback;
    },
    async runNext(): Promise<void> {
      const next = pending.entries().next().value as
        [number, { callback: () => void; delayMs: number }] | undefined;
      if (!next) {
        throw new Error("Expected a pending recovery timer");
      }

      pending.delete(next[0]);
      next[1].callback();
      await flushAsyncWork();
    },
  };
}

function createVisibilityDocument(initialState: DocumentVisibilityState) {
  let visibilityState = initialState;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const fixture = {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(eventName: string, listener: EventListenerOrEventListenerObject) {
      if (eventName === "visibilitychange") {
        listeners.add(listener);
      }
    },
    removeEventListener(eventName: string, listener: EventListenerOrEventListenerObject) {
      if (eventName === "visibilitychange") {
        listeners.delete(listener);
      }
    },
  } as unknown as Document;

  return {
    document: fixture,
    listenerCount: () => listeners.size,
    setVisibility(nextState: DocumentVisibilityState) {
      visibilityState = nextState;
      const event = { type: "visibilitychange" } as Event;
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener.call(fixture, event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
  };
}

function createRoomSnapshots() {
  const participants = Array.from({ length: 5 }, function callback(_, index) {
    return {
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
      role: "participant",
      ready: true,
      connected: true,
      joinedAtMs: index + 1,
    };
  });
  const firstBracket = createTournamentBracketState(
    participants.map(function mapItem({ playerId, displayName }) {
      return { playerId, displayName };
    }),
    1,
  );
  const firstMatch = getReadyTournamentMatches(firstBracket)[0];

  if (!firstMatch) {
    throw new Error("Expected the first tournament match");
  }

  const nextBracket = recordTournamentMatchResult(
    firstBracket,
    firstMatch.matchId,
    firstMatch.participantIds[0],
    { reason: "faint", completedAtMs: 2_000 },
  );
  const room = (
    revision: number,
    bracket: typeof firstBracket,
    competitive?: CompetitiveProjection,
  ) => {
    const activeMatchId = getReadyTournamentMatches(bracket)[0]?.matchId ?? null;

    return {
      roomCode: "ROOM01",
      visibility: "private",
      hostPlayerId: "player-1",
      revision,
      expiresAtMs: 253_402_300_799_999,
      status: "tournament",
      participants,
      partySnapshots: {},
      round: {
        index: 1,
        phase: "tournament",
        durationMs: 300_000,
        startedAtMs: 1_000,
        endsAtMs: 301_000,
      },
      tournament: {
        version: 2,
        bracket,
        activeMatchId,
        activeMatchAuthority: competitive ? "server" : "casual",
        cumulativeScores: {},
      },
      finalStandings: [],
      ...(competitive ? { competitive } : {}),
    };
  };
  const nextMatch = getReadyTournamentMatches(nextBracket)[0];

  if (!nextMatch) {
    throw new Error("Expected the next tournament match");
  }

  const activeCompetitive = createCompetitiveProjection(
    nextMatch.matchId,
    nextMatch.participantIds,
  );
  const oldCompetitive = createCompetitiveProjection(
    firstMatch.matchId,
    firstMatch.participantIds,
    "11111111-1111-4111-8111-111111111111",
  );
  const oldTerminal = createTerminal(oldCompetitive.playerIds);
  const completedOldCompetitive = {
    ...oldCompetitive,
    currentTurn: 1,
    status: "completed" as const,
    currentState: { ...oldCompetitive.currentState, turn: 1, terminal: oldTerminal },
    terminal: oldTerminal,
    terminalEventId: "terminal-event-room01-revision-50",
    terminalRoomRevision: 50,
  };
  const latest = room(50, nextBracket, activeCompetitive);

  return {
    initial: room(15, firstBracket),
    activeOld: room(16, firstBracket, oldCompetitive),
    latest,
    terminalTransition: {
      terminalEventId: completedOldCompetitive.terminalEventId,
      terminalRoomRevision: completedOldCompetitive.terminalRoomRevision,
      projection: completedOldCompetitive,
    },
    transitionLatest: {
      ...latest,
      competitiveTransitions: [
        {
          terminalEventId: completedOldCompetitive.terminalEventId,
          terminalRoomRevision: completedOldCompetitive.terminalRoomRevision,
          projection: completedOldCompetitive,
        },
      ],
    },
    completedOldCompetitive,
    legacyCompletedOldCompetitive: {
      ...completedOldCompetitive,
      terminalEventId: undefined,
      terminalRoomRevision: undefined,
    },
    completedLatest: room(50, nextBracket, {
      ...activeCompetitive,
      status: "completed",
      terminal: createTerminal(activeCompetitive.playerIds),
      currentState: {
        ...activeCompetitive.currentState,
        terminal: createTerminal(activeCompetitive.playerIds),
      },
    }),
  };
}

function createRoundStartedRoomSnapshot(
  base: ReturnType<typeof createRoomSnapshots>["initial"],
  revision: number,
  endsAtMs: number,
) {
  return {
    ...base,
    revision,
    status: "round-started" as const,
    round: {
      ...base.round,
      phase: "round-started" as const,
      startedAtMs: Math.max(0, endsAtMs - base.round.durationMs),
      endsAtMs,
    },
  };
}

function createWaitingRoomSnapshot(
  base: ReturnType<typeof createRoomSnapshots>["initial"],
  participants = base.participants,
) {
  return {
    ...base,
    revision: 20,
    status: "waiting" as const,
    hostPlayerId: participants[0]?.playerId ?? null,
    participants,
    round: {
      ...base.round,
      phase: "waiting" as const,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      ...base.tournament,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
    },
  };
}

function createCompletedRoomSnapshot(
  base: ReturnType<typeof createRoundStartedRoomSnapshot>,
  revision: number,
) {
  return {
    ...base,
    revision,
    status: "completed" as const,
    round: {
      ...base.round,
      phase: "completed" as const,
    },
  };
}

function reverseNestedObjectKeyOrder<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(reverseNestedObjectKeyOrder) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(function mapItem([key, nestedValue]) {
          return [key, reverseNestedObjectKeyOrder(nestedValue)];
        }),
    ) as T;
  }

  return value;
}

function createEightTerminalTransitionPage() {
  const participants = Array.from({ length: 6 }, function callback(_, index) {
    return {
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
      role: "participant",
      ready: true,
      connected: true,
      joinedAtMs: index + 1,
    };
  });
  let bracket = createTournamentBracketState(
    participants.map(function mapItem({ playerId, displayName }) {
      return { playerId, displayName };
    }),
    1,
  );

  while (bracket.status !== "completed") {
    const match = getReadyTournamentMatches(bracket)[0];
    if (!match) {
      throw new Error("Expected a ready tournament match");
    }
    bracket = recordTournamentMatchResult(bracket, match.matchId, match.participantIds[0], {
      reason: "faint",
      completedAtMs: 2_000,
    });
  }

  const [firstRound, secondRound, thirdRound] = bracket.completedRounds;
  const firstRoundMatch = firstRound?.matches[0];
  const secondRoundMatches = secondRound?.matches;
  const thirdRoundMatch = thirdRound?.matches[0];
  if (
    !firstRoundMatch ||
    !secondRoundMatches ||
    secondRoundMatches.length !== 2 ||
    !thirdRoundMatch
  ) {
    throw new Error("Expected a completed six-player tournament bracket");
  }

  const copyCompletedMatch = (
    source: typeof firstRoundMatch,
    roundNumber: number,
    matchNumber: number,
  ) => ({
    ...source,
    matchId: `game-round-1-bracket-${roundNumber}-match-${matchNumber}`,
    roundNumber,
    matchNumber,
    participantIds: [...source.participantIds] as [string, string],
  });
  const thirdRoundSecondMatch = copyCompletedMatch(firstRoundMatch, 3, 2);
  const fourthRoundMatches = [
    copyCompletedMatch(secondRoundMatches[0], 4, 1),
    copyCompletedMatch(secondRoundMatches[1], 4, 2),
  ];
  const pagedBracket = {
    ...bracket,
    completedRounds: [
      firstRound,
      secondRound,
      {
        ...thirdRound,
        matches: [thirdRoundMatch, thirdRoundSecondMatch],
        slots: [
          { kind: "match" as const, matchId: thirdRoundMatch.matchId },
          { kind: "match" as const, matchId: thirdRoundSecondMatch.matchId },
        ],
      },
      {
        roundNumber: 4,
        matches: fourthRoundMatches,
        byes: [],
        slots: fourthRoundMatches.map(function mapItem(match) {
          return {
            kind: "match" as const,
            matchId: match.matchId,
          };
        }),
      },
    ],
  };
  const competitiveTransitions = pagedBracket.completedRounds
    .flatMap(function mapItem(round) {
      return round.matches;
    })
    .map(function mapItem(match, index) {
      const terminal = createTerminal(match.participantIds);
      const terminalRoomRevision = 16 + index;
      const projection = {
        ...createCompetitiveProjection(
          match.matchId,
          match.participantIds,
          `123e4567-e89b-42d3-a456-${String(index + 1).padStart(12, "0")}`,
        ),
        currentTurn: 1,
        status: "completed" as const,
        currentState: {
          ...createCompetitiveProjection(match.matchId, match.participantIds).currentState,
          turn: 1,
          terminal,
        },
        terminal,
        terminalEventId: `terminal-page-${terminalRoomRevision}`,
        terminalRoomRevision,
      };

      return {
        terminalEventId: projection.terminalEventId,
        terminalRoomRevision,
        projection,
      };
    });

  if (competitiveTransitions.length !== 8) {
    throw new Error("Expected exactly eight terminal transitions");
  }

  return {
    roomCode: "ROOM01",
    visibility: "private",
    hostPlayerId: "player-1",
    revision: 100,
    expiresAtMs: 253_402_300_799_999,
    status: "tournament",
    participants,
    partySnapshots: {},
    round: {
      index: 1,
      phase: "tournament",
      durationMs: 300_000,
      startedAtMs: 1_000,
      endsAtMs: 301_000,
    },
    tournament: {
      version: 2,
      bracket: pagedBracket,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
    competitiveTransitions,
  };
}

function createCompetitiveProjection(
  bracketMatchId: string,
  playerIds: [string, string],
  matchId = "123e4567-e89b-42d3-a456-426614174000",
): CompetitiveProjection {
  return {
    matchId,
    bracketMatchId,
    kind: "tournament-unranked",
    assignmentRevision: 1,
    rulesetVersion: 2,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 0,
    turnEndsAtMs: Date.now() + 30_000,
    status: "active",
    playerIds,
    stateHash: "b".repeat(64),
    currentState: {
      rulesetVersion: 2,
      turn: 0,
      participantIds: playerIds,
      playersById: Object.fromEntries(
        playerIds.map(function mapItem(playerId) {
          return [
            playerId,
            {
              playerId,
              activeSlotIndex: 0,
              team: [
                {
                  slotIndex: 0,
                  speciesId: playerId === playerIds[0] ? 7 : 158,
                  level: playerId === playerIds[0] ? 11 : 13,
                  maxHp: 34,
                  currentHp: 34,
                  status: "normal",
                  statStages: {
                    attack: 0,
                    defense: 0,
                    specialAttack: 0,
                    specialDefense: 0,
                    speed: 0,
                    accuracy: 0,
                    evasion: 0,
                  },
                  moves: [{ moveId: 55, pp: 25 }],
                },
              ],
            },
          ];
        }),
      ),
      terminal: null,
    },
    submittedPlayerIds: [],
    terminal: null,
  };
}

function createTerminal(playerIds: ReadonlyArray<string>) {
  const winnerPlayerId = playerIds[0];
  const loserPlayerId = playerIds[1];

  if (!winnerPlayerId || !loserPlayerId) {
    throw new Error("Expected two competitive players");
  }

  return {
    winnerPlayerId,
    loserPlayerId,
    reason: "faint" as const,
    scoreByPlayerId: {
      [winnerPlayerId]: 100 as const,
      [loserPlayerId]: 50 as const,
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for server room state");
    }

    await new Promise(function resolvePromise(resolve) {
      return setTimeout(resolve, 10);
    });
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>(function resolvePromise(resolve) {
    return setImmediate(resolve);
  });
}

function createStorage(values: Map<string, string>): Storage {
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createEmptyStorage(): Storage {
  return createStorage(new Map());
}

test("서버 방 신원은 localStorage로 이전하고 계정별로 격리한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>([
    [
      "poke-lounge:server-room-identity",
      JSON.stringify({ sessionId: "legacy-session", playerId: "legacy-player" }),
    ],
  ]);

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://web.test/game", search: "" },
        localStorage: {
          getItem(key: string) {
            return localValues.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            localValues.set(key, value);
          },
          removeItem(key: string) {
            localValues.delete(key);
          },
        },
        sessionStorage: {
          getItem(key: string) {
            return sessionValues.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            sessionValues.set(key, value);
          },
          removeItem(key: string) {
            sessionValues.delete(key);
          },
        },
      },
    });
    const { createServerRoom } = await import("./server-room");
    const accountARoom = createServerRoom({ roomId: "ROOM01", accountId: "account-a" });
    const accountASessionId = accountARoom.sessionId;
    accountARoom.dispose();

    const accountBRoom = createServerRoom({ roomId: "ROOM01", accountId: "account-b" });
    assert.notEqual(accountBRoom.sessionId, accountASessionId);
    accountBRoom.dispose();

    const restoredAccountARoom = createServerRoom({ roomId: "ROOM01", accountId: "account-a" });
    assert.equal(accountASessionId, "legacy-session");
    assert.equal(restoredAccountARoom.sessionId, accountASessionId);
    assert.equal(sessionValues.has("poke-lounge:server-room-identity"), false);
    assert.equal(localValues.has("poke-lounge:server-room-identity:account-a"), true);
    restoredAccountARoom.dispose();
  } finally {
    restoreWindow(originalWindow);
  }
});

test("완료 방은 새로고침 복구 대상으로 보존하고 closed에서 제거한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...timers.window,
      localStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          values.set(key, value);
        },
        removeItem(key: string) {
          values.delete(key);
        },
      },
      sessionStorage: createEmptyStorage(),
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom, readStoredServerRoomResume } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: async () => jsonResponse(snapshots.initial),
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return readStoredServerRoomResume()?.roomCode === "ROOM01";
    });

    const completed = createCompletedRoomSnapshot(
      createRoundStartedRoomSnapshot(snapshots.initial, 16, 301_000),
      17,
    );
    socket.pushSnapshot(completed);

    assert.deepEqual(readStoredServerRoomResume(), { roomCode: "ROOM01" });
    assert.equal(values.has("poke-lounge:server-room-identity"), true);

    socket.pushSnapshot({ ...completed, revision: 18, status: "closed" });

    assert.equal(readStoredServerRoomResume(), null);
    assert.equal(values.has("poke-lounge:server-room-identity"), false);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("브라우저 종료 뒤 대기실 자리가 만료돼도 저장 identity로 한 번 재입장한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  const values = new Map<string, string>([
    [
      "poke-lounge:server-room-identity",
      JSON.stringify({
        sessionId: "session-1",
        playerId: "player-1",
        activeRoom: { roomCode: "ROOM01", expiresAtMs: 253_402_300_799_999 },
      }),
    ],
  ]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...timers.window,
      localStorage: createStorage(values),
      sessionStorage: createEmptyStorage(),
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const waiting = createWaitingRoomSnapshot(snapshots.initial, []);
    const rejoined = createWaitingRoomSnapshot(snapshots.initial, [
      ...waiting.participants,
      { ...snapshots.initial.participants[0], ready: false },
    ]);
    rejoined.revision = waiting.revision + 1;
    const joinBodies: unknown[] = [];
    let joined = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.endsWith("/join")) {
        joinBodies.push(JSON.parse(String(init?.body)));
        joined = true;
        return jsonResponse(rejoined, 201);
      }
      return jsonResponse(joined ? rejoined : waiting);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      resumeRoom: true,
      sharedWorldOnly: true,
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return joinBodies.length === 1 && socket.subscriptions().length > 0;
    });

    assert.deepEqual(joinBodies, [
      { playerId: "player-1", sessionId: "session-1", displayName: "Player 1" },
    ]);
    assert.equal(room.sessionId, "session-1");
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("이전 게임 라운드 terminal은 다음 라운드 bracket 초기화 뒤에도 적용한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    const competitiveStates: RoomEvent["COMPETITIVE_STATE"][] = [];
    const tournamentStates: RoomEvent["TOURNAMENT_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return competitiveStates.push(payload);
    });
    room.on("TOURNAMENT_STATE", function handleEvent(payload) {
      return tournamentStates.push(payload);
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    socket.pushSnapshot({
      roomCode: "ROOM01",
      visibility: "private",
      hostPlayerId: "player-1",
      revision: 51,
      expiresAtMs: 253_402_300_799_999,
      status: "round-started",
      participants: snapshots.initial.participants,
      partySnapshots: snapshots.initial.partySnapshots,
      round: {
        index: 2,
        phase: "round-started",
        durationMs: 300_000,
        startedAtMs: 3_000,
        endsAtMs: 303_000,
      },
      tournament: {
        version: 2,
        bracket: null,
        activeMatchId: null,
        activeMatchAuthority: null,
        cumulativeScores: {},
      },
      finalStandings: [],
      competitiveTransitions: [snapshots.terminalTransition],
    });

    assert.equal(competitiveStates.at(-1)?.projection.status, "completed");
    assert.equal(tournamentStates.at(-1)?.roundIndex, 2);
    assert.equal(tournamentStates.at(-1)?.roomStatus, "round-started");
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("전투 중 WorldScene 재연결은 잠긴 party snapshot을 다시 제출하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let partyRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.endsWith("/party-snapshot")) {
        partyRequests += 1;
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      sharedWorldOnly: true,
      competitiveRoundsEnabled: true,
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    const snapshot = createPlayerSnapshot();
    room.connect(snapshot);
    await waitFor(function waitForCondition() {
      return partyRequests === 1;
    });

    room.connect(snapshot);
    await flushAsyncWork();

    assert.equal(partyRequests, 1);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("명시적 leave는 revision conflict의 최신 revision으로 한 번 재시도한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  const values = new Map<string, string>([
    [
      "poke-lounge:server-room-identity",
      JSON.stringify({ sessionId: "session-1", playerId: "player-1" }),
    ],
  ]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...timers.window,
      localStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          values.set(key, value);
        },
        removeItem(key: string) {
          values.delete(key);
        },
      },
      sessionStorage: createEmptyStorage(),
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const leaveRequests: Array<{ idempotencyKey: string; revision: string }> = [];
    let ready = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.pathname.endsWith("/leave")) {
        return jsonResponse(snapshots.initial);
      }

      const headers = new Headers(init?.headers);
      leaveRequests.push({
        idempotencyKey: headers.get("X-Idempotency-Key") ?? "",
        revision: headers.get("If-Match-Revision") ?? "",
      });
      if (leaveRequests.length === 1) {
        return jsonResponse(
          {
            statusCode: 409,
            code: "POKE_LOUNGE_REVISION_CONFLICT",
            message: "Poke Lounge room revision conflict",
            snapshot: { ...snapshots.initial, revision: 16 },
          },
          409,
        );
      }

      return jsonResponse({ ...snapshots.initial, revision: 17 }, 201);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    await room.leave?.();

    assert.deepEqual(
      leaveRequests.map(function mapItem(request) {
        return request.revision;
      }),
      ["15", "16"],
    );
    assert.equal(
      new Set(
        leaveRequests.map(function mapItem(request) {
          return request.idempotencyKey;
        }),
      ).size,
      2,
    );
    assert.equal(values.has("poke-lounge:server-room-identity"), false);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("E2E socket transport diagnostics는 query guard와 sanitized state transition을 유지한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom, getServerRoomTransportDiagnosticsForE2e } =
      await import("./server-room");
    const nonE2eTimers = createManualRecoveryTimers();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: nonE2eTimers.window,
    });
    const nonE2eRoom = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      socketFactory: () => createSocket(),
    });

    assert.equal(getServerRoomTransportDiagnosticsForE2e(nonE2eRoom), null);
    assert.equal(
      "getRoomTransportDiagnosticsForE2e" in (nonE2eRoom as unknown as Record<string, unknown>),
      false,
    );
    nonE2eRoom.dispose();

    const timers = createManualRecoveryTimers("?e2e=1");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: timers.window,
    });
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let configuredTransports: string[] | null = null;
    let tryAllTransports = false;
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: (_url, socketOptions) => {
        configuredTransports = [...socketOptions.transports];
        tryAllTransports = socketOptions.tryAllTransports;
        return socket;
      },
    });
    const connectionStore = createGameStateStore();
    connectionStore.setSession({
      sessionId: room.sessionId,
      roomId: room.roomId,
      connectionStatus: "connecting",
    });
    const connectionStatuses: RoomEvent["CONNECTION_STATUS"]["connectionStatus"][] = [];
    room.on("CONNECTION_STATUS", function handleEvent({ connectionStatus }) {
      connectionStatuses.push(connectionStatus);
      connectionStore.setSession({
        sessionId: room?.sessionId ?? null,
        roomId: room?.roomId ?? null,
        connectionStatus,
      });
    });
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.lastAppliedTerminalRevision, null);
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    assert.deepEqual(configuredTransports, ["polling", "websocket"]);
    assert.equal(tryAllTransports, true);
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return diagnostics?.socketConnected === true && diagnostics.recoveryInFlight === false;
    });

    assert.deepEqual(getServerRoomTransportDiagnosticsForE2e(room), {
      socketConnected: true,
      transportState: "connected",
      activeTransport: "websocket",
      recoveryAttempt: 0,
      recoveryInFlight: false,
      recoveryTimerScheduled: false,
      subscriptionFailed: false,
      lastAppliedTerminalRevision: snapshots.initial.revision,
      lastAppliedWorldSeq: null,
      worldEpoch: null,
      lastSocketErrorKind: null,
      lastSocketConnectErrorClass: null,
      lastRecoveryFailureKind: null,
    });
    socket.setActiveTransport("websocket");
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.activeTransport, "websocket");
    socket.setActiveTransport("custom-transport-with-private-details");
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.activeTransport, "unknown");
    socket.setActiveTransport("websocket");
    assert.deepEqual(connectionStatuses, ["connecting", "online"]);
    assert.equal(connectionStore.getState().session.connectionStatus, "online");

    socket.pushSnapshot(snapshots.transitionLatest);
    assert.equal(
      getServerRoomTransportDiagnosticsForE2e(room)?.lastAppliedTerminalRevision,
      snapshots.terminalTransition.terminalRoomRevision,
    );

    socket.failConnection({
      name: "SocketTransportError",
      message: "WebSocket failed for ws://api.test:4567/socket.io?token=opaque-token",
      description: "session-1",
    });
    assert.deepEqual(getServerRoomTransportDiagnosticsForE2e(room), {
      socketConnected: false,
      transportState: "disconnected",
      activeTransport: null,
      recoveryAttempt: 1,
      recoveryInFlight: false,
      recoveryTimerScheduled: true,
      subscriptionFailed: true,
      lastAppliedTerminalRevision: snapshots.terminalTransition.terminalRoomRevision,
      lastAppliedWorldSeq: null,
      worldEpoch: null,
      lastSocketErrorKind: "connect_error",
      lastSocketConnectErrorClass: "websocket_error",
      lastRecoveryFailureKind: null,
    });
    assert.equal(connectionStatuses.at(-1), "offline");
    assert.equal(connectionStore.getState().session.connectionStatus, "offline");

    socket.setActiveTransport("polling");
    socket.reconnectFromServer();
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return diagnostics?.socketConnected === true && diagnostics.recoveryInFlight === false;
    });
    assert.deepEqual(getServerRoomTransportDiagnosticsForE2e(room), {
      socketConnected: true,
      transportState: "connected",
      activeTransport: "polling",
      recoveryAttempt: 0,
      recoveryInFlight: false,
      recoveryTimerScheduled: false,
      subscriptionFailed: false,
      lastAppliedTerminalRevision: snapshots.terminalTransition.terminalRoomRevision,
      lastAppliedWorldSeq: null,
      worldEpoch: null,
      lastSocketErrorKind: "connect_error",
      lastSocketConnectErrorClass: "websocket_error",
      lastRecoveryFailureKind: null,
    });
    assert.equal(connectionStatuses.at(-1), "online");
    assert.equal(connectionStore.getState().session.connectionStatus, "online");
    socket.setActiveTransport("websocket");

    const additionalConnectErrorClasses: Array<
      [error: unknown, expected: "timeout" | "server_reject" | "cors" | "unknown"]
    > = [
      [{ description: "connection timed out" }, "timeout"],
      [{ message: "unauthorized room subscription" }, "server_reject"],
      [{ name: "CorsError" }, "cors"],
      [{ name: "opaque transport failure" }, "unknown"],
    ];
    for (const [error, expected] of additionalConnectErrorClasses) {
      socket.failConnection(error);
      assert.equal(
        getServerRoomTransportDiagnosticsForE2e(room)?.lastSocketConnectErrorClass,
        expected,
      );
      socket.reconnectFromServer();
      await waitFor(function waitForCondition() {
        const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
        return diagnostics?.socketConnected === true && diagnostics.recoveryInFlight === false;
      });
      assert.equal(
        getServerRoomTransportDiagnosticsForE2e(room)?.lastSocketConnectErrorClass,
        expected,
      );
    }

    socket.disconnectFromServer();
    assert.equal(connectionStatuses.at(-1), "offline");
    assert.equal(connectionStore.getState().session.connectionStatus, "offline");
    assert.deepEqual(getServerRoomTransportDiagnosticsForE2e(room), {
      socketConnected: false,
      transportState: "disconnected",
      activeTransport: null,
      recoveryAttempt: 1,
      recoveryInFlight: false,
      recoveryTimerScheduled: true,
      subscriptionFailed: false,
      lastAppliedTerminalRevision: snapshots.terminalTransition.terminalRoomRevision,
      lastAppliedWorldSeq: null,
      worldEpoch: null,
      lastSocketErrorKind: "disconnect",
      lastSocketConnectErrorClass: "unknown",
      lastRecoveryFailureKind: null,
    });
    socket.pushSubscriptionError();
    assert.equal(
      getServerRoomTransportDiagnosticsForE2e(room)?.lastSocketErrorKind,
      "subscription_error",
    );
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.subscriptionFailed, true);

    socket.pushSnapshot({ malformed: true });
    const invalidSnapshotDiagnostics = getServerRoomTransportDiagnosticsForE2e(room);
    assert.deepEqual(Object.keys(invalidSnapshotDiagnostics ?? {}).sort(), [
      "activeTransport",
      "lastAppliedTerminalRevision",
      "lastAppliedWorldSeq",
      "lastRecoveryFailureKind",
      "lastSocketConnectErrorClass",
      "lastSocketErrorKind",
      "recoveryAttempt",
      "recoveryInFlight",
      "recoveryTimerScheduled",
      "socketConnected",
      "subscriptionFailed",
      "transportState",
      "worldEpoch",
    ]);
    assert.equal(invalidSnapshotDiagnostics?.lastSocketErrorKind, "invalid_snapshot");
    assert.equal(invalidSnapshotDiagnostics?.lastSocketConnectErrorClass, "unknown");
    const serializedDiagnostics = JSON.stringify(invalidSnapshotDiagnostics);
    for (const rawValue of [
      "ROOM01",
      "player-1",
      "session-1",
      "api.test",
      "opaque-token",
      "SocketTransportError",
      "custom-transport-with-private-details",
    ]) {
      assert.equal(serializedDiagnostics.includes(rawValue), false);
    }
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("round 종료 시각이 되면 authoritative GET으로 완료 상태를 반영한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const deadline = Date.now() + 10_000;
    const roundStarted = createRoundStartedRoomSnapshot(snapshots.initial, 16, deadline);
    const completed = createCompletedRoomSnapshot(roundStarted, 17);
    let ready = false;
    let clockArmed = false;
    let clockRefreshes = 0;
    let latestRoundPhase: RoomEvent["TOURNAMENT_STATE"]["roomRound"]["phase"] | null = null;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      const isClockRefresh =
        clockArmed && (init?.method ?? "GET") === "GET" && !url.searchParams.has("afterRevision");

      if (isClockRefresh) {
        clockRefreshes += 1;
        return jsonResponse(completed);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.on("TOURNAMENT_STATE", function handleEvent({ roomRound }) {
      latestRoundPhase = roomRound.phase;
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    clockArmed = true;
    socket.pushSnapshot(roundStarted);
    const scheduledDelay = timers.nextDelay();
    assert.notEqual(scheduledDelay, null);
    assert.ok((scheduledDelay ?? 0) > 0 && (scheduledDelay ?? 0) <= 10_000);

    await timers.runNext();

    assert.equal(clockRefreshes, 1);
    assert.equal(latestRoundPhase, "completed");
    assert.equal(timers.nextDelay(), null);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("round 종료 GET이 같은 상태를 반환하면 bounded backoff로 다시 확인한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const roundStarted = createRoundStartedRoomSnapshot(snapshots.initial, 16, Date.now());
    let ready = false;
    let clockArmed = false;
    let clockRefreshes = 0;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      const isClockRefresh =
        clockArmed && (init?.method ?? "GET") === "GET" && !url.searchParams.has("afterRevision");

      if (isClockRefresh) {
        clockRefreshes += 1;
        return jsonResponse(roundStarted);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    clockArmed = true;
    socket.pushSnapshot(roundStarted);
    assert.equal(timers.nextDelay(), 0);
    await timers.runNext();
    assert.equal(clockRefreshes, 1);
    assert.equal(timers.nextDelay(), 250);

    await timers.runNext();
    assert.equal(clockRefreshes, 2);
    assert.equal(timers.nextDelay(), 500);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("round 종료 상태를 받은 참가자는 준비 확인을 서버에 보낸다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const roundStarted = {
      ...createRoundStartedRoomSnapshot(snapshots.initial, 16, Date.now()),
      participants: snapshots.initial.participants.map(function mapItem(participant) {
        return {
          ...participant,
          ready: false,
        };
      }),
    };
    const ownReady = {
      ...roundStarted,
      revision: 17,
      participants: roundStarted.participants.map(function mapItem(participant) {
        return {
          ...participant,
          ready: participant.playerId === "player-1",
        };
      }),
    };
    let initialPartySynced = false;
    let clockArmed = false;
    let readyRequestBody: unknown = null;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      initialPartySynced ||= url.pathname.endsWith("/party-snapshot");

      if (clockArmed && url.pathname.endsWith("/round-ready")) {
        readyRequestBody = JSON.parse(String(init?.body));
        assert.equal(new Headers(init?.headers).has("If-Match-Revision"), false);
        return jsonResponse(ownReady);
      }
      if (clockArmed && (init?.method ?? "GET") === "GET") {
        return jsonResponse(roundStarted);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return initialPartySynced && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    clockArmed = true;
    socket.pushSnapshot(roundStarted);
    await timers.runNext();

    assert.deepEqual(readyRequestBody, {
      playerId: "player-1",
      sessionId: "session-1",
      roundIndex: roundStarted.round.index,
    });
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("round-ready 뒤 socket 전환을 놓치면 같은 상태를 반복 확인한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const timers = createManualRecoveryTimers();
  const visibility = createVisibilityDocument("visible");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const roundStarted = {
      ...createRoundStartedRoomSnapshot(snapshots.initial, 16, Date.now()),
      participants: snapshots.initial.participants.map(function mapItem(participant) {
        return {
          ...participant,
          ready: false,
        };
      }),
    };
    const ownReady = {
      ...roundStarted,
      revision: 17,
      participants: roundStarted.participants.map(function mapItem(participant) {
        return {
          ...participant,
          ready: participant.playerId === "player-1",
        };
      }),
    };
    let initialPartySynced = false;
    let clockArmed = false;
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      initialPartySynced ||= url.pathname.endsWith("/party-snapshot");

      if (clockArmed && url.pathname.endsWith("/round-ready")) {
        return jsonResponse(ownReady);
      }
      if (clockArmed && url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
        return jsonResponse(ownReady);
      }
      if (clockArmed && (init?.method ?? "GET") === "GET") {
        return jsonResponse(roundStarted);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return initialPartySynced && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: visibility.document,
    });
    clockArmed = true;
    socket.pushSnapshot(roundStarted);
    await timers.runNext();

    assert.equal(timers.nextDelay(), 3_000);
    await timers.runNext();
    assert.equal(recoveryRequests, 1);
    timers.captureNextCallback();
    assert.equal(timers.nextDelay(), 5_000);
  } finally {
    room?.dispose();
    restoreGlobalProperty("document", originalDocument);
    restoreWindow(originalWindow);
  }
});

test("긴 round 대기는 30초로 제한되고 dispose는 stale callback도 무시한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const roundStarted = createRoundStartedRoomSnapshot(
      snapshots.initial,
      16,
      Date.now() + 120_000,
    );
    let ready = false;
    let clockArmed = false;
    let clockRefreshes = 0;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (
        clockArmed &&
        (init?.method ?? "GET") === "GET" &&
        !url.searchParams.has("afterRevision")
      ) {
        clockRefreshes += 1;
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    clockArmed = true;
    socket.pushSnapshot(roundStarted);
    assert.equal(timers.nextDelay(), 30_000);
    const staleCallback = timers.captureNextCallback();
    room.dispose();
    staleCallback();
    await flushAsyncWork();

    assert.equal(clockRefreshes, 0);
    assert.equal(timers.nextDelay(), null);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("응답 없는 server room fetch는 제한 시간 뒤 중단되고 재시도 대기 상태가 된다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const request = { signal: null as AbortSignal | null };
    const fetchFixture: typeof fetch = async (_input, init) => {
      request.signal = init?.signal ?? null;
      return await new Promise<Response>(function resolvePromise() {});
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      requestTimeoutMs: 25,
      socketFactory: () => createSocket(),
    });
    room.connect(createPlayerSnapshot());

    await waitFor(function waitForCondition() {
      return timers.nextDelay() === 25;
    });
    await timers.runNext();

    assert.equal(request.signal?.aborted, true);
    assert.equal(timers.nextDelay(), 250);
    room.dispose();
    assert.equal(timers.nextDelay(), null);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("header 뒤 멈춘 response body도 같은 제한 시간으로 중단한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const request = { signal: null as AbortSignal | null };
    let bodyReadStarted = false;
    const stalledResponse = new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(stalledResponse, "text", {
      configurable: true,
      value: () => {
        bodyReadStarted = true;
        return new Promise<string>(function resolvePromise() {});
      },
    });
    const fetchFixture: typeof fetch = async (_input, init) => {
      request.signal = init?.signal ?? null;
      return stalledResponse;
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      requestTimeoutMs: 25,
      socketFactory: () => createSocket(),
    });
    room.connect(createPlayerSnapshot());

    await waitFor(function waitForCondition() {
      return bodyReadStarted && timers.nextDelay() === 25;
    });
    await timers.runNext();

    assert.equal(request.signal?.aborted, true);
    assert.equal(timers.nextDelay(), 250);
    room.dispose();
    assert.equal(timers.nextDelay(), null);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("reconnect 뒤 clear된 queued recovery timer는 추가 GET을 dispatch하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let ready = false;
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0 && recoveryRequests > 0;
    });
    await flushAsyncWork();

    socket.disconnectFromServer();
    assert.equal(timers.nextDelay(), 250);
    const queuedRecoveryTimer = timers.captureNextCallback();
    const recoveryCountBeforeReconnect = recoveryRequests;

    socket.reconnectFromServer();
    await waitFor(function waitForCondition() {
      return recoveryRequests === recoveryCountBeforeReconnect + 1;
    });
    await flushAsyncWork();
    const recoveryCountAfterReconnect = recoveryRequests;

    queuedRecoveryTimer();
    await flushAsyncWork();
    assert.equal(recoveryRequests, recoveryCountAfterReconnect);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("online action stale watchdog은 GET 실패를 socket failure로 승격하지 않고 backoff한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const timers = createManualRecoveryTimers();
  const visibility = createVisibilityDocument("visible");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: visibility.document,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const initialProjection = {
      ...snapshots.activeOld.competitive!,
      turnEndsAtMs: Date.now() + 60_000,
    };
    const actionPlayerId = initialProjection.playerIds[0];
    const initialRoom = { ...snapshots.activeOld, competitive: initialProjection };
    const actionProjection = {
      ...initialProjection,
      submittedPlayerIds: [actionPlayerId],
    };
    const nextProjection = {
      ...actionProjection,
      currentTurn: 1,
      turnEndsAtMs: Date.now() + 90_000,
      stateHash: "c".repeat(64),
      currentState: { ...actionProjection.currentState, turn: 1 },
      submittedPlayerIds: [],
    };
    const nextRoom = { ...initialRoom, competitive: nextProjection };
    let recoveryRoom = initialRoom;
    let recoveryFailuresRemaining = 0;
    let recoveryRequests = 0;
    let actionRequests = 0;
    let partySynced = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      partySynced ||= url.pathname.endsWith("/party-snapshot");
      if (url.pathname.endsWith("/session-actions")) {
        actionRequests += 1;
        return jsonResponse(actionProjection, 201);
      }
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
        if (recoveryFailuresRemaining > 0) {
          recoveryFailuresRemaining -= 1;
          throw new TypeError("online recovery failed");
        }
        return jsonResponse(recoveryRoom);
      }

      return jsonResponse(initialRoom);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: actionPlayerId,
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    const receivedTurns: number[] = [];
    let actionApplied = false;
    room.on("COMPETITIVE_STATE", function handleEvent({ projection }) {
      receivedTurns.push(projection.currentTurn);
      actionApplied ||= projection.submittedPlayerIds.includes(actionPlayerId);
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return partySynced && receivedTurns.includes(0);
    });
    await flushAsyncWork();
    const recoveryRequestsBeforeAction = recoveryRequests;
    recoveryFailuresRemaining = 1;

    room.send("COMPETITIVE_ACTION", {
      matchId: initialProjection.matchId,
      assignmentRevision: initialProjection.assignmentRevision,
      turn: initialProjection.currentTurn,
      clientCommandId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      action: { kind: "move", moveId: 55 },
    });
    await waitFor(function waitForCondition() {
      return actionRequests === 1 && actionApplied;
    });
    await flushAsyncWork();

    assert.equal(timers.nextDelay(), 3_000);
    await timers.runNext();
    await waitFor(function waitForCondition() {
      return recoveryRequests === recoveryRequestsBeforeAction + 1;
    });
    assert.equal(timers.nextDelay(), 5_000);

    await timers.runNext();
    await waitFor(function waitForCondition() {
      return recoveryRequests === recoveryRequestsBeforeAction + 2;
    });
    assert.equal(timers.nextDelay(), 5_000);

    recoveryRoom = nextRoom;
    await timers.runNext();
    await waitFor(function waitForCondition() {
      return receivedTurns.includes(1);
    });
    assert.ok((timers.nextDelay() ?? 0) > 30_000);

    visibility.setVisibility("hidden");
    assert.equal(timers.nextDelay(), null);
    visibility.setVisibility("visible");
    assert.equal(timers.nextDelay(), 0);

    socket.pushSnapshot(
      createCompletedRoomSnapshot(
        createRoundStartedRoomSnapshot(snapshots.initial, 16, Date.now() + 60_000),
        17,
      ),
    );
    assert.equal(timers.nextDelay(), null);
    assert.equal(visibility.listenerCount(), 1);

    room.dispose();
    room = null;
    assert.equal(visibility.listenerCount(), 0);
  } finally {
    room?.dispose();
    restoreGlobalProperty("document", originalDocument);
    restoreWindow(originalWindow);
  }
});

test("만료된 competitive turn 행동은 전송하지 않고 최신 room으로 복구한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const expiredProjection = {
      ...snapshots.activeOld.competitive!,
      turnEndsAtMs: Date.now() - 1,
    };
    const expiredRoom = { ...snapshots.activeOld, competitive: expiredProjection };
    let actionRequests = 0;
    let recoveryRequests = 0;
    let partySynced = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      partySynced ||= url.pathname.endsWith("/party-snapshot");
      if (url.pathname.includes("/actions")) {
        actionRequests += 1;
      }
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
      }
      return jsonResponse(expiredRoom);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: expiredProjection.playerIds[0],
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return partySynced;
    });
    socket.pushSnapshot(expiredRoom);
    const failures: RoomEvent["COMPETITIVE_ACTION_FAILED"][] = [];
    room.on("COMPETITIVE_ACTION_FAILED", function handleEvent(failure) {
      return failures.push(failure);
    });
    const recoveryRequestsBeforeAction = recoveryRequests;

    room.send("COMPETITIVE_ACTION", {
      matchId: expiredProjection.matchId,
      assignmentRevision: expiredProjection.assignmentRevision,
      turn: expiredProjection.currentTurn,
      clientCommandId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      action: { kind: "move", moveId: 55 },
    });

    await waitFor(function waitForCondition() {
      return recoveryRequests > recoveryRequestsBeforeAction;
    });
    assert.equal(actionRequests, 0);
    assert.deepEqual(failures, [
      {
        matchId: expiredProjection.matchId,
        status: null,
        message: "서버 상태를 다시 불러오는 중...",
      },
    ]);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("visibility 복귀 recovery는 중복 trigger를 합치고 새 revision에서 종료한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const timers = createManualRecoveryTimers();
  const visibility = createVisibilityDocument("hidden");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: visibility.document,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let recoverySnapshot = snapshots.initial;
    let recoveryRequests = 0;
    let partySynced = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      partySynced ||= url.pathname.endsWith("/party-snapshot");
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
        return jsonResponse(recoverySnapshot);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return partySynced && recoveryRequests > 0;
    });
    const recoveryRequestsBeforeVisibility = recoveryRequests;
    recoverySnapshot = { ...snapshots.initial, revision: 16 };

    visibility.setVisibility("visible");
    visibility.setVisibility("visible");
    assert.equal(timers.nextDelay(), 0);
    await timers.runNext();
    await waitFor(function waitForCondition() {
      return recoveryRequests === recoveryRequestsBeforeVisibility + 1;
    });

    assert.equal(timers.nextDelay(), null);
    assert.equal(visibility.listenerCount(), 1);
    room.dispose();
    room = null;
    assert.equal(visibility.listenerCount(), 0);
  } finally {
    room?.dispose();
    restoreGlobalProperty("document", originalDocument);
    restoreWindow(originalWindow);
  }
});

test("socket 미연결 recovery 성공은 polling backoff를 초기화하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket(false);
    const snapshots = createRoomSnapshots();
    let ready = false;
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    socket.failConnection();
    const expectedDelays = [250, 500, 1_000, 2_000, 4_000, 5_000];
    for (const [index, expectedDelay] of expectedDelays.entries()) {
      assert.equal(timers.nextDelay(), expectedDelay);
      await timers.runNext();
      await waitFor(function waitForCondition() {
        return recoveryRequests === index + 1;
      });
    }
    assert.equal(recoveryRequests, expectedDelays.length);
    assert.equal(timers.nextDelay(), 5_000);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("8개 terminal transition 페이지는 cursor 전진 시 즉시 다음 페이지를 요청한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket(false);
    const snapshots = createRoomSnapshots();
    const pagedTransitions = createEightTerminalTransitionPage();
    let ready = false;
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.searchParams.has("afterRevision")) {
        return jsonResponse(snapshots.initial);
      }

      recoveryRequests += 1;
      if (recoveryRequests === 1) {
        return jsonResponse(pagedTransitions);
      }

      return new Promise<Response>(function resolvePromise() {});
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    socket.failConnection();
    assert.equal(timers.nextDelay(), 250);
    await timers.runNext();
    await waitFor(function waitForCondition() {
      return recoveryRequests === 2;
    });
    assert.equal(timers.nextDelay(), 10_000);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("외부 terminal recovery가 대기 중이면 8개 페이지도 backoff로 재시도한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket(false);
    const snapshots = createRoomSnapshots();
    const pagedTransitions = createEightTerminalTransitionPage();
    const mismatchedInitial = {
      ...snapshots.initial,
      participants: snapshots.initial.participants.map(function mapItem(participant, index) {
        return index === 0 ? { ...participant, connected: false } : participant;
      }),
    };
    let ready = false;
    let recoveryRequests = 0;
    let releaseFirstRecovery: (() => void) | undefined;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.searchParams.has("afterRevision")) {
        return jsonResponse(snapshots.initial);
      }

      recoveryRequests += 1;
      if (recoveryRequests === 1) {
        return new Promise<Response>(function resolvePromise(resolve) {
          releaseFirstRecovery = function callback() {
            return resolve(jsonResponse(pagedTransitions));
          };
        });
      }

      return jsonResponse(pagedTransitions);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    socket.failConnection();
    await timers.runNext();
    await waitFor(function waitForCondition() {
      return releaseFirstRecovery !== undefined;
    });
    socket.pushSnapshot(mismatchedInitial);
    releaseFirstRecovery?.();
    await flushAsyncWork();
    await waitFor(function waitForCondition() {
      return timers.nextDelay() === 500;
    });

    assert.equal(recoveryRequests, 1);
    assert.equal(timers.nextDelay(), 500);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("persistent same-revision mismatch recovery는 즉시 재귀하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const mismatched = {
      ...snapshots.initial,
      participants: snapshots.initial.participants.map(function mapItem(participant, index) {
        return index === 0 ? { ...participant, connected: false } : participant;
      }),
    };
    let ready = false;
    let initialRecoveryCompleted = false;
    let persistentMismatchEnabled = false;
    let mismatchRecoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.searchParams.has("afterRevision")) {
        return jsonResponse(snapshots.initial);
      }
      if (!persistentMismatchEnabled) {
        initialRecoveryCompleted = true;
        return jsonResponse(snapshots.initial);
      }

      mismatchRecoveryRequests += 1;
      if (mismatchRecoveryRequests === 1) {
        return jsonResponse(mismatched);
      }
      return new Promise<Response>(function resolvePromise() {});
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && initialRecoveryCompleted;
    });
    await flushAsyncWork();

    persistentMismatchEnabled = true;
    socket.pushSnapshot(mismatched);
    await waitFor(function waitForCondition() {
      return mismatchRecoveryRequests >= 1;
    });
    await flushAsyncWork();

    assert.equal(mismatchRecoveryRequests, 1);
    assert.equal(timers.nextDelay(), 250);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("E2E recovery failure diagnostics는 원인을 분류하고 안정화 시 초기화한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?e2e=1");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom, getServerRoomTransportDiagnosticsForE2e } =
      await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const mismatched = {
      ...snapshots.initial,
      participants: snapshots.initial.participants.map(function mapItem(participant, index) {
        return index === 0 ? { ...participant, connected: false } : participant;
      }),
    };
    let recoveryMode: "valid" | "hold" | "malformed" | "server-error" = "valid";
    let releaseRecovery: ((response: Response) => void) | undefined;
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.searchParams.has("afterRevision")) {
        return jsonResponse(snapshots.initial);
      }
      if (recoveryMode === "hold") {
        return new Promise<Response>(function resolvePromise(resolve) {
          releaseRecovery = resolve;
        });
      }
      if (recoveryMode === "malformed") {
        return jsonResponse({ malformed: true });
      }
      if (recoveryMode === "server-error") {
        return jsonResponse({}, 500);
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return diagnostics?.recoveryInFlight === false;
    });

    recoveryMode = "hold";
    socket.pushSnapshot(mismatched);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind ===
        "canonical_mismatch"
      );
    });
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.subscriptionFailed, true);
    releaseRecovery?.(jsonResponse(snapshots.initial));
    recoveryMode = "valid";
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return (
        diagnostics?.recoveryInFlight === false && diagnostics.lastRecoveryFailureKind === null
      );
    });

    recoveryMode = "malformed";
    socket.pushSnapshot(mismatched);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind ===
        "recovery_parse"
      );
    });
    assert.equal(getServerRoomTransportDiagnosticsForE2e(room)?.subscriptionFailed, true);
    socket.pushSnapshot(snapshots.initial);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind === null
      );
    });

    recoveryMode = "server-error";
    socket.pushSnapshot(mismatched);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind ===
        "unknown"
      );
    });
    socket.pushSnapshot(snapshots.initial);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind === null
      );
    });

    const unsubscribe = room.on("COMPETITIVE_STATE", function handleEvent() {
      throw new Error("forced-transition-failure");
    });
    recoveryMode = "hold";
    socket.pushSnapshot(snapshots.transitionLatest);
    await waitFor(function waitForCondition() {
      return (
        getServerRoomTransportDiagnosticsForE2e(room ?? undefined)?.lastRecoveryFailureKind ===
        "transition_merge"
      );
    });
    unsubscribe();
    releaseRecovery?.(jsonResponse(snapshots.initial));
    recoveryMode = "valid";
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return (
        diagnostics?.recoveryInFlight === false && diagnostics.lastRecoveryFailureKind === null
      );
    });

    const serializedDiagnostics = JSON.stringify(getServerRoomTransportDiagnosticsForE2e(room));
    for (const rawValue of [
      "ROOM01",
      "player-1",
      "session-1",
      "api.test",
      "forced-transition-failure",
    ]) {
      assert.equal(serializedDiagnostics.includes(rawValue), false);
    }
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("same-revision 중첩 record key 순서 차이는 recovery를 시작하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?e2e=1");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom, getServerRoomTransportDiagnosticsForE2e } =
      await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const initial = {
      ...snapshots.initial,
      partySnapshots: {
        "player-1": {
          playerId: "player-1",
          displayName: "Player 1",
          updatedAtMs: 1,
        },
        "player-2": {
          playerId: "player-2",
          displayName: "Player 2",
          updatedAtMs: 2,
        },
      },
      tournament: {
        ...snapshots.initial.tournament,
        cumulativeScores: {
          "player-1": 0,
          "player-2": 0,
        },
      },
    };
    const reordered = reverseNestedObjectKeyOrder(initial);
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
      }
      return jsonResponse(initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return socket.subscriptions().length > 0 && recoveryRequests > 0;
    });
    await waitFor(function waitForCondition() {
      const diagnostics = getServerRoomTransportDiagnosticsForE2e(room ?? undefined);
      return diagnostics?.recoveryInFlight === false;
    });

    const recoveryRequestsBeforeReorderedSnapshot = recoveryRequests;
    socket.pushSnapshot(reordered);
    await flushAsyncWork();

    const diagnostics = getServerRoomTransportDiagnosticsForE2e(room);
    assert.equal(recoveryRequests, recoveryRequestsBeforeReorderedSnapshot);
    assert.equal(timers.nextDelay(), null);
    assert.equal(diagnostics?.recoveryTimerScheduled, false);
    assert.equal(diagnostics?.subscriptionFailed, false);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("같은 room revision의 경쟁전 제출과 turn 전진을 정상 적용한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let ready = false;
    let recoveryRequests = 0;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    const received: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return received.push(payload);
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });
    await flushAsyncWork();

    socket.pushSnapshot(snapshots.activeOld);
    const recoveryRequestsBeforeAdvance = recoveryRequests;
    const submittedPlayerId = snapshots.activeOld.competitive!.playerIds[0];
    const submitted = {
      ...snapshots.activeOld,
      competitive: {
        ...snapshots.activeOld.competitive!,
        submittedPlayerIds: [submittedPlayerId],
      },
    };
    socket.pushSnapshot(submitted);
    socket.pushSnapshot({
      ...submitted,
      competitive: {
        ...submitted.competitive,
        currentTurn: 1,
        currentState: { ...submitted.competitive.currentState, turn: 1 },
        stateHash: "c".repeat(64),
        submittedPlayerIds: [],
      },
    });
    await flushAsyncWork();

    assert.deepEqual(
      received.map(function mapItem({ projection }) {
        return [projection.currentTurn, projection.submittedPlayerIds];
      }),
      [
        [0, []],
        [0, [submittedPlayerId]],
        [1, []],
      ],
    );
    assert.equal(recoveryRequests, recoveryRequestsBeforeAdvance);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("지연된 경쟁전 projection은 최신 assignment와 turn 및 제출 상태를 덮지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready && socket.subscriptions().length > 0;
    });

    const turnOne = {
      ...snapshots.activeOld,
      competitive: {
        ...snapshots.activeOld.competitive!,
        currentTurn: 1,
        currentState: { ...snapshots.activeOld.competitive!.currentState, turn: 1 },
        stateHash: "c".repeat(64),
        submittedPlayerIds: [],
      },
    };
    const turnOneSubmitted = {
      ...turnOne,
      competitive: {
        ...turnOne.competitive,
        submittedPlayerIds: [turnOne.competitive.playerIds[0]],
      },
    };
    socket.pushSnapshot(turnOne);
    socket.pushSnapshot(turnOneSubmitted);

    const received: RoomEvent["COMPETITIVE_STATE"][] = [];
    const unsubscribe = room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return received.push(payload);
    });
    received.length = 0;

    const withoutCompetitive: Record<string, unknown> = { ...turnOneSubmitted };
    delete withoutCompetitive.competitive;
    socket.pushSnapshot(withoutCompetitive);
    socket.pushSnapshot(turnOne);
    socket.pushSnapshot({
      ...turnOneSubmitted,
      competitive: {
        ...turnOneSubmitted.competitive,
        status: "pending" as const,
      },
    });
    socket.pushSnapshot({
      ...turnOneSubmitted,
      competitive: {
        ...turnOneSubmitted.competitive,
        stateHash: "e".repeat(64),
      },
    });
    socket.pushSnapshot(snapshots.activeOld);

    const nextAssignment = {
      ...turnOneSubmitted,
      competitive: {
        ...snapshots.activeOld.competitive!,
        matchId: "223e4567-e89b-42d3-a456-426614174000",
        assignmentRevision: 2,
        status: "pending" as const,
      },
    };
    socket.pushSnapshot(nextAssignment);
    socket.pushSnapshot({
      ...turnOneSubmitted,
      competitive: {
        ...turnOneSubmitted.competitive,
        currentTurn: 99,
        currentState: { ...turnOneSubmitted.competitive.currentState, turn: 99 },
        stateHash: "d".repeat(64),
      },
    });

    assert.deepEqual(
      received.map(function mapItem({ projection }) {
        return [
          projection.matchId,
          projection.assignmentRevision,
          projection.currentTurn,
          projection.status,
          projection.submittedPlayerIds,
        ];
      }),
      [[nextAssignment.competitive.matchId, 2, 0, "pending", []]],
    );
    unsubscribe();

    const replayed: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return replayed.push(payload);
    });
    assert.deepEqual(
      replayed.map(function mapItem({ projection }) {
        return [projection.matchId, projection.assignmentRevision, projection.currentTurn];
      }),
      [[nextAssignment.competitive.matchId, 2, 0]],
    );
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("BattleScene은 최신 snapshot을 적용하고 WorldScene 재구독에도 replay한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const calls: string[] = [];
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      calls.push(url.pathname);

      return new Response(JSON.stringify(snapshots.initial), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    const store = createGameStateStore();
    const applyProjection = (payload: RoomEvent["TOURNAMENT_STATE"]) => {
      store.applyTournamentSnapshotFromRoom(payload, Date.now());
    };
    const unsubscribe = room.on("TOURNAMENT_STATE", applyProjection);

    room.connect({
      ...createPlayerSnapshot(),
    });
    await waitFor(function waitForCondition() {
      return calls.some(function testItem(path) {
        return path.endsWith("/party-snapshot");
      });
    });
    assert.equal(store.getState().tournament.serverProjection?.revision, 15);
    assert.equal(store.getState().tournament.serverProjection?.roomCode, "ROOM01");
    assert.deepEqual(store.getState().tournament.serverProjection?.roomRound, {
      index: 1,
      phase: "tournament",
      durationMs: 300_000,
      startedAtMs: 1_000,
      endsAtMs: 301_000,
    });
    assert.deepEqual(store.getState().tournament.serverProjection?.participants[0], {
      playerId: "player-1",
      displayName: "Player 1",
      role: "participant",
      ready: true,
      partyReady: false,
      connected: true,
      seed: 1,
    });
    assert.equal(store.getState().tournament.serverProjection?.competitionKind, "casual-unranked");

    const battleStore = createGameStateStore();
    const unsubscribeBattle = room.on("TOURNAMENT_STATE", function handleEvent(payload) {
      battleStore.applyTournamentSnapshotFromRoom(payload, Date.now());
    });
    assert.equal(battleStore.getState().tournament.serverProjection?.revision, 15);

    unsubscribe();
    socket.pushSnapshot(snapshots.latest);
    assert.equal(store.getState().tournament.serverProjection?.revision, 15);
    assert.equal(battleStore.getState().tournament.serverProjection?.revision, 50);
    assert.equal(
      battleStore.getState().tournament.serverProjection?.competitionKind,
      "tournament-unranked",
    );
    unsubscribeBattle();

    room.on("TOURNAMENT_STATE", applyProjection);

    assert.equal(store.getState().tournament.serverProjection?.revision, 50);
    assert.equal(
      store.getState().tournament.session?.tournament.completedRounds.length,
      snapshots.latest.tournament.bracket.completedRounds.length,
    );

    const assignments: RoomEvent["COMPETITIVE_ASSIGNMENT"][] = [];
    const unsubscribeAssignment = room.on("COMPETITIVE_ASSIGNMENT", function handleEvent(payload) {
      assignments.push(payload);
    });
    assert.equal(assignments.length, 1);
    assert.equal(
      assignments[0]?.projection.bracketMatchId,
      snapshots.latest.tournament.activeMatchId,
    );

    unsubscribeAssignment();
    socket.pushSnapshot(snapshots.completedLatest);
    const staleAssignments: RoomEvent["COMPETITIVE_ASSIGNMENT"][] = [];
    room.on("COMPETITIVE_ASSIGNMENT", function handleEvent(payload) {
      staleAssignments.push(payload);
    });
    assert.equal(staleAssignments.length, 1);
    assert.equal(staleAssignments[0]?.projection.matchId, snapshots.latest.competitive?.matchId);
  } finally {
    room?.dispose();
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("listener가 없는 동안 terminal을 cache하고 terminal에서 current 순서로 replay한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");

      return new Response(JSON.stringify(snapshots.initial), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    socket.pushSnapshot(snapshots.transitionLatest);

    const replayed: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return replayed.push(payload);
    });

    assert.deepEqual(
      replayed.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [
        [snapshots.completedOldCompetitive.matchId, "completed"],
        [snapshots.latest.competitive?.matchId, "active"],
      ],
    );
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("completed bracket grace는 terminal cursor로 복구하고 lower snapshot terminal만 적용한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const recoveryAfterRevisions: number[] = [];
    let ready = false;
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      const afterRevision = url.searchParams.get("afterRevision");
      if (afterRevision !== null) {
        recoveryAfterRevisions.push(Number(afterRevision));
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });
    await waitFor(function waitForCondition() {
      return socket.subscriptions().length > 0;
    });

    socket.pushSnapshot(snapshots.activeOld);
    const recoveryCountBeforeGrace = recoveryAfterRevisions.length;
    socket.pushSnapshot(snapshots.latest);
    await waitFor(function waitForCondition() {
      return recoveryAfterRevisions.length > recoveryCountBeforeGrace;
    });
    assert.equal(recoveryAfterRevisions.at(-1), 15);

    const received: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return received.push(payload);
    });
    assert.equal(received.at(-1)?.projection.matchId, snapshots.latest.competitive?.matchId);
    received.length = 0;

    const lowerProjection = {
      ...snapshots.completedOldCompetitive,
      terminalEventId: "terminal-event-room01-revision-49",
      terminalRoomRevision: 49,
    };
    socket.pushSnapshot({
      ...snapshots.transitionLatest,
      revision: 49,
      competitiveTransitions: [
        {
          terminalEventId: lowerProjection.terminalEventId,
          terminalRoomRevision: lowerProjection.terminalRoomRevision,
          projection: lowerProjection,
        },
      ],
    });
    assert.deepEqual(
      received.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [[snapshots.completedOldCompetitive.matchId, "completed"]],
    );

    const mismatchedDuplicateProjection = {
      ...snapshots.completedOldCompetitive,
      terminalEventId: "terminal-event-room01-revision-51",
      terminalRoomRevision: 51,
    };
    socket.pushSnapshot({
      ...snapshots.transitionLatest,
      revision: 51,
      competitiveTransitions: [
        {
          terminalEventId: mismatchedDuplicateProjection.terminalEventId,
          terminalRoomRevision: mismatchedDuplicateProjection.terminalRoomRevision,
          projection: mismatchedDuplicateProjection,
        },
      ],
    });

    const replayed: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return replayed.push(payload);
    });
    assert.deepEqual(
      replayed.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [
        [snapshots.completedOldCompetitive.matchId, "completed"],
        [snapshots.latest.competitive?.matchId, "active"],
      ],
    );

    socket.disconnectFromServer();
    socket.reconnectFromServer();
    assert.equal(socket.subscriptions().at(-1)?.afterRevision, 49);

    socket.pushSnapshot({
      ...snapshots.transitionLatest,
      revision: 52,
      competitiveTransitions: [
        {
          ...snapshots.terminalTransition,
          terminalEventId: "mismatched-outer-event",
        },
      ],
    });
    socket.disconnectFromServer();
    socket.reconnectFromServer();
    assert.equal(socket.subscriptions().at(-1)?.afterRevision, 49);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

for (const deliveryOrder of ["rest-first", "socket-first"] as const) {
  test(`${deliveryOrder} terminal delivery는 event ID로 dedup하고 current assignment를 보존한다`, async function testCase() {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://web.test/game", search: "" },
        setTimeout,
        clearTimeout,
      },
    });
    let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

    try {
      const { createServerRoom } = await import("./server-room");
      const socket = createSocket();
      const snapshots = createRoomSnapshots();
      let actionRequests = 0;
      let ready = false;
      const fetchFixture: typeof fetch = async input => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        ready ||= url.pathname.endsWith("/party-snapshot");
        if (url.pathname.endsWith("/competitive-seat")) {
          return jsonResponse(null, 201);
        }
        if (url.pathname.includes("/actions")) {
          actionRequests += 1;
          return jsonResponse(snapshots.completedOldCompetitive, 201);
        }

        return jsonResponse(snapshots.initial);
      };
      room = createServerRoom({
        roomId: "ROOM01",
        playerId: "player-1",
        sessionId: "session-1",
        fetch: fetchFixture,
        idToken: "id-token",
        socketFactory: () => socket,
      });
      const received: RoomEvent["COMPETITIVE_STATE"][] = [];
      room.on("COMPETITIVE_STATE", function handleEvent(payload) {
        return received.push(payload);
      });
      room.connect(createPlayerSnapshot());
      await waitFor(function waitForCondition() {
        return ready;
      });

      const submit = () =>
        room?.send("COMPETITIVE_ACTION", {
          matchId: snapshots.completedOldCompetitive.matchId,
          assignmentRevision: snapshots.completedOldCompetitive.assignmentRevision,
          turn: 0,
          clientCommandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          action: { kind: "move", moveId: 55 },
        });

      if (deliveryOrder === "rest-first") {
        submit();
        await waitFor(function waitForCondition() {
          return actionRequests === 1;
        });
        await new Promise(function resolvePromise(resolve) {
          return setTimeout(resolve, 0);
        });
        socket.pushSnapshot(snapshots.transitionLatest);
      } else {
        socket.pushSnapshot(snapshots.transitionLatest);
        submit();
        await waitFor(function waitForCondition() {
          return actionRequests === 1;
        });
        await new Promise(function resolvePromise(resolve) {
          return setTimeout(resolve, 0);
        });
      }

      assert.deepEqual(
        received.map(function mapItem({ projection }) {
          return projection.matchId;
        }),
        [snapshots.completedOldCompetitive.matchId, snapshots.latest.competitive?.matchId],
      );
    } finally {
      room?.dispose();
      restoreWindow(originalWindow);
    }
  });
}

for (const delayedSource of ["action", "seat"] as const) {
  test(`Socket next assignment 이후 지연된 old ${delayedSource} projection은 current를 덮지 않는다`, async function testCase() {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://web.test/game", search: "" },
        setTimeout,
        clearTimeout,
      },
    });
    let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

    try {
      const { createServerRoom } = await import("./server-room");
      const socket = createSocket();
      const snapshots = createRoomSnapshots();
      let delayedRequestStarted = false;
      const delayedResponseGate: { release?: () => void } = {};
      let ready = false;
      const fetchFixture: typeof fetch = async input => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        ready ||= url.pathname.endsWith("/party-snapshot");

        if (url.pathname.endsWith("/competitive-seat")) {
          if (delayedSource === "seat") {
            delayedRequestStarted = true;
            return new Promise<Response>(function resolvePromise(resolve) {
              delayedResponseGate.release = function callback() {
                return resolve(jsonResponse(snapshots.activeOld.competitive, 201));
              };
            });
          }
          return jsonResponse(null, 201);
        }
        if (url.pathname.includes("/actions")) {
          delayedRequestStarted = true;
          return new Promise<Response>(function resolvePromise(resolve) {
            delayedResponseGate.release = function callback() {
              return resolve(jsonResponse(snapshots.activeOld.competitive, 201));
            };
          });
        }

        return jsonResponse(snapshots.initial);
      };
      room = createServerRoom({
        roomId: "ROOM01",
        playerId: "player-1",
        sessionId: "session-1",
        fetch: fetchFixture,
        idToken: "id-token",
        socketFactory: () => socket,
      });
      room.connect(createPlayerSnapshot());

      if (delayedSource === "action") {
        await waitFor(function waitForCondition() {
          return ready;
        });
        socket.pushSnapshot(snapshots.activeOld);
        room.send("COMPETITIVE_ACTION", {
          matchId: snapshots.activeOld.competitive!.matchId,
          assignmentRevision: snapshots.activeOld.competitive!.assignmentRevision,
          turn: snapshots.activeOld.competitive!.currentTurn,
          clientCommandId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          action: { kind: "move", moveId: 55 },
        });
      }

      await waitFor(function waitForCondition() {
        return delayedRequestStarted && delayedResponseGate.release !== undefined;
      });
      socket.pushSnapshot(snapshots.transitionLatest);
      delayedResponseGate.release?.();
      await new Promise(function resolvePromise(resolve) {
        return setTimeout(resolve, 10);
      });

      const replayed: RoomEvent["COMPETITIVE_STATE"][] = [];
      room.on("COMPETITIVE_STATE", function handleEvent(payload) {
        return replayed.push(payload);
      });
      assert.deepEqual(
        replayed.map(function mapItem({ projection }) {
          return [projection.matchId, projection.status];
        }),
        [
          [snapshots.completedOldCompetitive.matchId, "completed"],
          [snapshots.latest.competitive?.matchId, "active"],
        ],
      );
    } finally {
      room?.dispose();
      restoreWindow(originalWindow);
    }
  });
}

test("legacy terminal metadata 응답은 current cache를 덮지 않고 room recovery로 수렴한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "http://web.test/game", search: "" },
      setTimeout,
      clearTimeout,
    },
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let actionRequests = 0;
    let recoveryRequests = 0;
    let legacyActionReturned = false;
    let ready = false;
    const metadataRecoveryGate: { release?: () => void } = {};
    const fetchFixture: typeof fetch = async input => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (url.pathname.endsWith("/competitive-seat")) {
        return jsonResponse(null, 201);
      }
      if (url.pathname.includes("/actions")) {
        actionRequests += 1;
        const legacy = { ...snapshots.completedOldCompetitive } as Record<string, unknown>;
        delete legacy.terminalEventId;
        delete legacy.terminalRoomRevision;
        legacyActionReturned = true;
        return jsonResponse(legacy, 201);
      }
      if (url.searchParams.has("afterRevision")) {
        recoveryRequests += 1;
        if (legacyActionReturned) {
          return new Promise<Response>(function resolvePromise(resolve) {
            metadataRecoveryGate.release = function callback() {
              return resolve(jsonResponse(snapshots.transitionLatest));
            };
          });
        }
        return jsonResponse(snapshots.initial);
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      idToken: "id-token",
      socketFactory: () => socket,
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });
    await waitFor(function waitForCondition() {
      return recoveryRequests > 0;
    });
    const recoveryRequestsBeforeAction = recoveryRequests;
    socket.pushSnapshot(snapshots.latest);
    const received: RoomEvent["COMPETITIVE_STATE"][] = [];
    room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return received.push(payload);
    });
    assert.deepEqual(
      received.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [[snapshots.latest.competitive?.matchId, "active"]],
    );
    received.length = 0;

    room.send("COMPETITIVE_ACTION", {
      matchId: snapshots.completedOldCompetitive.matchId,
      assignmentRevision: snapshots.completedOldCompetitive.assignmentRevision,
      turn: 0,
      clientCommandId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      action: { kind: "move", moveId: 55 },
    });
    await waitFor(function waitForCondition() {
      return actionRequests === 1;
    });
    await waitFor(function waitForCondition() {
      return metadataRecoveryGate.release !== undefined;
    });
    assert.equal(recoveryRequests, recoveryRequestsBeforeAction + 1);
    assert.equal(received.length, 0);

    const cachedBeforeRecovery: RoomEvent["COMPETITIVE_STATE"][] = [];
    const unsubscribeCacheProbe = room.on("COMPETITIVE_STATE", function handleEvent(payload) {
      return cachedBeforeRecovery.push(payload);
    });
    assert.deepEqual(
      cachedBeforeRecovery.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [[snapshots.latest.competitive?.matchId, "active"]],
    );
    unsubscribeCacheProbe();

    metadataRecoveryGate.release?.();
    await waitFor(function waitForCondition() {
      return received.length === 2;
    });
    assert.deepEqual(
      received.map(function mapItem({ projection }) {
        return [projection.matchId, projection.status];
      }),
      [
        [snapshots.completedOldCompetitive.matchId, "completed"],
        [snapshots.latest.competitive?.matchId, "active"],
      ],
    );
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("수동 ready revision conflict는 최신 snapshot을 반영하고 자동 재시도하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const readyIdempotencyKeys: string[] = [];
    const mutationBodies: unknown[] = [];
    let readyRequests = 0;
    let startRequests = 0;
    let partySynced = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      partySynced ||= url.pathname.endsWith("/party-snapshot");
      if (url.pathname.endsWith("/start")) {
        startRequests += 1;
        mutationBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse(snapshots.initial);
      }
      if (!url.pathname.endsWith("/ready")) {
        return jsonResponse(snapshots.initial);
      }

      readyRequests += 1;
      mutationBodies.push(JSON.parse(String(init?.body)));
      readyIdempotencyKeys.push(new Headers(init?.headers).get("X-Idempotency-Key") ?? "");
      if (readyRequests === 1) {
        return jsonResponse(
          {
            statusCode: 409,
            code: "POKE_LOUNGE_REVISION_CONFLICT",
            message: "revision conflict",
            snapshot: snapshots.initial,
          },
          409,
        );
      }

      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });

    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return partySynced;
    });
    await assert.rejects(room.setLobbyReady(true));
    assert.equal(readyRequests, 1);
    assert.equal(timers.nextDelay(), null);

    await room.setLobbyReady(true);
    assert.equal(readyRequests, 2);

    assert.notEqual(readyIdempotencyKeys[0], "");
    assert.notEqual(readyIdempotencyKeys[1], "");
    assert.notEqual(readyIdempotencyKeys[0], readyIdempotencyKeys[1]);
    await room.startChampionship();
    assert.equal(startRequests, 1);
    assert.deepEqual(mutationBodies, [
      { playerId: "player-1", sessionId: "session-1", ready: true },
      { playerId: "player-1", sessionId: "session-1", ready: true },
      { playerId: "player-1", sessionId: "session-1" },
    ]);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("create 응답 전 transport 실패는 같은 idempotency key로 방 생성을 복구한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?create=1&network=server");
  const fixtureWindow = timers.window as typeof timers.window & {
    history: { state: null; replaceState(state: unknown, title: string, url?: string | URL): void };
  };
  fixtureWindow.history = {
    state: null,
    replaceState(_state, _title, url) {
      if (url) {
        fixtureWindow.location.href = String(url);
      }
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fixtureWindow,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const createIdempotencyKeys: string[] = [];
    let createRequests = 0;
    let ready = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/poke-lounge/rooms") {
        createRequests += 1;
        createIdempotencyKeys.push(new Headers(init?.headers).get("X-Idempotency-Key") ?? "");
        if (createRequests <= 2) {
          throw new TypeError("connection reset after commit");
        }
      }
      ready ||= url.pathname.endsWith("/party-snapshot");
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      createRoom: true,
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });

    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return createRequests === 2;
    });
    assert.equal(timers.nextDelay(), 250);

    await timers.runNext();
    await waitFor(function waitForCondition() {
      return createRequests === 3 && ready;
    });

    assert.equal(new Set(createIdempotencyKeys).size, 1);
    assert.notEqual(createIdempotencyKeys[0], "");
    assert.equal(room.roomId, snapshots.initial.roomCode);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("공개 빠른 참가는 revision 헤더 없이 실제 방 코드를 URL에 반영한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?quick=1&network=server");
  const fixtureWindow = timers.window as typeof timers.window & {
    history: { state: null; replaceState(state: unknown, title: string, url?: string | URL): void };
  };
  fixtureWindow.history = {
    state: null,
    replaceState(_state, _title, url) {
      if (url) {
        fixtureWindow.location.href = String(url);
      }
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fixtureWindow,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const requestedPaths: string[] = [];
    const quickPlayRequest: { headers?: Headers; body?: unknown } = {};
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      requestedPaths.push(url.pathname);
      if (url.pathname === "/poke-lounge/rooms/quick-play") {
        quickPlayRequest.headers = new Headers(init?.headers);
        quickPlayRequest.body = JSON.parse(String(init?.body));
      }
      return jsonResponse({ ...snapshots.initial, visibility: "public" });
    };
    room = createServerRoom({
      quickPlay: true,
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });

    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return requestedPaths.some(function testItem(path) {
        return path.endsWith("/party-snapshot");
      });
    });

    assert.equal(requestedPaths[0], "/poke-lounge/rooms/quick-play");
    assert.notEqual(quickPlayRequest.headers?.get("X-Idempotency-Key"), null);
    assert.equal(quickPlayRequest.headers?.get("If-Match-Revision"), null);
    assert.deepEqual(quickPlayRequest.body, {
      playerId: "player-1",
      sessionId: "session-1",
      displayName: "Player 1",
    });
    assert.match(fixtureWindow.location.href, /network=server/);
    assert.match(fixtureWindow.location.href, /room=ROOM01/);
    assert.equal(fixtureWindow.location.href.includes("quick="), false);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("9번째 신규 사용자는 정원 초과 안내를 받고 자동 재시도하지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?create=1&network=server");
  const eventListeners = new Map<string, Set<EventListener>>();
  const fixtureWindow = {
    ...timers.window,
    addEventListener(eventName: string, listener: EventListener) {
      const listeners = eventListeners.get(eventName) ?? new Set<EventListener>();
      listeners.add(listener);
      eventListeners.set(eventName, listeners);
    },
    dispatchEvent(event: Event) {
      for (const listener of eventListeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fixtureWindow,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom, POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT } = await import("./server-room");
    type CapturedErrorDetail = {
      code: string;
      message: string;
      recoverable: boolean;
      retry?: () => void;
      cancel: () => void;
    };
    const errorDetails: CapturedErrorDetail[] = [];
    fixtureWindow.addEventListener(
      POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT,
      function handleEvent(event) {
        errorDetails.push((event as CustomEvent<CapturedErrorDetail>).detail);
      },
    );
    room = createServerRoom({
      createRoom: true,
      roomId: "ROOM01",
      persistRoomCodeInUrl: false,
      sharedWorldOnly: true,
      playerId: "player-7",
      sessionId: "session-7",
      fetch: async () =>
        jsonResponse(
          {
            statusCode: 409,
            code: "POKE_LOUNGE_ROOM_FULL",
            message: "Poke Lounge room is full",
          },
          409,
        ),
      socketFactory: () => createSocket(),
    });

    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return errorDetails.length > 0;
    });

    const errorDetail = errorDetails[0];
    assert.ok(errorDetail);
    assert.equal(errorDetail.code, "ROOM_FULL");
    assert.equal(errorDetail.message, "멀티플레이 방의 최대 인원 8명이 모두 접속 중입니다.");
    assert.equal(errorDetail.recoverable, false);
    assert.equal(errorDetail.retry, undefined);
    assert.equal(timers.nextDelay(), null);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("임시 비밀번호 방은 안전한 실시간 위치와 챔피언십 준비 상태를 동기화한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers("?create=1&network=server");
  const fixtureWindow = timers.window as typeof timers.window & {
    history: { state: null; replaceState(state: unknown, title: string, url?: string | URL): void };
  };
  fixtureWindow.history = {
    state: null,
    replaceState(_state, _title, url) {
      if (url) {
        fixtureWindow.location.href = String(url);
      }
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fixtureWindow,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    let createBody: unknown;
    let sessionActionRequest: { body: unknown; authorization: string | null } | null = null;
    const requestedPaths: string[] = [];
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      requestedPaths.push(url.pathname);
      if (url.pathname === "/poke-lounge/rooms") {
        createBody = JSON.parse(String(init?.body));
      }
      if (url.pathname.endsWith("/session-actions")) {
        sessionActionRequest = {
          body: JSON.parse(String(init?.body)),
          authorization: new Headers(init?.headers).get("Authorization"),
        };
      }
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      createRoom: true,
      roomId: "ROOM01",
      persistRoomCodeInUrl: false,
      sharedWorldOnly: true,
      competitiveRoundsEnabled: true,
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => socket,
    });

    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return socket.subscriptions().length > 0;
    });
    socket.pushSnapshot(snapshots.initial);
    await waitFor(function waitForCondition() {
      return (
        socket.emissions("room.player-event").length > 0 &&
        requestedPaths.some(function testItem(path) {
          return path.endsWith("/party-snapshot");
        })
      );
    });

    assert.deepEqual(createBody, {
      playerId: "player-1",
      sessionId: "session-1",
      displayName: "Player 1",
      roomCode: "ROOM01",
    });
    assert.equal(fixtureWindow.location.href.includes("room="), false);
    assert.equal(
      requestedPaths.some(function testItem(path) {
        return path.endsWith("/party-snapshot");
      }),
      true,
    );
    assert.equal(
      requestedPaths.some(function testItem(path) {
        return path.endsWith("/ready");
      }),
      false,
    );

    const initialLiveEvent = socket.emissions("room.player-event").at(-1) as {
      type: string;
      snapshot: Record<string, unknown>;
    };
    assert.equal(initialLiveEvent.type, "PLAYER_CHANGED_MAP");
    assert.equal("party" in initialLiveEvent.snapshot, false);
    assert.equal("sessionId" in initialLiveEvent.snapshot, false);

    room.send("COMPETITIVE_ACTION", {
      matchId: "00000000-0000-4000-8000-000000000010",
      assignmentRevision: 1,
      turn: 0,
      clientCommandId: "00000000-0000-4000-8000-000000000011",
      action: { kind: "move", moveId: 55 },
    });
    await waitFor(function waitForCondition() {
      return sessionActionRequest !== null;
    });
    assert.deepEqual(sessionActionRequest, {
      body: {
        assignmentRevision: 1,
        turn: 0,
        clientCommandId: "00000000-0000-4000-8000-000000000011",
        action: { kind: "move", moveId: 55 },
        sessionId: "session-1",
      },
      authorization: null,
    });

    const received: RoomEvent["PLAYER_MOVED"][] = [];
    const changed: RoomEvent["PLAYER_CHANGED_MAP"][] = [];
    const leftSessionIds: string[] = [];
    room.on("PLAYER_MOVED", function handleEvent(snapshot) {
      return received.push(snapshot);
    });
    room.on("PLAYER_CHANGED_MAP", function handleEvent(snapshot) {
      return changed.push(snapshot);
    });
    room.on("PLAYER_LEFT", function handleEvent({ sessionId }) {
      return leftSessionIds.push(sessionId);
    });
    socket.pushWorldSnapshot({
      roomCode: "ROOM01",
      worldEpoch: "world-1",
      worldSeq: 1,
      players: [
        {
          playerId: "player-2",
          displayName: "Mobile",
          map: "new-bark-town",
          x: 700,
          y: 446,
          facing: "right",
        },
        {
          playerId: "ai-1",
          displayName: "AI 1",
          controller: "ai",
          activity: "moving",
          map: "new-bark-town",
          x: 800,
          y: 446,
          facing: "right",
        },
      ],
    });
    assert.equal(changed.find(player => player.playerId === "player-2")?.x, 700);
    assert.equal(changed.find(player => player.playerId === "ai-1")?.x, 800);
    socket.pushPlayerEvent({
      type: "PLAYER_MOVED",
      roomCode: "ROOM01",
      worldEpoch: "world-1",
      worldSeq: 2,
      snapshot: {
        sessionId: "player-2",
        playerId: "player-2",
        displayName: "Mobile",
        map: "new-bark-town",
        x: 704,
        y: 446,
        facing: "right",
      },
    });
    assert.deepEqual(received, [
      {
        sessionId: "player-2",
        playerId: "player-2",
        displayName: "Mobile",
        map: "new-bark-town",
        x: 704,
        y: 446,
        facing: "right",
      },
    ]);
    socket.pushPlayerEvent({
      type: "PLAYER_MOVED",
      roomCode: "ROOM01",
      worldEpoch: "world-1",
      worldSeq: 4,
      snapshot: {
        sessionId: "player-2",
        playerId: "player-2",
        displayName: "Mobile",
        map: "new-bark-town",
        x: 708,
        y: 446,
        facing: "right",
      },
    });
    assert.equal(received.length, 1);
    assert.equal(socket.emissions("room.world-resync").length, 1);
    socket.pushWorldSnapshot({
      roomCode: "ROOM01",
      worldEpoch: "world-1",
      worldSeq: 4,
      players: [
        {
          playerId: "player-2",
          displayName: "Mobile",
          map: "new-bark-town",
          x: 708,
          y: 446,
          facing: "right",
        },
        {
          playerId: "ai-1",
          displayName: "AI 1",
          controller: "ai",
          activity: "moving",
          map: "new-bark-town",
          x: 904,
          y: 446,
          facing: "right",
        },
      ],
    });
    assert.equal(changed.at(-1)?.x, 708);
    assert.equal(received.at(-1)?.playerId, "ai-1");
    assert.equal(received.at(-1)?.x, 904);

    socket.pushWorldCursor({
      roomCode: "ROOM01",
      worldEpoch: "world-2",
      worldSeq: 0,
    });
    assert.equal(socket.emissions("room.world-resync").length, 2);

    const afterLeave = structuredClone(snapshots.initial);
    afterLeave.revision += 1;
    const disconnected = afterLeave.participants.find(function findItem(participant) {
      return participant.playerId === "player-2";
    });
    assert.ok(disconnected);
    disconnected.connected = false;
    socket.pushSnapshot(afterLeave);
    assert.deepEqual(leftSessionIds, ["player-2"]);
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("casual result 복구 재전송은 최초 body와 idempotency key를 그대로 재사용한다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const socket = createSocket();
    const snapshots = createRoomSnapshots();
    const activeMatch = getReadyTournamentMatches(snapshots.initial.tournament.bracket)[0];
    if (!activeMatch) {
      throw new Error("Expected an active casual match");
    }
    const [winnerPlayerId] = activeMatch.participantIds;
    const resultRequests: Array<{ body: string; idempotencyKey: string }> = [];
    let ready = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      ready ||= url.pathname.endsWith("/party-snapshot");
      if (!url.pathname.endsWith("/result")) {
        return jsonResponse(snapshots.initial);
      }

      resultRequests.push({
        body: typeof init?.body === "string" ? init.body : "",
        idempotencyKey: new Headers(init?.headers).get("X-Idempotency-Key") ?? "",
      });
      if (resultRequests.length <= 2) {
        throw new TypeError("result response lost");
      }

      return jsonResponse(snapshots.latest);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: winnerPlayerId,
      sessionId: `session-${winnerPlayerId}`,
      fetch: fetchFixture,
      socketFactory: () => socket,
    });
    room.connect({
      ...createPlayerSnapshot(),
      playerId: winnerPlayerId,
      sessionId: `session-${winnerPlayerId}`,
    });
    await waitFor(function waitForCondition() {
      return ready;
    });

    room.send("TOURNAMENT_MATCH_RESULT", {
      roundIndex: snapshots.initial.round.index,
      matchId: activeMatch.matchId,
      winnerPlayerId,
      reason: "faint",
    });
    await waitFor(function waitForCondition() {
      return resultRequests.length === 3;
    });

    assert.equal(
      new Set(
        resultRequests.map(function mapItem(request) {
          return request.body;
        }),
      ).size,
      1,
    );
    assert.equal(
      new Set(
        resultRequests.map(function mapItem(request) {
          return request.idempotencyKey;
        }),
      ).size,
      1,
    );
    assert.notEqual(resultRequests[0]?.idempotencyKey, "");
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

test("room GET은 불필요한 JSON CORS preflight 헤더를 보내지 않는다", async function testCase() {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = createManualRecoveryTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: timers.window,
  });
  let room: ReturnType<(typeof import("./server-room"))["createServerRoom"]> | null = null;

  try {
    const { createServerRoom } = await import("./server-room");
    const snapshots = createRoomSnapshots();
    const requests: Array<{ method: string; contentType: string | null }> = [];
    let ready = false;
    const fetchFixture: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      requests.push({
        method,
        contentType: new Headers(init?.headers).get("Content-Type"),
      });
      ready ||= url.pathname.endsWith("/party-snapshot");
      return jsonResponse(snapshots.initial);
    };
    room = createServerRoom({
      roomId: "ROOM01",
      playerId: "player-1",
      sessionId: "session-1",
      fetch: fetchFixture,
      socketFactory: () => createSocket(),
    });
    room.connect(createPlayerSnapshot());
    await waitFor(function waitForCondition() {
      return ready;
    });

    assert.ok(
      requests.some(function testItem(request) {
        return request.method === "GET";
      }),
    );
    assert.ok(
      requests
        .filter(function filterItem(request) {
          return request.method === "GET";
        })
        .every(function testItem(request) {
          return !request.contentType;
        }),
    );
    assert.ok(
      requests
        .filter(function filterItem(request) {
          return request.method === "POST";
        })
        .every(function testItem(request) {
          return request.contentType === "application/json";
        }),
    );
  } finally {
    room?.dispose();
    restoreWindow(originalWindow);
  }
});

function createPlayerSnapshot() {
  return {
    sessionId: "session-1",
    playerId: "player-1",
    displayName: "Player 1",
    map: "new-bark-town",
    x: 656,
    y: 446,
    facing: "front" as const,
    activePartySlotIndex: 0,
    party: [
      {
        slotIndex: 0,
        pokemon: {
          speciesId: 7,
          name: "꼬부기",
          level: 11,
          currentHp: 34,
          status: "normal" as const,
          individualValues: {
            hp: 31,
            attack: 31,
            defense: 31,
            specialAttack: 31,
            specialDefense: 31,
            speed: 31,
          },
          moves: [{ id: 55, name: "물대포", pp: 25, maxPp: 25 }],
        },
      },
    ],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function restoreWindow(originalWindow: PropertyDescriptor | undefined): void {
  restoreGlobalProperty("window", originalWindow);
}

function restoreGlobalProperty(
  property: "document" | "window",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, property, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, property);
  }
}

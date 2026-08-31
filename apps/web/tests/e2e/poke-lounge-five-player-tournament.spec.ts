import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  chromium,
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
  test,
  webkit,
} from "@playwright/test";
import { selectCompetitiveAssignment } from "../../src/components/poke-lounge/runtime/game/network/competitive-projection";
import type { CompetitiveProjection } from "../../src/components/poke-lounge/runtime/game/network/local-preview-room";

type Probe = {
  maxTouchPoints: number;
  coarsePointer: boolean;
  userAgent: string;
  platform: string;
};

type PublicRoom = {
  roomCode: string;
  revision: number;
  status: string;
  participants: Array<{
    playerId: string;
    displayName: string;
    role: string;
    ready: boolean;
    connected: boolean;
    joinedAtMs: number;
  }>;
  round: {
    index: number;
    phase: string;
    endsAtMs: number | null;
  };
  tournament: Record<string, unknown>;
  finalStandings: Array<{
    playerId: string;
    displayName: string;
    score: number;
    rank: number;
  }>;
  competitiveAssignments: CompetitiveProjection[];
  competitive?: CompetitiveProjection;
};

type TournamentRound = {
  roundNumber: number;
  matches: Array<{
    matchId: string;
    participantIds: [string, string];
    status: string;
    winnerPlayerId: string | null;
  }>;
  byes: Array<{
    byeId: string;
    entrant: { playerId: string; seed: number };
  }>;
};

type TournamentBracket = {
  version: number;
  status: string;
  participants: Array<{ playerId: string; displayName: string; seed: number }>;
  currentRound: TournamentRound | null;
  completedRounds: TournamentRound[];
  championPlayerId: string | null;
};

type CompetitiveBattleSnapshot = {
  matchId: string;
  bracketMatchId: string;
  assignmentRevision: number;
  currentTurn: number;
  status: string;
  terminal: unknown;
  submittedPlayerIds: string[];
};

type BattleSnapshot = {
  phase: string;
  turn: number;
  message: string | null;
  result: { winnerPlayerId: string; loserPlayerId: string; reason: string } | null;
  battleEntrancePlaying: boolean;
  selectedCommandIndex: number;
  selectedCommand: "fight" | "bag" | "pokemon" | "run";
  selectedMoveIndex: number;
  selectedPartySlotIndex: number;
  player: {
    currentHp: number;
    activePartySlotIndex: number;
  };
  competitive: CompetitiveBattleSnapshot | null;
};

type TesterRuntimeState = {
  currentPlayerId: string;
  roomStatus: string | null;
  gameRound: number | null;
  finalStandings: PublicRoom["finalStandings"];
  revision: number | null;
  round: number | null;
  activeMatchId: string | null;
  activeMatchTransport: string | null;
  canonicalBracket: TournamentBracket | null;
  activeScene: string | null;
  battle: BattleSnapshot | null;
  competitive: CompetitiveBattleSnapshot | null;
  transportDiagnostics: TransportDiagnostics | null;
};

type TransportDiagnostics = {
  socketConnected: boolean;
  transportState: "not-created" | "connected" | "disconnected";
  activeTransport: "polling" | "websocket" | "unknown" | null;
  recoveryAttempt: number;
  recoveryInFlight: boolean;
  recoveryTimerScheduled: boolean;
  subscriptionFailed: boolean;
  lastAppliedTerminalRevision: number | null;
  lastSocketErrorKind:
    "connect_error" | "disconnect" | "subscription_error" | "invalid_snapshot" | null;
  lastSocketConnectErrorClass:
    "websocket_error" | "timeout" | "server_reject" | "cors" | "unknown" | null;
  lastRecoveryFailureKind:
    "canonical_mismatch" | "transition_merge" | "recovery_parse" | "unknown" | null;
};

type TerminalConvergencePhase =
  "pre-terminal" | "old-match-terminal-observed" | "post-confirm" | "C4T";

type TransportEvidencePhase =
  "initial" | "steady" | "full-reload" | "same-page-reconnect" | "C4T-reconnect";

type RecoveryCursor = {
  roomCode: string;
  afterRevision: number;
};

type SanitizedRecoveryStatus = {
  status: number;
  count: number;
};

type RecoveryRequestEvidence = RecoveryCursor & {
  phase: TransportEvidencePhase;
  requestCount: number;
  firstObservedAtMs: number;
  lastObservedAtMs: number;
  statuses: SanitizedRecoveryStatus[];
};

type FailureTimeTransportRecord = {
  phase: string;
  observedAtMs: number;
  transportDiagnostics: TransportDiagnostics | null;
  recoveryRequests: RecoveryRequestEvidence[];
  quiescenceBaseline: RecoveryQuiescenceBaseline | null;
};

type RecoveryQuiescenceBaseline = {
  observedAtMs: number;
  recoveryRequestTotal: number;
  transportDiagnostics: TransportDiagnostics;
};

type ReloadBaselineRecord = {
  phase: "FAULT_001_FULL_RELOAD";
  observedAtMs: number;
  freshRoomRevision: number;
  freshTerminalCursor: number;
  freshInitialRuntime: TesterRuntimeState;
  freshRecoveryCursor: RecoveryCursor;
  latestRoomRevision: number;
  latestTerminalCursor: number;
  latestRuntime: TesterRuntimeState;
};

type BattleLaunchEvidence = {
  matchId: string;
  bracketMatchId: string;
  assignmentRevision: number;
};

type ForcedSwitchEvidence = {
  tester: number;
  seed: number;
  matchId: string;
  playerId: string;
  turn: number;
  fromSlotIndex: number;
  toSlotIndex: number;
};

type RedisAssertions = {
  roomCode: string;
  seatCount: number;
  distinctAccountCount: number;
  actionCount: number;
  actionKindCounts: { move: number; switch: number };
  forcedSwitchTurns: Array<{ matchId: string; playerId: string; turn: number }>;
  matches?: Array<{ status: string }>;
  worldStatePresent?: boolean;
};

type TesterResult = {
  id: number;
  fileName: string;
  environment: string;
  viewport: string;
  input: "keyboard" | "touch";
  seed: number;
  role: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  playerId: string | null;
  probe: Probe | null;
  recoveryRequests: RecoveryRequestEvidence[];
  failureTimeTransportRecords: FailureTimeTransportRecord[];
  reloadBaselineRecords: ReloadBaselineRecord[];
  battleLaunches: BattleLaunchEvidence[];
  terminalConvergence: Record<TerminalConvergencePhase, TesterRuntimeState | null>;
  checkpoints: Array<{
    checkpoint: string;
    revision: number | null;
    round: number | null;
    activeMatch: string | null;
    screenState: string;
    result: string;
    runtime: TesterRuntimeState;
  }>;
};

type TesterRuntime = TesterResult & {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  transportEvidencePhase: TransportEvidencePhase;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const RECOVERY_STABILITY_WINDOW_MS = 2_000;
const MAX_RECOVERY_REQUESTS_PER_RECONNECT = 4;
const SCREENSHOT_CAPTURE_DEADLINE_MS = 5_000;
const RUN_ROOT =
  process.env.POKE_LOUNGE_E2E_RUN_ROOT ??
  path.resolve(
    process.cwd(),
    "../../output/playwright/poke-lounge-five-player",
    `manual-${Date.now()}`,
  );

test("실제 API와 Socket.IO에서 5개 환경이 3라운드 우승과 방 정리까지 수렴한다", async function testCase({}, testInfo) {
  test.setTimeout(0);

  expect(API_URL, "통합 테스트에는 NEXT_PUBLIC_API_URL이 필요합니다.").not.toBe("");
  expect(
    process.env.POKE_LOUNGE_E2E_ENV_ISOLATED,
    "runner가 DB secret을 제거한 Playwright 환경이어야 합니다.",
  ).toBe("1");
  expect(
    Object.keys(process.env).filter(isDatabaseEnvironmentName),
    "Playwright child는 DB 접속 환경을 받지 않아야 합니다.",
  ).toEqual([]);

  mkdirSync(path.join(RUN_ROOT, "screenshots"), { recursive: true });
  const networkErrors: Array<{
    tester: number;
    kind: "http-5xx" | "pageerror";
    detail: string;
  }> = [];
  const testers: TesterRuntime[] = [];
  const forcedSwitchEvidence: ForcedSwitchEvidence[] = [];
  let roomCode = "";
  let oldCompetitiveMatchId = "";
  let overallStatus: "PASS" | "FAIL" | "BLOCKED" = "FAIL";
  let failure: unknown;
  let redisAssertions: unknown = null;
  let initialBracket: TournamentBracket | null = null;
  let nextBracket: TournamentBracket | null = null;
  let convergedRoom: PublicRoom | null = null;
  let finalRoom: PublicRoom | null = null;

  try {
    const [chromiumBrowser, webkitBrowser] = await Promise.all([
      chromium.launch(),
      webkit.launch(),
    ]);
    testers.push(
      await createTester({
        id: 1,
        browser: chromiumBrowser,
        environment: "Desktop Chromium",
        viewport: { width: 1440, height: 900 },
        input: "keyboard",
        seed: 1,
        role: "host, bye",
        fileName: "tester-01-chromium-desktop.md",
        networkErrors,
      }),
      await createTester({
        id: 2,
        browser: chromiumBrowser,
        environment: "Desktop Chromium 1366",
        viewport: { width: 1366, height: 768 },
        input: "keyboard",
        seed: 2,
        role: "bye, reconnect",
        fileName: "tester-02-chromium-desktop.md",
        networkErrors,
      }),
      await createTester({
        id: 3,
        browser: webkitBrowser,
        environment: "Desktop WebKit",
        viewport: { width: 1440, height: 900 },
        input: "keyboard",
        seed: 3,
        role: "bye, socket observer",
        fileName: "tester-03-webkit-desktop.md",
        networkErrors,
      }),
      await createTester({
        id: 4,
        browser: chromiumBrowser,
        environment: "Mobile Chromium",
        viewport: { width: 390, height: 844 },
        input: "touch",
        mobileDevice: "Pixel 7",
        seed: 4,
        role: "first match player A",
        fileName: "tester-04-chromium-mobile.md",
        networkErrors,
      }),
      await createTester({
        id: 5,
        browser: webkitBrowser,
        environment: "Mobile WebKit",
        viewport: { width: 430, height: 932 },
        input: "touch",
        mobileDevice: "iPhone 13",
        seed: 5,
        role: "first match player B",
        fileName: "tester-05-webkit-mobile.md",
        networkErrors,
      }),
    );

    await test.step("C0_JOINED: 다섯 context를 고정 순서로 입장시킨다", async function callback() {
      const host = testers[0];
      await host.page.route("**/poke-lounge/rooms", routeFivePlayerRoomCreation);
      await openServerRoom(host.page, undefined, `Tester ${host.id}`);
      await chooseStarterIfNeeded(host.page);
      await expect(
        host.page.locator('#game-root[data-poke-lounge-game-surface="ready"]'),
      ).toBeVisible({ timeout: 30_000 });
      roomCode = await waitForRoomCode(host.page);
      await host.page.unroute("**/poke-lounge/rooms", routeFivePlayerRoomCreation);
      await waitForParticipantReady(roomCode, host);

      for (const tester of testers.slice(1)) {
        await openServerRoom(tester.page, roomCode, `Tester ${tester.id}`);
        await chooseStarterIfNeeded(tester.page);
        await expect(
          tester.page.locator('#game-root[data-poke-lounge-game-surface="ready"]'),
        ).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(
            function pollExpectation() {
              return readRoomCode(tester.page);
            },
            { timeout: 30_000 },
          )
          .toBe(roomCode);
        await waitForParticipantReady(roomCode, tester);
      }

      const joined = await pollRoom(roomCode, function callback(room) {
        return room.participants.length === 5;
      });
      const participants = [...joined.participants].sort(function compareItems(left, right) {
        return left.joinedAtMs - right.joinedAtMs || left.playerId.localeCompare(right.playerId);
      });
      expect(participants).toHaveLength(5);
      expect(
        new Set(
          participants.map(function mapItem(participant) {
            return participant.playerId;
          }),
        ).size,
      ).toBe(5);
      expect(
        participants.every(function testItem(participant) {
          return participant.role === "participant";
        }),
      ).toBe(true);

      for (const [index, tester] of testers.entries()) {
        await expect
          .poll(
            function pollExpectation() {
              return Promise.resolve(tester.playerId);
            },
            { timeout: 30_000 },
          )
          .not.toBeNull();
        expect(tester.playerId).toBe(participants[index].playerId);
        await recordCheckpoint(tester, "C0_JOINED", "world", "PASS");
      }
      await captureCheckpointScreenshots(testers, "C0_JOINED");
    });

    await test.step("C1_STARTED: 첫 대진과 세 bye 관전을 모든 context에서 확인한다", async function callback() {
      const readyRoom = await pollRoom(roomCode, function callback(room) {
        return (
          room.participants.length === 5 &&
          room.participants.every(function testItem(participant) {
            return participant.ready;
          })
        );
      });
      expect(readyRoom.round.endsAtMs).toBeNull();
      const startButton = testers[0].page.locator("[data-room-lobby-start='true']");
      await expect(startButton).toBeEnabled({ timeout: 30_000 });
      await startButton.click();
      const preparation = await pollRoom(roomCode, function callback(room) {
        return room.status === "round-started";
      });
      expect(preparation.round.endsAtMs).not.toBeNull();
      const started = await pollRoom(
        roomCode,
        function callback(room) {
          return findBracket(room.tournament) !== null;
        },
        45_000,
      );
      initialBracket = findBracket(started.tournament);
      expect(initialBracket).not.toBeNull();

      const participantsBySeed = new Map(
        initialBracket!.participants.map(function mapItem(participant) {
          return [participant.seed, participant.playerId];
        }),
      );
      expect(initialBracket!.currentRound?.matches).toHaveLength(1);
      expect(initialBracket!.currentRound?.matches[0]?.participantIds).toEqual([
        participantsBySeed.get(4),
        participantsBySeed.get(5),
      ]);
      expect(participantsBySeed.get(4)).toBe(testers[3].playerId);
      expect(participantsBySeed.get(5)).toBe(testers[4].playerId);
      expect(
        initialBracket!.currentRound?.byes.map(function mapItem(bye) {
          return bye.entrant.seed;
        }),
      ).toEqual([1, 3, 2]);

      await expectBracketConvergence(testers, initialBracket!);
      for (const tester of testers) {
        await expect
          .poll(
            function pollExpectation() {
              return getActiveSceneKey(tester.page);
            },
            { timeout: 30_000 },
          )
          .toBe("battle");
      }
      for (const tester of testers.slice(3)) {
        await expect(
          tester.page.locator("[data-poke-lounge-mobile-control-dock='true']"),
        ).toBeVisible();
      }

      await Promise.all(
        testers.map(function mapItem(tester) {
          return waitForWebSocketUpgrade(tester);
        }),
      );

      for (const tester of testers) {
        await expect
          .poll(
            function pollExpectation() {
              return Promise.resolve(getRecoveryRequestTotal(tester));
            },
            { timeout: 30_000 },
          )
          .toBeGreaterThan(0);
        const initialRecovery = await waitForRecoveryEvidence(tester, "initial", roomCode);
        expectSuccessfulRecoveryResponse(initialRecovery);
        tester.transportEvidencePhase = "steady";
      }

      const recoveryBaselines = await Promise.all(
        testers.map(function mapItem(tester) {
          return waitForHealthyRecoveryQuiescence(tester, "C1_STABILITY");
        }),
      );
      await Promise.all(
        testers.map(function mapItem(tester, index) {
          return assertRecoveryStability(tester, "C1_STABILITY", recoveryBaselines[index]);
        }),
      );

      for (const tester of testers) {
        await recordCheckpoint(
          tester,
          "C1_STARTED",
          tester.seed >= 4 ? "battle" : "bye/spectating",
          "PASS",
        );
      }
      await captureCheckpointScreenshots(testers, "C1_STARTED");
    });

    await test.step("FAULT-001: Chromium spectator context를 retry 없이 reload한다", async function callback() {
      const reconnectTester = testers[1];
      const recoveryCount = getRecoveryRequestTotal(reconnectTester);
      reconnectTester.transportEvidencePhase = "full-reload";
      const response = await reconnectTester.page.reload({ waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);
      await confirmDirectMultiplayerEntryIfNeeded(
        reconnectTester.page,
        `Tester ${reconnectTester.id}`,
      );
      await chooseStarterIfNeeded(reconnectTester.page);
      await expect(
        reconnectTester.page.locator('#game-root[data-poke-lounge-game-surface="ready"]'),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(
          function pollExpectation() {
            return readRoomCode(reconnectTester.page);
          },
          { timeout: 30_000 },
        )
        .toBe(roomCode);
      await expect
        .poll(
          function pollExpectation() {
            return getActiveSceneKey(reconnectTester.page);
          },
          { timeout: 30_000 },
        )
        .toBe("battle");
      await expect
        .poll(
          async function pollExpectation() {
            return (await readTesterRuntimeState(reconnectTester.page)).revision;
          },
          {
            timeout: 30_000,
          },
        )
        .not.toBeNull();
      await expect
        .poll(
          async function pollExpectation() {
            return (
              (await readTesterRuntimeState(reconnectTester.page)).transportDiagnostics
                ?.lastAppliedTerminalRevision ?? null
            );
          },
          { timeout: 30_000 },
        )
        .not.toBeNull();
      const freshInitialObservedAtMs = Date.now();
      const freshInitialRuntime = await readTesterRuntimeState(reconnectTester.page);
      const freshRoomRevision = freshInitialRuntime.revision;
      const freshTerminalCursor =
        freshInitialRuntime.transportDiagnostics?.lastAppliedTerminalRevision ?? null;
      if (freshRoomRevision === null || freshTerminalCursor === null) {
        throw new Error("Full reload did not expose hydrated room and terminal baselines.");
      }
      await expect
        .poll(
          function pollExpectation() {
            return Promise.resolve(getRecoveryRequestTotal(reconnectTester));
          },
          { timeout: 30_000 },
        )
        .toBeGreaterThan(recoveryCount);
      const freshRecovery = await waitForRecoveryEvidence(
        reconnectTester,
        "full-reload",
        roomCode,
        freshTerminalCursor,
      );
      expectSuccessfulRecoveryResponse(freshRecovery);
      const freshRuntime = await readTesterRuntimeState(reconnectTester.page);
      const latestRoomRevision = freshRuntime.revision;
      const latestTerminalCursor =
        freshRuntime.transportDiagnostics?.lastAppliedTerminalRevision ?? null;
      if (latestRoomRevision === null || latestTerminalCursor === null) {
        throw new Error("Full reload lost hydrated room or terminal diagnostics.");
      }
      expect(freshRecovery.afterRevision).toBe(freshTerminalCursor);
      expect(latestRoomRevision).toBeGreaterThanOrEqual(freshRoomRevision);
      expect(latestTerminalCursor).toBeGreaterThanOrEqual(freshTerminalCursor);
      reconnectTester.reloadBaselineRecords.push({
        phase: "FAULT_001_FULL_RELOAD",
        observedAtMs: freshInitialObservedAtMs,
        freshRoomRevision,
        freshTerminalCursor,
        freshInitialRuntime,
        freshRecoveryCursor: {
          roomCode: freshRecovery.roomCode,
          afterRevision: freshRecovery.afterRevision,
        },
        latestRoomRevision,
        latestTerminalCursor,
        latestRuntime: freshRuntime,
      });
      reconnectTester.transportEvidencePhase = "steady";
      await recordCheckpoint(
        reconnectTester,
        "FAULT_001_CHROMIUM_RELOAD",
        `world after cold reload room=${freshRoomRevision} terminal-cursor=${freshTerminalCursor}`,
        "PASS",
        freshRuntime,
      );
    });

    await test.step("FAULT-002: Chromium same-page Socket reconnect가 terminal cursor를 유지한다", async function callback() {
      const reconnectTester = testers[1];
      const { before, after } = await reconnectContextWithoutReload(reconnectTester);
      expect(after.afterRevision).toBe(before.afterRevision);
      const runtime = await readTesterRuntimeState(reconnectTester.page);
      expect(runtime.revision).not.toBeNull();
      expect(runtime.revision!).toBeGreaterThanOrEqual(after.afterRevision);
      await recordCheckpoint(
        reconnectTester,
        "FAULT_002_SOCKET_RECONNECT",
        `same-page reconnect afterRevision=${after.afterRevision}`,
        "PASS",
        runtime,
      );
    });

    await test.step("C2_ACTION_1/C3T_TERMINAL: 두 모바일 context가 confirm 전에 같은 old match 결과를 관측한다", async function callback() {
      const matchBefore = await fetchRoom(roomCode);
      expect(matchBefore.competitive).toBeDefined();
      oldCompetitiveMatchId = matchBefore.competitive!.matchId;
      expect([...(matchBefore.competitive?.playerIds ?? [])].sort()).toEqual(
        [...initialBracket!.currentRound!.matches[0]!.participantIds].sort(),
      );
      expect(matchBefore.competitive?.bracketMatchId).toBe(
        initialBracket!.currentRound!.matches[0]!.matchId,
      );
      expect(matchBefore.competitive?.kind).toBe("tournament-unranked");
      expect(matchBefore.tournament.activeMatchAuthority).toBe("server");
      await Promise.all(
        testers.map(function mapItem(tester) {
          return trackWorldBattleStarts(tester.page);
        }),
      );
      const preTerminalStates = await Promise.all(
        testers.map(function mapItem(tester) {
          return captureTerminalConvergence(tester, "pre-terminal");
        }),
      );
      expect(preTerminalStates[3]).toMatchObject({
        activeScene: "battle",
        competitive: { matchId: oldCompetitiveMatchId, status: "pending" },
      });
      expect(preTerminalStates[4]).toMatchObject({
        activeScene: "battle",
        competitive: { matchId: oldCompetitiveMatchId, status: "pending" },
      });
      const actionEvidenceRoom = await finishBattleWithInput(
        roomCode,
        [testers[3], testers[4]],
        networkErrors,
        forcedSwitchEvidence,
      );
      expect(
        (actionEvidenceRoom.competitive?.submittedPlayerIds.length ?? 0) > 0 ||
          (actionEvidenceRoom.competitive?.currentTurn ?? 0) >
            matchBefore.competitive!.currentTurn ||
          actionEvidenceRoom.competitive?.matchId !== matchBefore.competitive?.matchId ||
          (findBracket(actionEvidenceRoom.tournament)?.completedRounds.length ?? 0) >
            (findBracket(matchBefore.tournament)?.completedRounds.length ?? 0),
      ).toBe(true);
      expect(actionEvidenceRoom.competitive).toMatchObject({
        matchId: oldCompetitiveMatchId,
        status: "active",
      });
      expect(actionEvidenceRoom.competitive?.submittedPlayerIds).toContain(testers[3].playerId);
      for (const tester of testers) {
        await recordCheckpoint(
          tester,
          "C2_ACTION_1",
          tester.seed >= 4 ? "authoritative touch action" : "wait",
          "PASS",
        );
      }
      const terminalRoom = await pollRoom(
        roomCode,
        function callback(room) {
          return (
            Boolean(room.competitive?.terminal) ||
            Boolean(findBracket(room.tournament)?.completedRounds.length)
          );
        },
        90_000,
      );

      for (const tester of testers.slice(0, 3)) {
        await recordCheckpoint(tester, "C3T_TERMINAL_CONTEXT", "spectator context", "PASS");
      }

      const [seed4Terminal, seed5Terminal] = await Promise.all([
        waitForOldMatchTerminalResult({
          tester: testers[3],
          oldMatchId: oldCompetitiveMatchId,
          terminalRevision: terminalRoom.revision,
        }),
        waitForOldMatchTerminalResult({
          tester: testers[4],
          oldMatchId: oldCompetitiveMatchId,
          terminalRevision: terminalRoom.revision,
        }),
      ]);

      const firstMatchResult = readTerminalResult(seed4Terminal.battle?.result);
      expect(firstMatchResult).not.toBeNull();
      expect(readTerminalResult(seed5Terminal.battle?.result)).toEqual(firstMatchResult);
      expect([firstMatchResult!.winnerPlayerId, firstMatchResult!.loserPlayerId].sort()).toEqual(
        [testers[3].playerId, testers[4].playerId].sort(),
      );
      const seed4Result = firstMatchResult!.winnerPlayerId === testers[3].playerId ? "win" : "loss";
      const seed5Result = seed4Result === "win" ? "loss" : "win";

      expect(seed4Terminal.competitive?.matchId).toBe(oldCompetitiveMatchId);
      expect(seed4Terminal.battle?.result).toMatchObject(firstMatchResult!);
      expect(seed5Terminal.competitive?.matchId).toBe(oldCompetitiveMatchId);
      expect(seed5Terminal.battle?.result).toMatchObject(firstMatchResult!);
      testers[3].terminalConvergence["old-match-terminal-observed"] = seed4Terminal;
      testers[4].terminalConvergence["old-match-terminal-observed"] = seed5Terminal;

      await recordCheckpoint(
        testers[3],
        "C3T_TERMINAL_OBSERVED",
        `old match ${seed4Result} result before confirm`,
        "PASS",
        seed4Terminal,
      );
      await recordCheckpoint(
        testers[4],
        "C3T_TERMINAL_OBSERVED",
        `old match ${seed5Result} result before confirm`,
        "PASS",
        seed5Terminal,
      );
      await captureCheckpointScreenshots([testers[3], testers[4]], "C3T_TERMINAL_OBSERVED");

      const postConfirmStates = await Promise.all(
        testers.map(function mapItem(tester) {
          return tester.seed === 4
            ? waitForPostConfirmRuntime(tester, oldCompetitiveMatchId, seed4Result)
            : tester.seed === 5
              ? waitForPostConfirmRuntime(tester, oldCompetitiveMatchId, seed5Result)
              : readTesterRuntimeState(tester.page);
        }),
      );
      for (const [index, tester] of testers.entries()) {
        const runtime = postConfirmStates[index];
        tester.terminalConvergence["post-confirm"] = runtime;
        await recordCheckpoint(
          tester,
          "C3T_POST_CONFIRM",
          tester.seed === 4 || tester.seed === 5
            ? `${tester.seed === 4 ? seed4Result : seed5Result} left old battle`
            : "spectator context after confirm",
          "PASS",
          runtime,
        );
      }
    });

    await test.step("C4T_NEXT_ROUND: 실제 scene/battle/competitive state가 역할별 다음 대진에 수렴한다", async function callback() {
      const nextRoom = await pollRoom(roomCode, function callback(room) {
        const bracket = findBracket(room.tournament);
        return Boolean(bracket?.currentRound && bracket.currentRound.roundNumber >= 2);
      });
      nextBracket = findBracket(nextRoom.tournament);
      convergedRoom = nextRoom;
      expect(nextBracket?.currentRound?.roundNumber).toBe(2);
      expect(nextRoom.competitive).toBeDefined();
      expect(nextRoom.competitiveAssignments).toHaveLength(2);
      await expectBracketConvergence(testers, nextBracket!);
      const nextBattlePlayerIds = new Set(
        nextRoom.competitiveAssignments.flatMap(function mapItem(assignment) {
          return assignment.playerIds;
        }),
      );

      for (const tester of testers) {
        await waitForC4RuntimeConvergence({
          tester,
          nextRoom,
          nextBracket: nextBracket!,
          oldMatchId: oldCompetitiveMatchId,
        });
      }

      const launchesBeforeReconnect = new Map<number, BattleLaunchEvidence[]>();
      for (const tester of testers) {
        const assignment = selectCompetitiveAssignment(
          nextRoom.competitiveAssignments,
          tester.playerId!,
          nextRoom.round.index,
        );
        const launches = await getTrackedWorldBattleStarts(tester.page);
        expect(launches.length).toBeLessThanOrEqual(1);
        if (launches[0]) {
          expect(launches[0]).toEqual({
            matchId: assignment?.matchId,
            bracketMatchId: assignment?.bracketMatchId,
            assignmentRevision: assignment?.assignmentRevision,
          });
        }
        launchesBeforeReconnect.set(tester.id, launches);
      }

      await Promise.all(
        testers
          .filter(function filterItem(tester) {
            return tester.playerId && nextBattlePlayerIds.has(tester.playerId);
          })
          .map(function mapItem(tester) {
            return reconnectContextWithoutReload(tester, "C4T-reconnect");
          }),
      );

      for (const tester of testers) {
        const runtime = await waitForC4RuntimeConvergence({
          tester,
          nextRoom,
          nextBracket: nextBracket!,
          oldMatchId: oldCompetitiveMatchId,
        });
        const nextBattleLaunches = await getTrackedWorldBattleStarts(tester.page);
        expect(nextBattleLaunches).toEqual(launchesBeforeReconnect.get(tester.id));
        tester.battleLaunches = nextBattleLaunches;
        tester.terminalConvergence.C4T = runtime;
        await recordCheckpoint(
          tester,
          "C4T_NEXT_ROUND",
          tester.playerId && nextBattlePlayerIds.has(tester.playerId)
            ? "next authority battle"
            : "spectating next authority battle",
          "PASS",
          runtime,
        );
      }
      await captureCheckpointScreenshots(testers, "C4T_NEXT_ROUND");
    });

    await test.step("C5_FULL_CYCLE: 남은 대진을 진행해 3라운드 최종 우승자를 확정한다", async function callback() {
      expect(convergedRoom).not.toBeNull();
      const activeAssertions = await fetchJson<RedisAssertions>(
        `${API_URL}/__e2e/poke-lounge/assertions?roomCode=${encodeURIComponent(roomCode)}`,
      );
      expect(activeAssertions.worldStatePresent).toBe(true);
      finalRoom = await completeRemainingTournamentMatches({
        roomCode,
        testers,
        startingRoom: convergedRoom!,
        completedMatchIds: new Set([oldCompetitiveMatchId]),
        networkErrors,
        forcedSwitchEvidence,
      });
      expect(finalRoom).toMatchObject({
        status: "completed",
        round: { index: 3, phase: "completed", endsAtMs: null },
      });
      expect(finalRoom!.finalStandings).toHaveLength(5);
      expect(
        finalRoom!.finalStandings.filter(function filterItem(standing) {
          return standing.rank === 1;
        }).length,
      ).toBeGreaterThan(0);
      const completedBracket = findBracket(finalRoom!.tournament);
      expect(completedBracket).toMatchObject({ status: "completed" });
      expect(completedBracket?.championPlayerId).not.toBeNull();
      await expectFinalRoomConvergence(testers, finalRoom!);
      await Promise.all(testers.map(prepareFinalWinnerCapture));
      await captureCheckpointScreenshots(testers, "C5_FINAL_WINNER");
    });

    await test.step("C6_CONVERGED: Redis·REST·Socket 최종 상태를 확인한다", async function callback() {
      redisAssertions = await fetchJson<RedisAssertions>(
        `${API_URL}/__e2e/poke-lounge/assertions?roomCode=${encodeURIComponent(roomCode)}`,
      );
      expect(redisAssertions).toMatchObject({
        roomCode,
        seatCount: 5,
        distinctAccountCount: 5,
        worldStatePresent: true,
      });
      const assertionObject = redisAssertions as RedisAssertions;
      expect(assertionObject.actionKindCounts.move).toBeGreaterThan(0);
      if (forcedSwitchEvidence.length > 0) {
        expect(assertionObject.actionKindCounts.switch).toBeGreaterThan(0);
        for (const evidence of forcedSwitchEvidence) {
          expect(assertionObject.forcedSwitchTurns).toContainEqual({
            matchId: evidence.matchId,
            playerId: evidence.playerId,
            turn: evidence.turn,
          });
        }
      }
      expect(
        assertionObject.matches?.filter(function filterItem(match) {
          return match.status === "completed";
        }).length ?? 0,
      ).toBe(12);

      for (const tester of testers) {
        await recordCheckpoint(tester, "C6_CONVERGED", "Redis/REST/Socket", "PASS");
      }
      expect(networkErrors).toEqual([]);
    });

    await test.step("C7_ROOM_CLOSED: 다섯 context가 명시적으로 방을 나간다", async function callback() {
      for (const tester of testers) {
        await leaveServerRoom(tester.page);
        await recordCheckpoint(tester, "C7_ROOM_CLOSED", "room entry after leave", "PASS");
      }
      await expect
        .poll(
          async function pollExpectation() {
            return (
              await fetchJson<RedisAssertions>(
                `${API_URL}/__e2e/poke-lounge/assertions?roomCode=${encodeURIComponent(roomCode)}`,
              )
            ).worldStatePresent;
          },
          { timeout: 30_000 },
        )
        .toBe(false);
      redisAssertions = await fetchJson<RedisAssertions>(
        `${API_URL}/__e2e/poke-lounge/assertions?roomCode=${encodeURIComponent(roomCode)}`,
      );
      await captureCheckpointScreenshots(testers, "C7_ROOM_CLOSED");
    });

    for (const tester of testers) tester.status = "PASS";
    overallStatus = "PASS";
  } catch (error) {
    failure = error;
    overallStatus = isInfrastructureError(error) ? "BLOCKED" : "FAIL";
    for (const tester of testers) {
      if (tester.status !== "PASS") tester.status = overallStatus;
    }
    throw error;
  } finally {
    await captureScreenshots(testers);
    writeArtifacts({
      testers,
      roomCode,
      overallStatus,
      failure,
      networkErrors,
      redisAssertions,
      initialBracket,
      nextBracket,
      oldCompetitiveMatchId,
      forcedSwitchEvidence,
      projectName: testInfo.project.name,
    });
    await Promise.all(
      testers.map(function mapItem(tester) {
        return tester.context.close().catch(function handleRejected() {});
      }),
    );
    await Promise.all(
      [
        ...new Set(
          testers.map(function mapItem(tester) {
            return tester.browser;
          }),
        ),
      ].map(closeBrowser),
    );
  }
});

async function createTester(input: {
  id: number;
  browser: Browser;
  environment: string;
  viewport: { width: number; height: number };
  input: "keyboard" | "touch";
  mobileDevice?: "Pixel 7" | "iPhone 13";
  seed: number;
  role: string;
  fileName: string;
  networkErrors: Array<{ tester: number; kind: "http-5xx" | "pageerror"; detail: string }>;
}): Promise<TesterRuntime> {
  const deviceDescriptor = input.mobileDevice ? devices[input.mobileDevice] : null;
  const deviceOptions = deviceDescriptor
    ? {
        userAgent: deviceDescriptor.userAgent,
        deviceScaleFactor: deviceDescriptor.deviceScaleFactor,
        isMobile: deviceDescriptor.isMobile,
        hasTouch: deviceDescriptor.hasTouch,
      }
    : {};
  const context = await input.browser.newContext({
    ...deviceOptions,
    viewport: input.viewport,
  });
  const token = `poke-lounge-e2e-token-${input.id}`;
  await context.route("**/api/auth/session", function callback(route) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: `e2e-user-${input.id}`, name: `Tester ${input.id}` },
        expires: "2100-01-01T00:00:00.000Z",
        idToken: token,
        idTokenExpiresAt: 4_102_444_800,
      }),
    });
  });
  const page = await context.newPage();
  const runtime: TesterRuntime = {
    id: input.id,
    fileName: input.fileName,
    environment: input.environment,
    viewport: `${input.viewport.width}x${input.viewport.height}`,
    input: input.input,
    seed: input.seed,
    role: input.role,
    status: "FAIL",
    playerId: null,
    probe: null,
    recoveryRequests: [],
    failureTimeTransportRecords: [],
    reloadBaselineRecords: [],
    battleLaunches: [],
    terminalConvergence: {
      "pre-terminal": null,
      "old-match-terminal-observed": null,
      "post-confirm": null,
      C4T: null,
    },
    checkpoints: [],
    browser: input.browser,
    context,
    page,
    transportEvidencePhase: "initial",
  };
  const recoveryEvidenceByRequest = new WeakMap<Request, RecoveryRequestEvidence>();

  page.on("request", function handleEvent(request) {
    const recoveryCursor = parseRecoveryCursor(request.method(), request.url());
    if (recoveryCursor) {
      const evidence = recordRecoveryRequest(
        runtime,
        runtime.transportEvidencePhase,
        recoveryCursor,
        Date.now(),
      );
      recoveryEvidenceByRequest.set(request, evidence);
      return;
    }
    if (request.method() !== "POST") return;
    const pathname = new URL(request.url()).pathname;
    if (!/^\/poke-lounge\/rooms(?:\/[A-Z0-9]+\/join)?$/.test(pathname)) return;
    const body = request.postDataJSON() as { playerId?: unknown } | null;
    if (typeof body?.playerId === "string") runtime.playerId = body.playerId;
  });
  page.on("response", function handleEvent(response) {
    const recoveryEvidence = recoveryEvidenceByRequest.get(response.request());
    if (recoveryEvidence) {
      recordSanitizedRecoveryStatus(recoveryEvidence, response.status());
    }
    if (response.status() < 500) return;
    input.networkErrors.push({
      tester: input.id,
      kind: "http-5xx",
      detail: `${response.status()} ${new URL(response.url()).pathname}`,
    });
  });
  page.on("pageerror", function handleEvent(error) {
    input.networkErrors.push({
      tester: input.id,
      kind: "pageerror",
      detail: sanitizeError(error.message),
    });
  });
  runtime.probe = await page.evaluate(function evaluatePage() {
    return {
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      userAgent: navigator.userAgent ?? "",
      platform: navigator.platform ?? "",
    };
  });
  return runtime;
}

async function openServerRoom(page: Page, roomCode?: string, displayName?: string): Promise<void> {
  const searchParams = new URLSearchParams({ e2e: "1", network: "server" });
  if (roomCode) {
    searchParams.set("room", roomCode);
  } else {
    searchParams.set("create", "1");
  }

  const response = await page.goto(`/ko-KR/game/poke-lounge?${searchParams.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBeLessThan(500);
  expect(response?.status()).toBeLessThan(400);
  await confirmDirectMultiplayerEntry(page, displayName);
}

async function chooseStarterIfNeeded(page: Page): Promise<void> {
  const starter = page.locator("[data-screen='starter-selection']");
  const surface = page.locator('#game-root[data-poke-lounge-game-surface="ready"]');
  await expect
    .poll(
      async function pollExpectation() {
        if (
          await starter.isVisible().catch(function handleRejected() {
            return false;
          })
        )
          return "starter";
        if (
          await surface.isVisible().catch(function handleRejected() {
            return false;
          })
        )
          return "surface";
        return null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  if (
    await starter.isVisible().catch(function handleRejected() {
      return false;
    })
  ) {
    await page.locator("[data-starter-confirm]").click();
  }
}

async function confirmDirectMultiplayerEntry(page: Page, displayName?: string): Promise<void> {
  const directEntry = page.locator("[data-room-entry-direct-multiplayer='true']");
  await expect(directEntry).toBeVisible({ timeout: 30_000 });

  if (displayName) {
    await page.locator("[data-room-entry-direct-multiplayer-name='true']").fill(displayName);
  }

  await page.locator("[data-room-entry-direct-multiplayer-submit='true']").click();
}

async function confirmDirectMultiplayerEntryIfNeeded(
  page: Page,
  displayName: string,
): Promise<void> {
  const surface = page.locator('#game-root[data-poke-lounge-game-surface="ready"]');
  const directEntry = page.locator("[data-room-entry-direct-multiplayer='true']");
  await expect
    .poll(
      async function pollExpectation() {
        return (
          (await surface.isVisible().catch(function handleRejected() {
            return false;
          })) ||
          (await directEntry.isVisible().catch(function handleRejected() {
            return false;
          }))
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  if (
    !(await surface.isVisible().catch(function handleRejected() {
      return false;
    })) &&
    (await directEntry.isVisible().catch(function handleRejected() {
      return false;
    }))
  ) {
    await confirmDirectMultiplayerEntry(page, displayName);
  }
}

async function waitForRoomCode(page: Page): Promise<string> {
  await expect
    .poll(
      function pollExpectation() {
        return readRoomCode(page);
      },
      { timeout: 30_000 },
    )
    .toMatch(/^[A-Z0-9]{6}$/);
  return readRoomCode(page);
}

async function readRoomCode(page: Page): Promise<string> {
  return new URL(page.url()).searchParams.get("room") ?? "";
}

async function waitForParticipantReady(roomCode: string, tester: TesterRuntime): Promise<void> {
  await expect
    .poll(
      function pollExpectation() {
        return Promise.resolve(tester.playerId);
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  const readyButton = tester.page.locator("[data-room-lobby-ready='true']");
  await expect(readyButton).toBeEnabled({ timeout: 30_000 });
  await readyButton.click();
  await pollRoom(roomCode, function callback(room) {
    return room.participants.some(function testItem(participant) {
      return participant.playerId === tester.playerId && participant.ready;
    });
  });
}

async function routeFivePlayerRoomCreation(route: Route): Promise<void> {
  const request = route.request();

  if (request.method() !== "POST") {
    await route.continue();
    return;
  }

  const headers = { ...request.headers() };
  delete headers["content-length"];
  await route.continue({
    headers,
    postData: JSON.stringify({
      ...(request.postDataJSON() as Record<string, unknown>),
      roundDurationMs: 30_000,
    }),
  });
}

async function fetchRoom(roomCode: string): Promise<PublicRoom> {
  return fetchJson(`${API_URL}/poke-lounge/rooms/${roomCode}`);
}

async function pollRoom(
  roomCode: string,
  predicate: (room: PublicRoom) => boolean,
  timeoutMs = 30_000,
): Promise<PublicRoom> {
  const startedAt = Date.now();
  let latest: PublicRoom | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await fetchRoom(roomCode);
    if (predicate(latest)) return latest;
    await new Promise(function resolvePromise(resolve) {
      return setTimeout(resolve, 250);
    });
  }
  throw new Error(
    `Timed out polling room ${roomCode}; last revision=${latest?.revision ?? "unavailable"}`,
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as { success?: boolean; data?: T; message?: unknown } | T;
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${new URL(url).pathname}`);
  }
  if (body && typeof body === "object" && "data" in body) {
    return body.data as T;
  }
  return body as T;
}

function findBracket(value: unknown, depth = 0): TournamentBracket | null {
  if (!value || typeof value !== "object" || depth > 5) return null;
  const candidate = value as Partial<TournamentBracket>;
  if (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.participants) &&
    "currentRound" in candidate &&
    Array.isArray(candidate.completedRounds)
  ) {
    return candidate as TournamentBracket;
  }
  for (const nested of Object.values(value)) {
    const result = findBracket(nested, depth + 1);
    if (result) return result;
  }
  return null;
}

async function expectBracketConvergence(
  testers: TesterRuntime[],
  expected: TournamentBracket,
): Promise<void> {
  const expectedCanonical = canonicalJson(canonicalizeBracketBySeed(expected));
  for (const tester of testers) {
    await expect
      .poll(
        function pollExpectation() {
          return readBrowserBracket(tester.page).then(function handleResolved(bracket) {
            return bracket ? canonicalJson(canonicalizeBracketBySeed(bracket)) : null;
          });
        },
        { timeout: 30_000 },
      )
      .toBe(expectedCanonical);
  }
}

async function readBrowserBracket(page: Page): Promise<TournamentBracket | null> {
  return page.evaluate(function evaluatePage() {
    const state = (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { getGameStateSnapshot(): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.getGameStateSnapshot();
    const find = (value: unknown, depth = 0): unknown => {
      if (!value || typeof value !== "object" || depth > 5) return null;
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.version === "number" &&
        Array.isArray(candidate.participants) &&
        "currentRound" in candidate &&
        Array.isArray(candidate.completedRounds)
      ) {
        return candidate;
      }
      for (const nested of Object.values(candidate)) {
        const result = find(nested, depth + 1);
        if (result) return result;
      }
      return null;
    };
    return find(state) as TournamentBracket | null;
  });
}

async function getActiveSceneKey(page: Page): Promise<string | null> {
  return page.evaluate(function evaluatePage() {
    return (
      (
        window as Window & { __POKE_LOUNGE_E2E__?: { getActiveSceneKey(): string | null } }
      ).__POKE_LOUNGE_E2E__?.getActiveSceneKey() ?? null
    );
  });
}

async function getBattleSnapshot(page: Page): Promise<BattleSnapshot | null> {
  return page.evaluate(function evaluatePage() {
    return (
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getBattleSnapshot(): BattleSnapshot | null };
        }
      ).__POKE_LOUNGE_E2E__?.getBattleSnapshot() ?? null
    );
  });
}

function parseRecoveryCursor(method: string, rawUrl: string): RecoveryCursor | null {
  if (method !== "GET") return null;
  const url = new URL(rawUrl);
  const apiUrl = new URL(API_URL);
  if (url.origin !== apiUrl.origin) return null;
  const roomCode = /^\/poke-lounge\/rooms\/([A-Z0-9]{1,6})\/?$/.exec(url.pathname)?.[1];
  const rawAfterRevision = url.searchParams.get("afterRevision");
  if (!roomCode || !rawAfterRevision || !/^\d+$/.test(rawAfterRevision)) return null;
  const afterRevision = Number(rawAfterRevision);
  return Number.isSafeInteger(afterRevision) ? { roomCode, afterRevision } : null;
}

function recordRecoveryRequest(
  tester: TesterRuntime,
  phase: TransportEvidencePhase,
  cursor: RecoveryCursor,
  observedAtMs: number,
): RecoveryRequestEvidence {
  const existing = tester.recoveryRequests.find(function findItem(candidate) {
    return (
      candidate.phase === phase &&
      candidate.roomCode === cursor.roomCode &&
      candidate.afterRevision === cursor.afterRevision
    );
  });
  if (existing) {
    existing.requestCount += 1;
    existing.lastObservedAtMs = observedAtMs;
    return existing;
  }

  const evidence: RecoveryRequestEvidence = {
    phase,
    ...cursor,
    requestCount: 1,
    firstObservedAtMs: observedAtMs,
    lastObservedAtMs: observedAtMs,
    statuses: [],
  };
  tester.recoveryRequests.push(evidence);
  return evidence;
}

function recordSanitizedRecoveryStatus(evidence: RecoveryRequestEvidence, status: number): void {
  const existing = evidence.statuses.find(function findItem(candidate) {
    return candidate.status === status;
  });
  if (existing) {
    existing.count += 1;
    return;
  }
  evidence.statuses.push({ status, count: 1 });
}

function getRecoveryRequestTotal(tester: TesterRuntime): number {
  return tester.recoveryRequests.reduce(function reduceItems(total, evidence) {
    return total + evidence.requestCount;
  }, 0);
}

function getRecoveryRequestTotalForPhase(
  tester: TesterRuntime,
  phase: TransportEvidencePhase,
): number {
  return tester.recoveryRequests
    .filter(function filterItem(evidence) {
      return evidence.phase === phase;
    })
    .reduce(function reduceItems(total, evidence) {
      return total + evidence.requestCount;
    }, 0);
}

function getRecoveryResponseTotal(evidence: RecoveryRequestEvidence): number {
  return evidence.statuses.reduce(function reduceItems(total, status) {
    return total + status.count;
  }, 0);
}

function findRecoveryEvidence(
  tester: TesterRuntime,
  phase: TransportEvidencePhase,
  roomCode: string,
  afterRevision?: number,
): RecoveryRequestEvidence | undefined {
  return tester.recoveryRequests.find(function findItem(candidate) {
    return (
      candidate.phase === phase &&
      candidate.roomCode === roomCode &&
      (afterRevision === undefined || candidate.afterRevision === afterRevision)
    );
  });
}

async function waitForRecoveryEvidence(
  tester: TesterRuntime,
  phase: TransportEvidencePhase,
  roomCode: string,
  afterRevision?: number,
): Promise<RecoveryRequestEvidence> {
  await expect
    .poll(
      function pollExpectation() {
        const evidence = findRecoveryEvidence(tester, phase, roomCode, afterRevision);
        return evidence ? getRecoveryResponseTotal(evidence) : 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const evidence = findRecoveryEvidence(tester, phase, roomCode, afterRevision);
  if (!evidence) throw new Error(`Tester ${tester.id} did not expose recovery evidence`);
  return evidence;
}

function expectSuccessfulRecoveryResponse(evidence: RecoveryRequestEvidence): void {
  expect(getRecoveryResponseTotal(evidence)).toBeGreaterThan(0);
  expect(
    evidence.statuses.every(function testItem(status) {
      return status.status >= 200 && status.status < 300;
    }),
    `Recovery request contained a non-success status: ${JSON.stringify(evidence.statuses)}`,
  ).toBe(true);
}

function snapshotRecoveryRequests(tester: TesterRuntime): RecoveryRequestEvidence[] {
  return tester.recoveryRequests.map(function mapItem(evidence) {
    return {
      ...evidence,
      statuses: evidence.statuses.map(function mapItem(status) {
        return { ...status };
      }),
    };
  });
}

async function appendFailureTimeTransportRecord(
  tester: TesterRuntime,
  phase: string,
  quiescenceBaseline: RecoveryQuiescenceBaseline | null = null,
): Promise<FailureTimeTransportRecord> {
  const runtime = await readTesterRuntimeState(tester.page);
  const record: FailureTimeTransportRecord = {
    phase,
    observedAtMs: Date.now(),
    transportDiagnostics: runtime.transportDiagnostics,
    recoveryRequests: snapshotRecoveryRequests(tester),
    quiescenceBaseline,
  };
  tester.failureTimeTransportRecords.push(record);
  return record;
}

async function waitForWebSocketUpgrade(tester: TesterRuntime): Promise<void> {
  try {
    await expect
      .poll(
        function pollExpectation() {
          return readTesterRuntimeState(tester.page).then(function handleResolved(runtime) {
            return runtime.transportDiagnostics?.socketConnected === true
              ? runtime.transportDiagnostics.activeTransport
              : null;
          });
        },
        { timeout: 30_000 },
      )
      .toBe("websocket");
  } catch {
    const record = await appendFailureTimeTransportRecord(tester, "C1_WEBSOCKET_UPGRADE");
    throw new Error(
      `Tester ${tester.id} did not reach activeTransport=websocket before C1 stability; diagnostics=${JSON.stringify(record)}`,
    );
  }
}

async function waitForHealthyRecoveryQuiescence(
  tester: TesterRuntime,
  phase: string,
): Promise<RecoveryQuiescenceBaseline> {
  try {
    await expect
      .poll(
        function pollExpectation() {
          return readTesterRuntimeState(tester.page).then(function handleResolved(runtime) {
            const diagnostics = runtime.transportDiagnostics;
            return (
              diagnostics?.socketConnected === true &&
              diagnostics.activeTransport === "websocket" &&
              diagnostics.recoveryInFlight === false &&
              diagnostics.recoveryTimerScheduled === false &&
              diagnostics.subscriptionFailed === false &&
              diagnostics.recoveryAttempt === 0
            );
          });
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  } catch {
    const record = await appendFailureTimeTransportRecord(tester, `${phase}_QUIESCENCE`);
    throw new Error(
      `Tester ${tester.id} did not reach healthy recovery quiescence; diagnostics=${JSON.stringify(record)}`,
    );
  }

  const runtime = await readTesterRuntimeState(tester.page);
  const transportDiagnostics = runtime.transportDiagnostics;
  if (
    transportDiagnostics === null ||
    !transportDiagnostics.socketConnected ||
    transportDiagnostics.activeTransport !== "websocket" ||
    transportDiagnostics.recoveryInFlight ||
    transportDiagnostics.recoveryTimerScheduled ||
    transportDiagnostics.subscriptionFailed ||
    transportDiagnostics.recoveryAttempt !== 0
  ) {
    throw new Error(`Tester ${tester.id} changed recovery state while recording quiescence.`);
  }

  return {
    observedAtMs: Date.now(),
    recoveryRequestTotal: getRecoveryRequestTotal(tester),
    transportDiagnostics,
  };
}

async function assertRecoveryStability(
  tester: TesterRuntime,
  phase = "C1_STABILITY",
  quiescenceBaseline: RecoveryQuiescenceBaseline | null = null,
): Promise<void> {
  const totalBefore = getRecoveryRequestTotal(tester);
  const responseTotalBefore = tester.recoveryRequests.reduce(function reduceItems(total, evidence) {
    return total + getRecoveryResponseTotal(evidence);
  }, 0);
  await tester.page.waitForTimeout(RECOVERY_STABILITY_WINDOW_MS);
  const totalAfter = getRecoveryRequestTotal(tester);
  const responseTotalAfter = tester.recoveryRequests.reduce(function reduceItems(total, evidence) {
    return total + getRecoveryResponseTotal(evidence);
  }, 0);
  const requestDelta = totalAfter - totalBefore;
  const responseDelta = responseTotalAfter - responseTotalBefore;
  const runtime = await readTesterRuntimeState(tester.page);
  const diagnostics = runtime.transportDiagnostics;
  const requestsSucceeded = tester.recoveryRequests.every(function testItem(evidence) {
    return evidence.statuses.every(function testItem(status) {
      return status.status >= 200 && status.status < 300;
    });
  });
  const transportHealthy =
    diagnostics?.socketConnected === true &&
    diagnostics.activeTransport === "websocket" &&
    diagnostics.recoveryInFlight === false &&
    diagnostics.recoveryTimerScheduled === false &&
    diagnostics.subscriptionFailed === false &&
    diagnostics.recoveryAttempt === 0;
  const stable =
    requestDelta >= 0 &&
    requestDelta <= 1 &&
    responseDelta >= requestDelta &&
    requestsSucceeded &&
    transportHealthy;

  if (!stable) {
    const record = await appendFailureTimeTransportRecord(tester, phase, quiescenceBaseline);
    expect(
      stable,
      `Tester ${tester.id} recovery was not bounded and healthy during ${RECOVERY_STABILITY_WINDOW_MS}ms stability window; requestDelta=${requestDelta}; responseDelta=${responseDelta}; diagnostics=${JSON.stringify(record)}`,
    ).toBe(true);
    return;
  }
}

async function reconnectContextWithoutReload(tester: TesterRuntime): Promise<{
  before: RecoveryCursor;
  after: RecoveryCursor;
}>;
async function reconnectContextWithoutReload(
  tester: TesterRuntime,
  reconnectPhase: "C4T-reconnect",
): Promise<{
  before: RecoveryCursor;
  after: RecoveryCursor;
}>;
async function reconnectContextWithoutReload(
  tester: TesterRuntime,
  reconnectPhase: "same-page-reconnect" | "C4T-reconnect" = "same-page-reconnect",
): Promise<{
  before: RecoveryCursor;
  after: RecoveryCursor;
}> {
  const beforeRuntime = await readTesterRuntimeState(tester.page);
  if (beforeRuntime.revision === null) {
    throw new Error(`Tester ${tester.id} has no runtime revision before reconnect`);
  }
  const previousRecovery = tester.recoveryRequests.at(-1);
  if (!previousRecovery) {
    throw new Error(`Tester ${tester.id} has no recovery cursor before reconnect`);
  }
  const currentTerminalCursor = beforeRuntime.transportDiagnostics?.lastAppliedTerminalRevision;
  if (reconnectPhase === "C4T-reconnect" && currentTerminalCursor === null) {
    throw new Error(`Tester ${tester.id} has no terminal cursor before C4T reconnect`);
  }
  const before: RecoveryCursor = {
    roomCode: previousRecovery.roomCode,
    afterRevision:
      reconnectPhase === "C4T-reconnect" ? currentTerminalCursor! : previousRecovery.afterRevision,
  };
  expect(beforeRuntime.revision).toBeGreaterThanOrEqual(before.afterRevision);
  const recoveryCount = getRecoveryRequestTotalForPhase(tester, reconnectPhase);
  const pageUrl = tester.page.url();
  tester.transportEvidencePhase = reconnectPhase;

  await tester.context.setOffline(true);
  await tester.page.waitForTimeout(500);
  await tester.context.setOffline(false);
  await expect
    .poll(
      function pollExpectation() {
        return Promise.resolve(getRecoveryRequestTotalForPhase(tester, reconnectPhase));
      },
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(recoveryCount);
  const afterEvidence = await waitForRecoveryEvidence(
    tester,
    reconnectPhase,
    before.roomCode,
    before.afterRevision,
  );
  const recoveryDelta = getRecoveryRequestTotalForPhase(tester, reconnectPhase) - recoveryCount;
  expect(recoveryDelta).toBeGreaterThanOrEqual(1);
  // A 500ms offline interval can include scheduler retries and a post-connect recovery.
  expect(recoveryDelta).toBeLessThanOrEqual(MAX_RECOVERY_REQUESTS_PER_RECONNECT);
  expect(afterEvidence.requestCount).toBeLessThanOrEqual(MAX_RECOVERY_REQUESTS_PER_RECONNECT);
  expectSuccessfulRecoveryResponse(afterEvidence);
  const after: RecoveryCursor = {
    roomCode: afterEvidence.roomCode,
    afterRevision: afterEvidence.afterRevision,
  };

  expect(tester.page.url()).toBe(pageUrl);
  expect(after.roomCode).toBe(before.roomCode);
  expect(after.afterRevision).toBe(before.afterRevision);
  await expect
    .poll(
      function pollExpectation() {
        return readTesterRuntimeState(tester.page).then(function handleResolved(runtime) {
          return runtime.revision;
        });
      },
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThanOrEqual(after.afterRevision);
  const quiescenceBaseline = await waitForHealthyRecoveryQuiescence(tester, reconnectPhase);
  tester.transportEvidencePhase = "steady";
  await assertRecoveryStability(
    tester,
    reconnectPhase === "same-page-reconnect"
      ? "FAULT_002_RECONNECT_STABILITY"
      : "C4T_RECONNECT_STABILITY",
    quiescenceBaseline,
  );
  return { before, after };
}

async function trackWorldBattleStarts(page: Page): Promise<void> {
  await page.evaluate(function evaluatePage() {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { beginWorldBattleLaunchTracking(): void };
      }
    ).__POKE_LOUNGE_E2E__?.beginWorldBattleLaunchTracking();
  });
}

async function getTrackedWorldBattleStarts(page: Page): Promise<BattleLaunchEvidence[]> {
  return page.evaluate(function evaluatePage() {
    return (
      (
        window as Window & {
          __POKE_LOUNGE_E2E__?: { getWorldBattleLaunches(): BattleLaunchEvidence[] };
        }
      ).__POKE_LOUNGE_E2E__?.getWorldBattleLaunches() ?? []
    );
  });
}

async function captureTerminalConvergence(
  tester: TesterRuntime,
  phase: TerminalConvergencePhase,
  runtimeState?: TesterRuntimeState,
): Promise<TesterRuntimeState> {
  const runtime = runtimeState ?? (await readTesterRuntimeState(tester.page));
  tester.terminalConvergence[phase] = runtime;
  return runtime;
}

async function readTesterRuntimeState(page: Page): Promise<TesterRuntimeState> {
  return page.evaluate(function evaluatePage() {
    type UnknownRecord = Record<string, unknown>;
    const isRecord = (value: unknown): value is UnknownRecord =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);
    const pokeWindow = window as Window & {
      __POKE_LOUNGE_E2E__?: {
        getActiveSceneKey(): string | null;
        getBattleSnapshot(): BattleSnapshot | null;
        getGameStateSnapshot(): unknown;
        getRoomTransportDiagnostics?(): unknown;
      };
    };
    const controller = pokeWindow.__POKE_LOUNGE_E2E__;
    let transportDiagnostics: TesterRuntimeState["transportDiagnostics"] = null;
    try {
      const candidate = controller?.getRoomTransportDiagnostics?.();
      const candidateRecord = isRecord(candidate) ? candidate : null;
      const validTransportState =
        candidateRecord !== null &&
        (candidateRecord.transportState === "not-created" ||
          candidateRecord.transportState === "connected" ||
          candidateRecord.transportState === "disconnected");
      const validActiveTransport =
        candidateRecord !== null &&
        (candidateRecord.activeTransport === null ||
          candidateRecord.activeTransport === "polling" ||
          candidateRecord.activeTransport === "websocket" ||
          candidateRecord.activeTransport === "unknown");
      const validErrorKind =
        candidateRecord !== null &&
        (candidateRecord.lastSocketErrorKind === null ||
          candidateRecord.lastSocketErrorKind === "connect_error" ||
          candidateRecord.lastSocketErrorKind === "disconnect" ||
          candidateRecord.lastSocketErrorKind === "subscription_error" ||
          candidateRecord.lastSocketErrorKind === "invalid_snapshot");
      const validErrorClass =
        candidateRecord !== null &&
        (candidateRecord.lastSocketConnectErrorClass === null ||
          candidateRecord.lastSocketConnectErrorClass === "websocket_error" ||
          candidateRecord.lastSocketConnectErrorClass === "timeout" ||
          candidateRecord.lastSocketConnectErrorClass === "server_reject" ||
          candidateRecord.lastSocketConnectErrorClass === "cors" ||
          candidateRecord.lastSocketConnectErrorClass === "unknown");
      const validRecoveryFailureKind =
        candidateRecord !== null &&
        (candidateRecord.lastRecoveryFailureKind === null ||
          candidateRecord.lastRecoveryFailureKind === "canonical_mismatch" ||
          candidateRecord.lastRecoveryFailureKind === "transition_merge" ||
          candidateRecord.lastRecoveryFailureKind === "recovery_parse" ||
          candidateRecord.lastRecoveryFailureKind === "unknown");
      const validTerminalCursor =
        candidateRecord !== null &&
        (candidateRecord.lastAppliedTerminalRevision === null ||
          (typeof candidateRecord.lastAppliedTerminalRevision === "number" &&
            Number.isSafeInteger(candidateRecord.lastAppliedTerminalRevision) &&
            candidateRecord.lastAppliedTerminalRevision >= 0));
      if (
        validTransportState &&
        validActiveTransport &&
        validErrorKind &&
        validErrorClass &&
        validRecoveryFailureKind &&
        validTerminalCursor &&
        candidateRecord !== null &&
        typeof candidateRecord.socketConnected === "boolean" &&
        typeof candidateRecord.recoveryAttempt === "number" &&
        typeof candidateRecord.recoveryInFlight === "boolean" &&
        typeof candidateRecord.recoveryTimerScheduled === "boolean" &&
        typeof candidateRecord.subscriptionFailed === "boolean"
      ) {
        transportDiagnostics = {
          socketConnected: candidateRecord.socketConnected,
          transportState: candidateRecord.transportState,
          activeTransport: candidateRecord.activeTransport,
          recoveryAttempt: candidateRecord.recoveryAttempt,
          recoveryInFlight: candidateRecord.recoveryInFlight,
          recoveryTimerScheduled: candidateRecord.recoveryTimerScheduled,
          subscriptionFailed: candidateRecord.subscriptionFailed,
          lastAppliedTerminalRevision: candidateRecord.lastAppliedTerminalRevision,
          lastSocketErrorKind: candidateRecord.lastSocketErrorKind,
          lastSocketConnectErrorClass: candidateRecord.lastSocketConnectErrorClass,
          lastRecoveryFailureKind: candidateRecord.lastRecoveryFailureKind,
        };
      }
    } catch {
      transportDiagnostics = null;
    }
    const state = controller?.getGameStateSnapshot();
    const stateRecord: UnknownRecord = isRecord(state) ? state : {};
    const tournamentState: UnknownRecord = isRecord(stateRecord.tournament)
      ? stateRecord.tournament
      : {};
    const serverProjection = isRecord(tournamentState.serverProjection)
      ? tournamentState.serverProjection
      : null;
    const serverTournament = isRecord(serverProjection?.tournament)
      ? serverProjection.tournament
      : null;
    const serverRound = isRecord(serverProjection?.roomRound) ? serverProjection.roomRound : null;
    const bracket = isRecord(serverTournament?.bracket) ? serverTournament.bracket : null;
    const currentRound = isRecord(bracket?.currentRound) ? bracket.currentRound : null;
    const finalStandings = Array.isArray(serverProjection?.finalStandings)
      ? serverProjection.finalStandings.flatMap(function mapItem(standing) {
          if (!isRecord(standing)) return [];
          return typeof standing.playerId === "string" &&
            typeof standing.displayName === "string" &&
            typeof standing.score === "number" &&
            typeof standing.rank === "number"
            ? [
                {
                  playerId: standing.playerId,
                  displayName: standing.displayName,
                  score: standing.score,
                  rank: standing.rank,
                },
              ]
            : [];
        })
      : [];
    const activeScene = controller?.getActiveSceneKey() ?? null;
    const battle = controller?.getBattleSnapshot() ?? null;
    const competitive = activeScene === "battle" ? (battle?.competitive ?? null) : null;

    return {
      currentPlayerId:
        typeof stateRecord.currentPlayerId === "string" ? stateRecord.currentPlayerId : "",
      roomStatus:
        typeof serverProjection?.roomStatus === "string" ? serverProjection.roomStatus : null,
      gameRound: typeof serverRound?.index === "number" ? serverRound.index : null,
      finalStandings,
      revision: typeof serverProjection?.revision === "number" ? serverProjection.revision : null,
      round: typeof currentRound?.roundNumber === "number" ? currentRound.roundNumber : null,
      activeMatchId:
        typeof serverTournament?.activeMatchId === "string" ? serverTournament.activeMatchId : null,
      activeMatchTransport:
        typeof serverProjection?.activeMatchTransport === "string"
          ? serverProjection.activeMatchTransport
          : null,
      canonicalBracket: bracket as TesterRuntimeState["canonicalBracket"],
      activeScene,
      battle,
      competitive,
      transportDiagnostics,
    };
  });
}

async function completeRemainingTournamentMatches(input: {
  roomCode: string;
  testers: TesterRuntime[];
  startingRoom: PublicRoom;
  completedMatchIds: Set<string>;
  networkErrors: Array<{ tester: number; kind: "http-5xx" | "pageerror"; detail: string }>;
  forcedSwitchEvidence: ForcedSwitchEvidence[];
}): Promise<PublicRoom> {
  let room = input.startingRoom;

  while (room.status !== "completed") {
    room = await pollRoom(
      input.roomCode,
      function callback(candidate) {
        return (
          candidate.status === "completed" ||
          Boolean(
            candidate.competitive && !input.completedMatchIds.has(candidate.competitive.matchId),
          )
        );
      },
      90_000,
    );
    if (room.status === "completed") break;

    const projection = room.competitive;
    if (!projection) {
      throw new Error(`Round ${room.round.index} did not expose an authoritative match.`);
    }
    const players = projection.playerIds.map(function mapItem(playerId) {
      return input.testers.find(function findItem(tester) {
        return tester.playerId === playerId;
      });
    });
    if (!players[0] || !players[1]) {
      throw new Error(`Match ${projection.matchId} has an unknown browser identity.`);
    }
    const activePlayers: [TesterRuntime, TesterRuntime] = [players[0], players[1]];
    await Promise.all(
      activePlayers.map(async function mapItem(tester) {
        await expect
          .poll(
            async function pollExpectation() {
              return (await readTesterRuntimeState(tester.page)).competitive?.matchId;
            },
            {
              timeout: 30_000,
            },
          )
          .toBe(projection.matchId);
      }),
    );

    const bracketRound = findBracket(room.tournament)?.currentRound?.roundNumber ?? 0;
    const gameRound = room.round.index;
    const startingRevision = room.revision;
    await finishBattleWithInput(
      input.roomCode,
      activePlayers,
      input.networkErrors,
      input.forcedSwitchEvidence,
    );
    const terminalRoom = await pollRoom(
      input.roomCode,
      function callback(candidate) {
        return (
          candidate.revision > startingRevision &&
          (candidate.status === "completed" ||
            candidate.round.index > gameRound ||
            candidate.competitive?.matchId !== projection.matchId ||
            Boolean(candidate.competitive?.terminal) ||
            isTournamentMatchCompleted(
              findBracket(candidate.tournament),
              projection.bracketMatchId,
            ))
        );
      },
      120_000,
    );
    const terminalStates = await Promise.all(
      activePlayers.map(function mapItem(tester) {
        return waitForOldMatchTerminalResult({
          tester,
          oldMatchId: projection.matchId,
          terminalRevision: terminalRoom.revision,
        });
      }),
    );
    const result = readTerminalResult(terminalStates[0].battle?.result);
    expect(result).not.toBeNull();
    expect(readTerminalResult(terminalStates[1].battle?.result)).toEqual(result);
    expect([result!.winnerPlayerId, result!.loserPlayerId].sort()).toEqual(
      [...projection.playerIds].sort(),
    );

    input.completedMatchIds.add(projection.matchId);
    if (input.completedMatchIds.size > 12) {
      throw new Error("A 5-player three-round cycle produced more than 12 matches.");
    }
    const checkpoint = `C5_GAME_${gameRound}_BRACKET_${bracketRound}_MATCH_${input.completedMatchIds.size}`;
    for (const tester of input.testers) {
      const activeIndex = activePlayers.indexOf(tester);
      await recordCheckpoint(
        tester,
        checkpoint,
        activeIndex >= 0 ? "terminal result" : "observer battle",
        "PASS",
        activeIndex >= 0 ? terminalStates[activeIndex] : undefined,
      );
    }
    await captureCheckpointScreenshots(activePlayers, `${checkpoint}_TERMINAL`);

    await Promise.all(
      activePlayers.map(function mapItem(tester) {
        return waitForPostConfirmRuntime(
          tester,
          projection.matchId,
          result!.winnerPlayerId === tester.playerId ? "win" : "loss",
        ).then(function handleResolved(runtime) {
          tester.terminalConvergence["post-confirm"] = runtime;
        });
      }),
    );
    room = terminalRoom;
  }

  expect(input.completedMatchIds.size).toBe(12);
  return pollRoom(
    input.roomCode,
    function callback(candidate) {
      return candidate.status === "completed" && candidate.finalStandings.length === 5;
    },
    30_000,
  );
}

function isTournamentMatchCompleted(bracket: TournamentBracket | null, matchId: string): boolean {
  if (!bracket) return false;
  return [bracket.currentRound, ...bracket.completedRounds]
    .filter(function filterItem(round): round is TournamentRound {
      return round !== null;
    })
    .some(function testItem(round) {
      return round.matches.some(function testItem(match) {
        return match.matchId === matchId && match.status === "completed";
      });
    });
}

async function expectFinalRoomConvergence(
  testers: TesterRuntime[],
  room: PublicRoom,
): Promise<void> {
  const expectedStandings = canonicalJson(room.finalStandings);
  await Promise.all(
    testers.map(async function mapItem(tester) {
      const completedRuntime = await readTesterRuntimeState(tester.page);
      if (completedRuntime.activeScene === "battle" && completedRuntime.competitive?.matchId) {
        await waitForPostConfirmRuntime(tester, completedRuntime.competitive.matchId, "loss");
      }
      await expect
        .poll(
          async function pollExpectation() {
            const runtime = await readTesterRuntimeState(tester.page);
            const normalizedStandings = runtime.finalStandings.map(function mapItem(standing) {
              return {
                ...standing,
                playerId:
                  standing.playerId === runtime.currentPlayerId && tester.playerId
                    ? tester.playerId
                    : standing.playerId,
              };
            });
            return {
              roomStatus: runtime.roomStatus,
              gameRound: runtime.gameRound,
              finalStandings: canonicalJson(normalizedStandings),
              activeScene: runtime.activeScene,
            };
          },
          { timeout: 30_000 },
        )
        .toEqual({
          roomStatus: "completed",
          gameRound: 3,
          finalStandings: expectedStandings,
          activeScene: "world",
        });
      await recordCheckpoint(tester, "C5_FINAL_WINNER", "final standings and winner", "PASS");
    }),
  );
}

async function prepareFinalWinnerCapture(tester: TesterRuntime): Promise<void> {
  await tester.page.evaluate(function evaluatePage() {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { closeWorldShortcutGuide(): void };
      }
    ).__POKE_LOUNGE_E2E__?.closeWorldShortcutGuide();
  });
  const mobileClose = tester.page.locator("[data-poke-lounge-mobile-deck-close='true']");
  if (
    await mobileClose.isVisible().catch(function handleRejected() {
      return false;
    })
  ) {
    await mobileClose.click();
  }
  const settingsClose = tester.page.locator("[data-poke-lounge-mobile-settings-close='true']");
  if (
    await settingsClose.isVisible().catch(function handleRejected() {
      return false;
    })
  ) {
    await settingsClose.click();
  }
  await expect(
    tester.page.locator("[data-poke-lounge-mobile-fullscreen-scene='true']"),
  ).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(
      function pollExpectation() {
        return tester.page.evaluate(function evaluatePage() {
          return (
            (
              window as Window & {
                __POKE_LOUNGE_E2E__?: {
                  getWorldSnapshot(): { shortcutGuideOpen: boolean } | null;
                };
              }
            ).__POKE_LOUNGE_E2E__?.getWorldSnapshot()?.shortcutGuideOpen ?? null
          );
        });
      },
      { timeout: 10_000 },
    )
    .toBe(false);
}

async function waitForOldMatchTerminalResult(input: {
  tester: TesterRuntime;
  oldMatchId: string;
  terminalRevision: number;
}): Promise<TesterRuntimeState> {
  const deadline = Date.now() + 15_000;
  let latest: TesterRuntimeState | null = null;

  while (Date.now() < deadline) {
    latest = await readTesterRuntimeState(input.tester.page);
    const battleResult = latest.battle?.result;
    const terminal = readTerminalResult(latest.competitive?.terminal);
    const oldWaiting =
      latest.competitive?.matchId === input.oldMatchId &&
      !battleResult &&
      latest.battle?.message?.includes("상대의 선택을 기다리는 중") === true;

    if (latest.revision !== null && latest.revision >= input.terminalRevision && oldWaiting) {
      throw new Error(
        `C3T stale old-match waiting state: tester=${input.tester.id}, state=${JSON.stringify(latest)}`,
      );
    }

    if (
      latest.activeScene === "battle" &&
      latest.competitive?.matchId === input.oldMatchId &&
      latest.competitive.status === "completed" &&
      battleResult &&
      terminal
    ) {
      return latest;
    }

    await input.tester.page.waitForTimeout(100);
  }

  throw new Error(
    `C3T terminal result was not observed before confirm: tester=${input.tester.id}, oldMatchId=${input.oldMatchId}, state=${JSON.stringify(latest)}`,
  );
}

async function waitForPostConfirmRuntime(
  tester: TesterRuntime,
  oldMatchId: string,
  expectedResult: "win" | "loss",
): Promise<TesterRuntimeState> {
  const deadline = Date.now() + 15_000;
  let latest: TesterRuntimeState | null = null;

  while (Date.now() < deadline) {
    latest = await readTesterRuntimeState(tester.page);
    const leftOldBattle =
      latest.activeScene === "world" ||
      (latest.activeScene === "battle" && latest.competitive?.matchId !== oldMatchId);
    const roleMatches = expectedResult === "loss" ? latest.activeScene === "world" : leftOldBattle;

    if (leftOldBattle && roleMatches) {
      return latest;
    }

    if (tester.input === "touch") {
      await tapMobileBattleOption(tester.page, "battle-message", "button");
    } else {
      await confirmBattleForTest(tester.page);
      await tester.page.waitForTimeout(75);
    }
    await tester.page.waitForTimeout(100);
  }

  throw new Error(
    `Post-confirm runtime did not leave old battle: tester=${tester.id}, oldMatchId=${oldMatchId}, state=${JSON.stringify(latest)}`,
  );
}

async function waitForC4RuntimeConvergence(input: {
  tester: TesterRuntime;
  nextRoom: PublicRoom;
  nextBracket: TournamentBracket;
  oldMatchId: string;
}): Promise<TesterRuntimeState> {
  const deadline = Date.now() + 15_000;
  const expectedCompetitive = input.tester.playerId
    ? selectCompetitiveAssignment(
        input.nextRoom.competitiveAssignments,
        input.tester.playerId,
        input.nextRoom.round.index,
      )
    : null;
  const expectedActiveMatchId =
    typeof input.nextRoom.tournament.activeMatchId === "string"
      ? input.nextRoom.tournament.activeMatchId
      : null;
  const expectedBracket = canonicalJson(canonicalizeBracketBySeed(input.nextBracket));
  let latest: TesterRuntimeState | null = null;

  if (!expectedCompetitive || !expectedActiveMatchId || !input.tester.playerId) {
    throw new Error("C4T requires the next authoritative assignment");
  }
  while (Date.now() < deadline) {
    latest = await readTesterRuntimeState(input.tester.page);
    const oldWaiting =
      latest.competitive?.matchId === input.oldMatchId &&
      !latest.battle?.result &&
      latest.battle?.message?.includes("상대의 선택을 기다리는 중") === true;

    if (latest.revision !== null && latest.revision >= input.nextRoom.revision && oldWaiting) {
      throw new Error(
        `C4T stale old-match waiting state: tester=${input.tester.id}, state=${JSON.stringify(latest)}`,
      );
    }

    const commonStateMatches =
      latest.revision !== null &&
      latest.revision >= input.nextRoom.revision &&
      latest.round === input.nextBracket.currentRound?.roundNumber &&
      latest.activeMatchId === expectedActiveMatchId &&
      latest.activeMatchTransport === "authority" &&
      latest.canonicalBracket !== null &&
      canonicalJson(canonicalizeBracketBySeed(latest.canonicalBracket)) === expectedBracket;
    const roleStateMatches =
      latest.activeScene === "battle" &&
      latest.battle !== null &&
      latest.competitive?.matchId === expectedCompetitive.matchId &&
      latest.competitive.bracketMatchId === expectedCompetitive.bracketMatchId &&
      latest.competitive.currentTurn === expectedCompetitive.currentTurn &&
      latest.competitive.status === expectedCompetitive.status;

    if (commonStateMatches && roleStateMatches) {
      return latest;
    }

    await input.tester.page.waitForTimeout(100);
  }

  throw new Error(
    `C4T runtime did not converge: tester=${input.tester.id}, expectedMatch=${expectedCompetitive.matchId}, state=${JSON.stringify(latest)}`,
  );
}

function readTerminalResult(
  value: unknown,
): { winnerPlayerId: string; loserPlayerId: string } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;

  return typeof candidate.winnerPlayerId === "string" && typeof candidate.loserPlayerId === "string"
    ? {
        winnerPlayerId: candidate.winnerPlayerId,
        loserPlayerId: candidate.loserPlayerId,
      }
    : null;
}

async function finishBattleWithInput(
  roomCode: string,
  players: [TesterRuntime, TesterRuntime],
  networkErrors: Array<{ tester: number; kind: "http-5xx" | "pageerror"; detail: string }>,
  forcedSwitchEvidence: ForcedSwitchEvidence[],
): Promise<PublicRoom> {
  const deadline = Date.now() + 120_000;
  let firstActionRoom: PublicRoom | null = null;
  let latestRoom: PublicRoom | null = null;
  let latestSnapshots: Array<BattleSnapshot | null> = [];
  const initialRoom = await fetchRoom(roomCode);
  const initialMatchId = initialRoom.competitive?.matchId ?? null;
  const initialCompletedRoundCount =
    findBracket(initialRoom.tournament)?.completedRounds.length ?? 0;

  while (Date.now() < deadline) {
    const runtimeError = networkErrors[0];
    if (runtimeError) {
      throw new Error(
        `Browser runtime error during authority battle: tester=${runtimeError.tester}, kind=${runtimeError.kind}, detail=${runtimeError.detail}`,
      );
    }
    latestRoom = await fetchRoom(roomCode);
    const projection = latestRoom.competitive;
    latestSnapshots = await Promise.all(
      players.map(function mapItem(player) {
        return getBattleSnapshot(player.page);
      }),
    );

    if (!firstActionRoom && projection && projection.submittedPlayerIds.length > 0) {
      expect(projection.status).toBe("active");
      expect(projection.submittedPlayerIds).toContain(players[0].playerId);
      expect(
        projection.submittedPlayerIds.every(function testItem(playerId) {
          return players.some(function testItem(player) {
            return player.playerId === playerId;
          });
        }),
      ).toBe(true);
      firstActionRoom = latestRoom;
    }
    const firstMatchAdvanced = Boolean(
      initialMatchId &&
      ((projection?.matchId && projection.matchId !== initialMatchId) ||
        (findBracket(latestRoom.tournament)?.completedRounds.length ?? 0) >
          initialCompletedRoundCount),
    );
    if (
      projection?.terminal ||
      firstMatchAdvanced ||
      latestSnapshots.every(function testItem(snapshot) {
        return snapshot?.result;
      })
    ) {
      return firstActionRoom ?? latestRoom;
    }

    const actionCandidates = firstActionRoom ? players : [players[0]];
    await Promise.all(
      actionCandidates.map(async function mapItem(tester) {
        const index = players.indexOf(tester);
        const playerId = tester.playerId;
        const snapshot = latestSnapshots[index];
        const authorityPlayer = playerId ? projection?.currentState.playersById[playerId] : null;
        if (!playerId || !snapshot || !projection || !authorityPlayer) return;
        if (projection.submittedPlayerIds.includes(playerId)) return;

        const active = authorityPlayer.team[authorityPlayer.activeSlotIndex];
        const nextAliveSlot = authorityPlayer.team.findIndex(
          function findItemIndex(pokemon, slotIndex) {
            return slotIndex !== authorityPlayer.activeSlotIndex && pokemon.currentHp > 0;
          },
        );
        const forcedSwitch = Boolean(active && active.currentHp <= 0 && nextAliveSlot >= 0);

        if (
          forcedSwitch &&
          !forcedSwitchEvidence.some(function testItem(evidence) {
            return (
              evidence.matchId === projection.matchId &&
              evidence.playerId === playerId &&
              evidence.turn === projection.currentTurn
            );
          })
        ) {
          forcedSwitchEvidence.push({
            tester: tester.id,
            seed: tester.seed,
            matchId: projection.matchId,
            playerId,
            turn: projection.currentTurn,
            fromSlotIndex: authorityPlayer.activeSlotIndex,
            toSlotIndex: nextAliveSlot,
          });
        }

        const moveIndex = Math.max(
          0,
          active.moves.findIndex(function findItemIndex(move) {
            return move.pp > 0;
          }),
        );
        await driveAuthoritativeAction(tester, snapshot, {
          forcedSwitch,
          nextAliveSlot,
          moveIndex,
          yieldWithSwitch:
            forcedSwitchEvidence.length === 0 && tester.seed === 4 && nextAliveSlot >= 0,
        });
      }),
    );
    await new Promise(function resolvePromise(resolve) {
      return setTimeout(resolve, 250);
    });
  }

  throw new Error(
    `Authority battle timed out: room=${roomCode}, turn=${latestRoom?.competitive?.currentTurn ?? "unknown"}, submitted=${latestRoom?.competitive?.submittedPlayerIds.join(",") ?? "unknown"}, snapshots=${JSON.stringify(latestSnapshots)}`,
  );
}

async function driveAuthoritativeAction(
  tester: TesterRuntime,
  snapshot: BattleSnapshot,
  authority: {
    forcedSwitch: boolean;
    nextAliveSlot: number;
    moveIndex: number;
    yieldWithSwitch: boolean;
  },
): Promise<void> {
  if (tester.input === "touch") {
    await driveAuthoritativeTouchAction(tester.page, snapshot, authority);
    return;
  }
  if (snapshot.battleEntrancePlaying || snapshot.phase === "resolving") return;
  if (snapshot.phase === "ended" || snapshot.result) return;
  if (snapshot.message) {
    await confirmBattleForTest(tester.page);
    return;
  }
  if (snapshot.phase === "party-select") {
    if (authority.nextAliveSlot >= 0) {
      await setBattlePartySlotForTest(tester.page, authority.nextAliveSlot);
    }
    await confirmBattleForTest(tester.page);
    return;
  }
  if (snapshot.phase === "command") {
    await setBattleCommandForTest(tester.page, "fight");
    await confirmBattleForTest(tester.page);
    return;
  }
  if (snapshot.phase === "move-select") {
    await setBattleMoveIndexForTest(tester.page, authority.moveIndex);
    await confirmBattleForTest(tester.page);
  }
}

async function driveAuthoritativeTouchAction(
  page: Page,
  snapshot: BattleSnapshot,
  authority: {
    forcedSwitch: boolean;
    nextAliveSlot: number;
    moveIndex: number;
    yieldWithSwitch: boolean;
  },
): Promise<void> {
  if (snapshot.battleEntrancePlaying || snapshot.phase === "resolving") return;
  if (snapshot.phase === "ended" || snapshot.result) return;
  if (snapshot.message) {
    await tapMobileBattleOption(page, "battle-message", "button");
    return;
  }

  if (authority.forcedSwitch || authority.yieldWithSwitch) {
    if (snapshot.phase === "move-select") {
      await tapMobileBattleOption(page, "battle-moves", "button");
      return;
    }
    if (snapshot.phase === "command") {
      await tapMobileBattleOption(page, "battle-command", "button", 2);
      return;
    }
    if (snapshot.phase === "party-select") {
      await tapMobileBattleOption(
        page,
        "battle-party",
        "button[data-current]",
        authority.nextAliveSlot,
      );
    }
    return;
  }

  if (snapshot.phase === "party-select") {
    await tapMobileBattleOption(page, "battle-party", "button");
    return;
  }
  if (snapshot.phase === "command") {
    await tapMobileBattleOption(page, "battle-command", "button");
    return;
  }
  if (snapshot.phase === "move-select") {
    await tapMobileBattleOption(
      page,
      "battle-moves",
      "[data-poke-lounge-mobile-option-grid='moves'] button",
      authority.moveIndex,
    );
  }
}

async function confirmBattleForTest(page: Page): Promise<void> {
  await page.evaluate(function evaluatePage() {
    (
      window as Window & { __POKE_LOUNGE_E2E__?: { confirmBattle(): unknown } }
    ).__POKE_LOUNGE_E2E__?.confirmBattle();
  });
}

async function setBattleCommandForTest(
  page: Page,
  command: BattleSnapshot["selectedCommand"],
): Promise<void> {
  await page.evaluate(function evaluatePage(value) {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setBattleCommand(command: string): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setBattleCommand(value);
  }, command);
}

async function setBattleMoveIndexForTest(page: Page, index: number): Promise<void> {
  await page.evaluate(function evaluatePage(value) {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setBattleMoveIndex(index: number): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setBattleMoveIndex(value);
  }, index);
}

async function setBattlePartySlotForTest(page: Page, slotIndex: number): Promise<void> {
  await page.evaluate(function evaluatePage(value) {
    (
      window as Window & {
        __POKE_LOUNGE_E2E__?: { setBattlePartySlotIndex(index: number): unknown };
      }
    ).__POKE_LOUNGE_E2E__?.setBattlePartySlotIndex(value);
  }, slotIndex);
}

async function tapMobileBattleOption(
  page: Page,
  deck: "battle-message" | "battle-command" | "battle-moves" | "battle-party",
  selector: string,
  index = 0,
): Promise<void> {
  const button = page
    .locator(`[data-poke-lounge-mobile-deck='${deck}']`)
    .locator(selector)
    .nth(index);
  await button.tap({ force: true, timeout: 1_000 }).catch(function handleRejected() {});
  await page.waitForTimeout(75);
}

async function recordCheckpoint(
  tester: TesterRuntime,
  checkpoint: string,
  screenState: string,
  result: string,
  runtimeState?: TesterRuntimeState,
): Promise<void> {
  const runtime = runtimeState ?? (await readTesterRuntimeState(tester.page));
  tester.checkpoints.push({
    checkpoint,
    revision: runtime.revision,
    round: runtime.round,
    activeMatch: runtime.activeMatchId,
    screenState,
    result,
    runtime,
  });
}

async function captureScreenshots(testers: TesterRuntime[]): Promise<void> {
  await Promise.all(
    testers.map(function mapItem(tester) {
      return captureScreenshot(tester);
    }),
  );
}

async function captureCheckpointScreenshots(
  testers: TesterRuntime[],
  checkpoint: string,
): Promise<void> {
  await Promise.all(
    testers.map(function mapItem(tester) {
      return captureScreenshot(tester, checkpoint);
    }),
  );
}

async function captureScreenshot(tester: TesterRuntime, checkpoint?: string): Promise<void> {
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  const suffix = checkpoint ? `-${checkpoint.replaceAll(/[^A-Z0-9_-]/gi, "-")}` : "";
  const screenshot = tester.page
    .screenshot({
      path: path.join(
        RUN_ROOT,
        "screenshots",
        `${tester.fileName.replace(/\.md$/, "")}${suffix}.png`,
      ),
      fullPage: true,
      timeout: SCREENSHOT_CAPTURE_DEADLINE_MS,
    })
    .then(function handleResolved() {
      return undefined;
    })
    .catch(function handleRejected() {
      return undefined;
    });
  const deadline = new Promise<void>(function resolvePromise(resolve) {
    deadlineTimer = setTimeout(resolve, SCREENSHOT_CAPTURE_DEADLINE_MS);
  });

  try {
    await Promise.race([screenshot, deadline]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

async function leaveServerRoom(page: Page): Promise<void> {
  const leaveButton = page.locator("[data-room-leave='true']");
  await expect(leaveButton).toHaveCount(1, { timeout: 10_000 });
  await leaveButton.evaluate(function evaluatePage(button) {
    return (button as HTMLButtonElement).click();
  });
  const dialog = page.locator("[data-poke-lounge-leave-dialog='true']");
  const entryScreen = page.locator("[data-room-entry-screen='true']");
  await expect
    .poll(
      async function pollExpectation() {
        return (
          (await dialog.isVisible().catch(function handleRejected() {
            return false;
          })) ||
          (await entryScreen.isVisible().catch(function handleRejected() {
            return false;
          }))
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  if (
    await dialog.isVisible().catch(function handleRejected() {
      return false;
    })
  ) {
    await dialog.getByRole("button", { name: "방 나가기", exact: true }).click();
  }
  await expect(entryScreen).toBeVisible({ timeout: 30_000 });
}

function writeArtifacts(input: {
  testers: TesterRuntime[];
  roomCode: string;
  overallStatus: "PASS" | "FAIL" | "BLOCKED";
  failure: unknown;
  networkErrors: Array<{ tester: number; kind: string; detail: string }>;
  redisAssertions: unknown;
  initialBracket: TournamentBracket | null;
  nextBracket: TournamentBracket | null;
  oldCompetitiveMatchId: string;
  forcedSwitchEvidence: ForcedSwitchEvidence[];
  projectName: string;
}): void {
  mkdirSync(RUN_ROOT, { recursive: true });
  const commit = readCommit();
  const endedAt = new Date().toISOString();
  const environment = {
    commit,
    node: process.version,
    playwrightProject: input.projectName,
    runId: path.basename(RUN_ROOT),
    endedAt,
    browsers: Object.fromEntries(
      input.testers.map(function mapItem(tester) {
        return [tester.environment, tester.browser.version()];
      }),
    ),
    probes: Object.fromEntries(
      input.testers.map(function mapItem(tester) {
        return [tester.environment, tester.probe];
      }),
    ),
  };
  const matrix = input.testers.map(function mapItem(tester) {
    return {
      tester: tester.id,
      environment: tester.environment,
      viewport: tester.viewport,
      input: tester.input,
      seed: tester.seed,
      role: tester.role,
      status: tester.status,
    };
  });

  writeJson("environment.json", environment);
  writeJson("matrix.json", matrix);
  writeJson("network-errors.json", input.networkErrors);
  writeJson("redis-assertions.json", input.redisAssertions ?? { status: "not-collected" });
  const redisActionEvidence = input.redisAssertions as Partial<RedisAssertions> | null;
  writeJson("forced-switch-evidence.json", {
    client: input.forcedSwitchEvidence,
    redis: {
      actionKindCounts: redisActionEvidence?.actionKindCounts ?? null,
      forcedSwitchTurns: redisActionEvidence?.forcedSwitchTurns ?? [],
    },
  });
  writeJson("client-terminal-convergence.json", {
    oldMatchId: input.oldCompetitiveMatchId || null,
    overallStatus: input.overallStatus,
    testers: input.testers.map(function mapItem(tester) {
      return {
        tester: tester.id,
        seed: tester.seed,
        playerId: tester.playerId,
        snapshots: tester.terminalConvergence,
        transportDiagnostics: tester.checkpoints.at(-1)?.runtime.transportDiagnostics ?? null,
        failureTimeTransportRecords: tester.failureTimeTransportRecords,
        reloadBaselineRecords: tester.reloadBaselineRecords,
        nextBattleLaunches: tester.battleLaunches,
      };
    }),
  });
  writeJson("socket-revisions.json", {
    evidenceModel: {
      transport:
        "polling→websocket: serverRoom의 transports:['polling','websocket'] 설정과 sanitized activeTransport='websocket' 런타임 진단을 모든 context에서 검증",
      recovery:
        "raw URL/body/header/response body 없이 roomCode, afterRevision, phase, request count, observed time, status만 집계",
      cursor:
        "같은 handleSocketConnect가 room.subscribe 직후 동일 lastAppliedTerminalRevision으로 recovery GET을 호출하는 코드 계약과 same-page reconnect의 live GET 증가/runtime 수렴을 결합",
      limitation: "Socket.IO handshake와 subscribe 원문 frame은 수집하거나 저장하지 않음",
    },
    initialBracket: input.initialBracket,
    nextBracket: input.nextBracket,
    checkpoints: input.testers.map(function mapItem(tester) {
      return {
        tester: tester.id,
        recoveryRequests: tester.recoveryRequests,
        failureTimeTransportRecords: tester.failureTimeTransportRecords,
        reloadBaselineRecords: tester.reloadBaselineRecords,
        checkpoints: tester.checkpoints,
      };
    }),
  });

  for (const tester of input.testers) {
    writeFileSync(
      path.join(RUN_ROOT, tester.fileName),
      renderTesterReport(tester, input.roomCode, commit, endedAt),
    );
  }
  writeFileSync(
    path.join(RUN_ROOT, "validation-summary.md"),
    renderSummary(input, commit, endedAt),
  );
}

function renderTesterReport(
  tester: TesterResult,
  roomCode: string,
  commit: string,
  endedAt: string,
): string {
  const checkpointRows = tester.checkpoints.length
    ? tester.checkpoints
        .map(function mapItem(checkpoint) {
          return `| ${checkpoint.checkpoint} | ${checkpoint.revision ?? "-"} | ${checkpoint.round ?? "-"} | ${checkpoint.activeMatch ?? "-"} | ${checkpoint.screenState} | ${checkpoint.result} |`;
        })
        .join("\n")
    : "| 미수집 | - | - | - | 실행 중단 | BLOCKED |";
  return `# Tester ${String(tester.id).padStart(2, "0")} 검증 결과

- 환경: ${tester.environment}
- viewport/input: ${tester.viewport} / ${tester.input}
- seed/역할: ${tester.seed} / ${tester.role}
- build commit: ${commit}
- room code: ${roomCode || "미생성"}
- 종료 시각: ${endedAt}
- 결과: ${tester.status}

## Checkpoint

| checkpoint | revision | round | active match | 화면 상태 | 판정 |
| --- | ---: | ---: | --- | --- | --- |
${checkpointRows}

## 환경 probe

\`\`\`json
${JSON.stringify(tester.probe, null, 2)}
\`\`\`

## Recovery request 증거

\`\`\`json
${JSON.stringify(
  {
    recoveryRequests: tester.recoveryRequests,
    failureTimeTransportRecords: tester.failureTimeTransportRecords,
    reloadBaselineRecords: tester.reloadBaselineRecords,
  },
  null,
  2,
)}
\`\`\`

## 게임성 평가

자동화는 기능 흐름만 판정하며 주관 점수는 수동 테스터가 입력한다.

| 항목 | 점수(1~5) | 근거 |
| --- | ---: | --- |
| 대진과 역할 명확성 | 미평가 | 수동 검증 필요 |
| bye/대기 명확성 | 미평가 | 수동 검증 필요 |
| 입력 반응성 | 미평가 | 자동 입력 결과는 checkpoint 참고 |
| turn/결과 피드백 | 미평가 | 수동 검증 필요 |
| 전체 재미/답답함 | 미평가 | 수동 검증 필요 |

## 최종 의견

- 다음 행동을 설명 없이 알 수 있었는가: 수동 검증 필요
- 다시 테스트가 필요한가: ${tester.status === "PASS" ? "게임성 수동 평가" : "예"}
`;
}

function renderSummary(
  input: Parameters<typeof writeArtifacts>[0],
  commit: string,
  endedAt: string,
): string {
  const error = input.failure ? sanitizeError(String(input.failure)) : "없음";
  const allPassedCheckpoint = (checkpoint: string) =>
    input.testers.length === 5 &&
    input.testers.every(function testItem(tester) {
      return tester.checkpoints.some(function testItem(candidate) {
        return candidate.checkpoint === checkpoint && candidate.result === "PASS";
      });
    });
  const fullReloadPassed = Boolean(
    input.testers[1]?.checkpoints.some(function testItem(checkpoint) {
      return checkpoint.checkpoint === "FAULT_001_CHROMIUM_RELOAD";
    }),
  );
  const samePageReconnectPassed = Boolean(
    input.testers[1]?.checkpoints.some(function testItem(checkpoint) {
      return checkpoint.checkpoint === "FAULT_002_SOCKET_RECONNECT";
    }),
  );
  const c3tStates = [input.testers[3], input.testers[4]].map(function mapItem(tester) {
    return tester?.checkpoints.find(function findItem(checkpoint) {
      return checkpoint.checkpoint === "C3T_TERMINAL_OBSERVED" && checkpoint.result === "PASS";
    });
  });
  const c3tTerminalObserved =
    c3tStates.every(function testItem(checkpoint) {
      return (
        typeof checkpoint?.runtime.competitive?.matchId === "string" &&
        Boolean(checkpoint.runtime.battle?.result)
      );
    }) && c3tStates[0]?.runtime.competitive?.matchId === c3tStates[1]?.runtime.competitive?.matchId;
  const gateStatus = (passed: boolean, attempted: boolean) =>
    passed ? "PASS" : attempted ? "FAIL" : "BLOCKED";
  return `# Poke Lounge 5인 토너먼트 검증 요약

- 결과: ${input.overallStatus}
- build commit: ${commit}
- room code: ${input.roomCode || "미생성"}
- 종료 시각: ${endedAt}
- Playwright workers/retries: 1 / 0
- 실행 환경: Desktop Chromium 2개, Desktop WebKit, Mobile Chromium, Mobile WebKit

## Gate 결과

| Gate | 판정 |
| --- | --- |
| C0 5개 identity 및 participant 분리 | ${gateStatus(allPassedCheckpoint("C0_JOINED"), input.testers.length === 5)} |
| C1 첫 대진 seed 4 vs 5, bye 1/3/2 | ${gateStatus(allPassedCheckpoint("C1_STARTED"), Boolean(input.initialBracket))} |
| C2 모바일 touch authority action | ${gateStatus(
    allPassedCheckpoint("C2_ACTION_1"),
    input.testers.some(function testItem(tester) {
      return tester.checkpoints.some(function testItem(checkpoint) {
        return checkpoint.checkpoint === "C2_ACTION_1";
      });
    }),
  )} |
| C3T seed 4/5 동일 old match terminal/result 선관측 | ${gateStatus(c3tTerminalObserved, Boolean(input.nextBracket))} |
| C4T 실제 store/scene/battle/competitive 다음 대진 수렴 | ${gateStatus(allPassedCheckpoint("C4T_NEXT_ROUND"), Boolean(input.nextBracket))} |
| C5 3라운드 최종 순위와 우승 수렴 | ${gateStatus(allPassedCheckpoint("C5_FINAL_WINNER"), Boolean(input.redisAssertions))} |
| C6 Redis/REST/Socket 최종 수렴 | ${gateStatus(allPassedCheckpoint("C6_CONVERGED"), Boolean(input.redisAssertions))} |
| C7 전원 명시적 퇴장 | ${gateStatus(allPassedCheckpoint("C7_ROOM_CLOSED"), Boolean(input.redisAssertions))} |
| Chromium reload 최초 500 없음 | ${gateStatus(
    fullReloadPassed &&
      !input.networkErrors.some(function testItem(error) {
        return error.tester === 2 && error.kind === "http-5xx";
      }),
    fullReloadPassed ||
      input.testers.some(function testItem(tester) {
        return tester.checkpoints.some(function testItem(checkpoint) {
          return checkpoint.checkpoint === "C2_ACTION_1";
        });
      }),
  )} |
| Chromium same-page Socket reconnect cursor 유지 | ${gateStatus(samePageReconnectPassed, fullReloadPassed)} |

Socket.IO는 \`transports:['polling','websocket']\`으로 연결을 시작하고, 각 context의 sanitized runtime 진단이 실제 \`activeTransport='websocket'\`으로 업그레이드됐는지 확인한다. 원문 handshake나 subscribe frame은 저장하지 않으며, reconnect cursor는 live recovery GET 증가와 runtime revision 수렴을 함께 검증한다.

## 오류 또는 차단 사유

${error}

## 주의

Playwright 모바일은 emulation 결과이며 실제 iOS Safari 판정을 대체하지 않는다. 주관적 게임성 점수는 별도 수동 평가가 필요하다.
`;
}

function writeJson(fileName: string, value: unknown): void {
  writeFileSync(path.join(RUN_ROOT, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecord(value));
}

function canonicalizeBracketBySeed(bracket: TournamentBracket): unknown {
  const seedByPlayerId = new Map(
    bracket.participants.map(function mapItem(participant) {
      return [participant.playerId, participant.seed];
    }),
  );
  const canonicalRound = (round: TournamentBracket["currentRound"]) =>
    round
      ? {
          roundNumber: round.roundNumber,
          matches: round.matches.map(function mapItem(match) {
            return {
              matchId: match.matchId,
              participantSeeds: match.participantIds.map(function mapItem(playerId) {
                return seedByPlayerId.get(playerId);
              }),
              status: match.status,
              winnerSeed: match.winnerPlayerId
                ? (seedByPlayerId.get(match.winnerPlayerId) ?? null)
                : null,
            };
          }),
          byes: round.byes.map(function mapItem(bye) {
            return {
              byeId: bye.byeId,
              seed: bye.entrant.seed,
            };
          }),
        }
      : null;

  return {
    version: bracket.version,
    status: bracket.status,
    participantSeeds: bracket.participants.map(function mapItem(participant) {
      return participant.seed;
    }),
    currentRound: canonicalRound(bracket.currentRound),
    completedRounds: (
      bracket.completedRounds as Array<NonNullable<TournamentBracket["currentRound"]>>
    ).map(canonicalRound),
    championSeed: bracket.championPlayerId
      ? (seedByPlayerId.get(bracket.championPlayerId) ?? null)
      : null,
  };
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(function compareItems([left], [right]) {
        return left.localeCompare(right);
      })
      .map(function mapItem([key, nested]) {
        return [key, sortRecord(nested)];
      }),
  );
}

function readCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function isInfrastructureError(error: unknown): boolean {
  return /executable doesn't exist|ECONNREFUSED|TEST_DATABASE_URL|browser.*not found/i.test(
    String(error),
  );
}

function isDatabaseEnvironmentName(name: string): boolean {
  return (
    name === "TEST_DATABASE_URL" ||
    name === "DATABASE_URL" ||
    name === "DB_URL" ||
    name === "PGDATABASE" ||
    name === "PGHOST" ||
    name === "PGPASSWORD" ||
    name === "PGPORT" ||
    name === "PGUSER" ||
    name.startsWith("DB_")
  );
}

function sanitizeError(value: string): string {
  return value
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"), "")
    .replace(/poke-lounge-e2e-token-[1-5]/g, "[redacted-token]")
    .replace(/server-session-[a-z0-9-]+/gi, "[redacted-session]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .slice(0, 2_000);
}

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close().catch(function handleRejected() {});
}

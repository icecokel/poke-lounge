import assert from "node:assert/strict";
import test from "node:test";
import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  recordTournamentMatchResult,
} from "@poke-lounge/battle/tournament-bracket";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import { createGameStateStore } from "../state/game-state-store";
import {
  createServerTournamentAnnouncementText,
  createWorldSceneTournament,
} from "./world-scene-tournament";

function createProjection(participantCount = 5): TournamentStateRoomPayload {
  const bracket = createTournamentBracketState(
    Array.from({ length: participantCount }, function callback(_, index) {
      return {
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      };
    }),
    1,
  );

  return {
    revision: 5,
    roomCode: "ROOM01",
    hostPlayerId: "player-1",
    roundIndex: 1,
    roomStatus: "tournament",
    roomRound: {
      index: 1,
      phase: "tournament",
      durationMs: 300_000,
      startedAtMs: 1_000,
      endsAtMs: 301_000,
    },
    participants: bracket.participants.map(function mapItem(participant) {
      return {
        ...participant,
        role: "participant",
        ready: true,
        partyReady: true,
        connected: true,
      };
    }),
    tournament: {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound?.matches[0]?.matchId ?? null,
      activeMatchAuthority: "server",
      cumulativeScores: {},
    },
    ownPlayerId: "player-4",
    activeMatchTransport: "authority",
    competitionKind: "tournament-unranked",
    finalStandings: [],
    resultSync: { matchId: null, status: "idle" },
  };
}

test("5인 서버 대진 안내는 canonical bye와 현재 상대를 7줄 이내로 표시한다", function testCase() {
  const projection = createProjection();
  const text = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: null,
  });

  assert.match(text, /^서버 토너먼트$/m);
  assert.doesNotMatch(text, /ROOM01/);
  assert.match(text, /참가 5\/8 · 준비 5\/5 · 접속 5\/5 · 관전 0/);
  assert.match(text, /현재 경기 · #4 Player 4 vs #5 Player 5/);
  assert.match(text, /내 상태 · #4 Player 4 · 상대 #5 Player 5/);
  assert.match(text, /서버 권위전 · 공개 랭킹 미반영/);
  assert.match(text, /전투 규칙 · 육성 파티 · 레벨 유지/);
  assert.ok(text.split("\n").length <= 7);

  projection.ownPlayerId = "player-1";
  const byeText = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: null,
  });
  assert.match(byeText, /내 상태 · #1 Player 1 · 부전승 진출 · 다음 대진 대기/);
  assert.ok(byeText.split("\n").length <= 7);
});

test("terminal 이후에는 승자의 진출·다음 상대와 패자의 탈락 대기를 표시한다", function testCase() {
  const winnerProjection = createProjection();
  const firstMatch = getReadyTournamentMatches(winnerProjection.tournament.bracket!)[0]!;
  const nextBracket = recordTournamentMatchResult(
    winnerProjection.tournament.bracket!,
    firstMatch.matchId,
    "player-5",
    { reason: "faint", completedAtMs: 3_000 },
  );
  winnerProjection.tournament.bracket = nextBracket;
  winnerProjection.tournament.activeMatchId = getReadyTournamentMatches(nextBracket)[0]!.matchId;
  winnerProjection.ownPlayerId = "player-5";

  const winnerText = createServerTournamentAnnouncementText({
    projection: winnerProjection,
    nowMs: 4_000,
    casualBattleAvailable: null,
  });
  assert.match(winnerText, /내 상태 · #5 Player 5 · 진출 · 상대 #1 Player 1/);

  winnerProjection.ownPlayerId = "player-4";
  const loserText = createServerTournamentAnnouncementText({
    projection: winnerProjection,
    nowMs: 4_000,
    casualBattleAvailable: null,
  });
  assert.match(loserText, /내 상태 · #4 Player 4 · 탈락 · 최종 순위 확정 대기/);
});

test("원격 party가 없는 casual active match는 미지원과 로그인·나가기 안내를 표시한다", function testCase() {
  const projection = createProjection();
  projection.tournament.activeMatchAuthority = "casual";
  projection.activeMatchTransport = "casual";
  projection.competitionKind = "casual-unranked";

  const text = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: false,
  });

  assert.match(text, /원격 캐주얼전 미지원/);
  assert.match(text, /로그인 후 재참가 또는 방 나가기/);
  assert.match(text, /캐주얼전 · 공개 랭킹 미반영/);
  assert.doesNotMatch(text, /육성 파티/);
  assert.ok(text.split("\n").length <= 7);
});

test("서버 토너먼트 진행 설명은 월드 중앙에 표시하지 않는다", function testCase() {
  const projection = createProjection();
  const store = createGameStateStore();
  const applied = store.applyTournamentSnapshotFromRoom(projection, 2_000);
  assert.deepEqual(applied, { ok: true });
  let announcementText: string | null = null;
  const tournament = createWorldSceneTournament({
    gameStateStore: store,
    isBattleIntroPlaying: () => false,
    hasWorldPlayer: () => false,
    isRoomTournamentHost: () => false,
    getRemotePlayerSnapshots: () => [],
    startTrainerBattle: () => {},
    getRoomHostPlayerId: () => null,
    sendTournamentStarted: () => {},
    sendTournamentMatchResult: () => {},
    sendTournamentCompleted: () => {},
    sendRoundScoreUpdates: () => {},
    createAnnouncement: text => {
      announcementText = text;
      return { destroy: () => {} };
    },
  });

  tournament.update(2_000);

  assert.equal(announcementText, null);
});

test("다음 라운드 시작 직후 직전 라운드 점수와 누적 순위를 표시한다", function testCase() {
  const store = createGameStateStore();
  const firstRound = createProjection(2);
  store.applyTournamentSnapshotFromRoom(firstRound, 1_000);
  const nextRound = createProjection(2);
  nextRound.revision = 6;
  nextRound.roundIndex = 2;
  nextRound.roomStatus = "round-started";
  nextRound.roomRound = {
    ...nextRound.roomRound,
    index: 2,
    phase: "round-started",
    startedAtMs: 2_000,
    endsAtMs: 302_000,
  };
  nextRound.tournament = {
    ...nextRound.tournament,
    bracket: null,
    activeMatchId: null,
    activeMatchAuthority: null,
    cumulativeScores: { "player-1": 25, "player-2": 75 },
  };
  store.applyTournamentSnapshotFromRoom(nextRound, 2_000);
  let announcementText: string | null = null;
  let result = false;
  const tournament = createWorldSceneTournament({
    gameStateStore: store,
    isBattleIntroPlaying: () => false,
    hasWorldPlayer: () => false,
    isRoomTournamentHost: () => false,
    getRemotePlayerSnapshots: () => [],
    startTrainerBattle: () => {},
    getRoomHostPlayerId: () => null,
    sendTournamentStarted: () => {},
    sendTournamentMatchResult: () => {},
    sendTournamentCompleted: () => {},
    sendRoundScoreUpdates: () => {},
    createAnnouncement: (text, _fontSize, isResult) => {
      announcementText = text;
      result = isResult === true;
      return {
        destroy: () => {
          announcementText = null;
        },
      };
    },
  });

  tournament.update(2_000);

  assert.equal(result, true);
  assert.match(announcementText ?? "", /라운드 1\/3 결과/);
  assert.match(announcementText ?? "", /1위 Player 2 · 이번 \+75 · 방 점수 75/);
  assert.match(announcementText ?? "", /2위 Player 1 · 이번 \+25 · 방 점수 25/);
});

test("준비 종료 5초 전에는 전체 대진을 먼저 안내한다", function testCase() {
  const projection = createProjection();
  projection.roomStatus = "round-started";
  projection.roomRound.phase = "round-started";
  projection.roomRound.endsAtMs = 32_000;
  projection.tournament.bracket = null;
  projection.tournament.activeMatchId = null;
  projection.tournament.activeMatchAuthority = null;
  projection.activeMatchTransport = "awaiting-authority";
  projection.competitionKind = null;
  const store = createGameStateStore();
  const applied = store.applyTournamentSnapshotFromRoom(projection, 26_999);
  assert.deepEqual(applied, { ok: true });
  let announcementText: string | null = null;
  const tournament = createWorldSceneTournament({
    gameStateStore: store,
    isBattleIntroPlaying: () => false,
    hasWorldPlayer: () => false,
    isRoomTournamentHost: () => false,
    getRemotePlayerSnapshots: () => [],
    startTrainerBattle: () => {},
    getRoomHostPlayerId: () => null,
    sendTournamentStarted: () => {},
    sendTournamentMatchResult: () => {},
    sendTournamentCompleted: () => {},
    sendRoundScoreUpdates: () => {},
    createAnnouncement: text => {
      announcementText = text;
      return {
        destroy: () => {
          announcementText = null;
        },
      };
    },
  });

  tournament.update(26_999);
  assert.equal(announcementText, null);
  tournament.update(27_000);
  assert.match(announcementText ?? "", /라운드 1\/3 대진 안내/);
  assert.match(announcementText ?? "", /8강 · #4 Player 4 vs #5 Player 5/);
  assert.match(announcementText ?? "", /부전승 · #1 Player 1 · #3 Player 3 · #2 Player 2/);
  assert.match(announcementText ?? "", /이후 · 4강 2경기 → 결승/);
  assert.match(announcementText ?? "", /내 위치 · 8강 1경기/);
});

test("8인 준비 단계는 부전승 없이 8강부터 안내한다", function testCase() {
  const projection = createProjection(8);
  projection.roomStatus = "round-started";
  projection.roomRound.phase = "round-started";
  projection.roomRound.endsAtMs = 32_000;
  projection.tournament.bracket = null;

  const text = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: null,
  });

  assert.match(text, /8강 · #1 Player 1 vs #8 Player 8/);
  assert.match(text, /#4 Player 4 vs #5 Player 5/);
  assert.match(text, /#3 Player 3 vs #6 Player 6/);
  assert.match(text, /#2 Player 2 vs #7 Player 7/);
  assert.match(text, /이후 · 4강 2경기 → 결승/);
  assert.doesNotMatch(text, /부전승/);
});

test("서버 준비 단계는 서버 endsAt 기준 남은 시간을 표시한다", function testCase() {
  const projection = createProjection();
  projection.roomStatus = "round-started";
  projection.roomRound.phase = "round-started";
  projection.roomRound.endsAtMs = 32_000;
  projection.tournament.bracket = null;
  projection.tournament.activeMatchId = null;
  projection.tournament.activeMatchAuthority = null;
  projection.activeMatchTransport = "awaiting-authority";
  projection.competitionKind = null;

  const text = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: null,
  });

  assert.match(text, /라운드 1\/3 대진 안내/);
  assert.match(text, /00:30 후 전투 시작/);
  assert.match(text, /8강 · #4 Player 4 vs #5 Player 5/);
  assert.ok(text.split("\n").length <= 7);

  const expiredText = createServerTournamentAnnouncementText({
    projection,
    nowMs: 32_000,
    casualBattleAvailable: null,
  });

  assert.match(expiredText, /전투 준비 중/);
  assert.doesNotMatch(expiredText, /00:00/);
});

test("다음 라운드 준비 단계는 내 누적 HP 비율 순위와 점수를 표시한다", function testCase() {
  const projection = createProjection();
  projection.roomStatus = "round-started";
  projection.roundIndex = 2;
  projection.roomRound.index = 2;
  projection.roomRound.phase = "round-started";
  projection.tournament.bracket = null;
  projection.tournament.activeMatchId = null;
  projection.tournament.activeMatchAuthority = null;
  projection.tournament.cumulativeScores = {
    "player-1": 125,
    "player-2": 200,
    "player-3": 100,
    "player-4": 133.3333,
    "player-5": 50,
  };

  const text = createServerTournamentAnnouncementText({
    projection,
    nowMs: 2_000,
    casualBattleAvailable: null,
  });

  assert.match(text, /라운드 2\/3 대진 안내/);
  assert.match(text, /내 누적 순위 · 2위 · 133\.33점/);
  assert.ok(text.split("\n").length <= 7);
});

test("최종 결과는 마지막 대진 승자가 아니라 서버 누적 순위를 표시한다", function testCase() {
  const participants = [
    { playerId: "player-1", displayName: "Player 1" },
    { playerId: "player-2", displayName: "Player 2" },
  ];
  const bracket = createTournamentBracketState(participants, 3);
  const match = getReadyTournamentMatches(bracket)[0];
  assert.ok(match);
  const completedBracket = recordTournamentMatchResult(bracket, match.matchId, "player-1", {
    reason: "faint",
    completedAtMs: 2_000,
  });
  const store = createGameStateStore();
  const applied = store.applyTournamentSnapshotFromRoom(
    {
      revision: 41,
      roomCode: "ROOM01",
      hostPlayerId: "player-1",
      roundIndex: 3,
      roomStatus: "completed",
      roomRound: {
        index: 3,
        phase: "tournament",
        durationMs: 300_000,
        startedAtMs: 1_000,
        endsAtMs: 301_000,
      },
      participants: completedBracket.participants.map(function mapItem(participant) {
        return {
          ...participant,
          role: "participant" as const,
          ready: true,
          partyReady: true,
          connected: true,
        };
      }),
      tournament: {
        version: 2,
        bracket: completedBracket,
        activeMatchId: null,
        activeMatchAuthority: null,
        cumulativeScores: { "player-1": 182.14, "player-2": 253.33 },
      },
      ownPlayerId: "player-1",
      activeMatchTransport: "awaiting-authority",
      competitionKind: "tournament-unranked",
      finalStandings: [
        { playerId: "player-2", displayName: "Player 2", rank: 1, score: 253.33 },
        { playerId: "player-1", displayName: "Player 1", rank: 2, score: 182.14 },
      ],
      resultSync: { matchId: null, status: "idle" },
    },
    3_000,
  );
  assert.deepEqual(applied, { ok: true });

  let announcementText = "";
  const tournament = createWorldSceneTournament({
    gameStateStore: store,
    isBattleIntroPlaying: () => false,
    hasWorldPlayer: () => true,
    isRoomTournamentHost: () => false,
    getRemotePlayerSnapshots: () => [],
    startTrainerBattle: () => {},
    getRoomHostPlayerId: () => null,
    sendTournamentStarted: () => {},
    sendTournamentMatchResult: () => {},
    sendTournamentCompleted: () => {},
    sendRoundScoreUpdates: () => {},
    createAnnouncement: text => {
      announcementText = text;
      return { destroy: () => {} };
    },
  });

  tournament.showResultPresentationIfNeeded();

  assert.match(announcementText, /우승 · 1위 Player 2/);
  assert.doesNotMatch(announcementText, /우승 · 1위 Player 1/);
});

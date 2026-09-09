import assert from "node:assert/strict";
import test from "node:test";
import { createGameStateStore } from "../state/game-state-store";
import { createTournamentSession, recordTournamentSessionMatchResult } from "./tournament-session";
import { getRoundCountdown, getTournamentCelebrationKey } from "./tournament-feedback-model";
import { getPartyExperienceRatio } from "@poke-lounge/battle/round-settings";

test("상단 카운트다운은 절대 마감 시간을 사용하고 00:00 아래로 내려가지 않는다", () => {
  const state = createGameStateStore().getState();
  state.round = {
    ...state.round,
    phase: "preparation",
    preparationEndsAtMs: 181000,
    preparationDurationMs: 180000,
  };
  assert.equal(getRoundCountdown(state, 1000).timer, "03:00");
  assert.equal(getRoundCountdown(state, 171001).timer, "00:10");
  assert.equal(getRoundCountdown(state, 171001).urgent, true);
  assert.equal(getRoundCountdown(state, 300000).timer, "00:00");
  state.round.phase = "tournament";
  assert.equal(getRoundCountdown(state, 1000).preparing, false);
});

test("90초/3분/5분 공유 비율과 알려지지 않은 설정의 안전한 기본값", () => {
  assert.equal(getPartyExperienceRatio(90000), 1);
  assert.equal(getPartyExperienceRatio(180000), 0.5);
  for (const value of [300000, 0, 60000, NaN]) assert.equal(getPartyExperienceRatio(value), 0);
});

test("컨페티 키는 토너먼트 전체가 끝났을 때만 생성하고 같은 결과 재수신에는 유지한다", () => {
  const state = createGameStateStore().getState();
  const session = createTournamentSession({
    roundIndex: 1,
    participants: [
      { playerId: "p1", displayName: "One" },
      { playerId: "p2", displayName: "Two" },
    ],
  });
  state.tournament.session = session;
  assert.equal(getTournamentCelebrationKey(state), null);
  state.tournament.session = recordTournamentSessionMatchResult(
    session,
    session.tournament.currentRound!.matches[0]!.matchId,
    "p1",
    1000,
  );
  const key = getTournamentCelebrationKey(state);
  assert.ok(key);
  assert.equal(getTournamentCelebrationKey(structuredClone(state)), key);
  state.tournament.session = { ...state.tournament.session, roundIndex: 2 };
  assert.notEqual(getTournamentCelebrationKey(state), key);
});

function serverRound(
  index: number,
  scores: Record<string, number>,
): import("../network/tournament-projection").TournamentStateRoomPayload {
  return {
    revision: index,
    roomCode: "TEST01",
    hostPlayerId: "player-1",
    roundIndex: index,
    roomStatus: "round-started",
    roomRound: {
      index,
      phase: "round-started",
      durationMs: 180000,
      startedAtMs: index * 200000,
      endsAtMs: index * 200000 + 180000,
    },
    participants: ["player-1", "player-2"].map((playerId, i) => ({
      playerId,
      displayName: `Player ${i + 1}`,
      role: "participant",
      ready: false,
      partyReady: true,
      connected: true,
      seed: i + 1,
    })),
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: scores,
    },
    ownPlayerId: "player-1",
    activeMatchTransport: "awaiting-authority",
    competitionKind: "tournament-unranked",
    finalStandings: [],
    resultSync: { matchId: null, status: "idle" },
  };
}

test("서버가 완료 대진 없이 다음 탐험으로 즉시 전환해도 직전 라운드 컨페티가 나온다", () => {
  const store = createGameStateStore();
  assert.deepEqual(store.applyTournamentSnapshotFromRoom(serverRound(1, {}), 200000), { ok: true });
  assert.equal(getTournamentCelebrationKey(store.getState()), null);
  const next = serverRound(2, { "player-1": 100, "player-2": 70 });
  assert.deepEqual(store.applyTournamentSnapshotFromRoom(next, 400000), { ok: true });
  assert.equal(store.getState().tournament.serverProjection?.tournament.bracket, null);
  assert.ok(store.getState().tournament.lastRoundScores.length > 0);
  const key = getTournamentCelebrationKey(store.getState());
  assert.equal(key, "TEST01:1");
  assert.deepEqual(store.applyTournamentSnapshotFromRoom({ ...next, revision: 3 }, 400200), {
    ok: true,
  });
  assert.equal(getTournamentCelebrationKey(store.getState()), key);
});

test("두 번째 종료는 새 키를 생성하고 같은 다음 라운드 상태에는 재생하지 않는다", () => {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(serverRound(1, {}), 200000);
  store.applyTournamentSnapshotFromRoom(
    serverRound(2, { "player-1": 100, "player-2": 70 }),
    400000,
  );
  const first = getTournamentCelebrationKey(store.getState());
  store.applyTournamentSnapshotFromRoom(
    serverRound(3, { "player-1": 170, "player-2": 170 }),
    600000,
  );
  assert.equal(getTournamentCelebrationKey(store.getState()), "TEST01:2");
  assert.notEqual(getTournamentCelebrationKey(store.getState()), first);
});

test("후속 라운드에 처음 재접속했지만 완료 변화가 없으면 누적 점수만으로 축하하지 않는다", () => {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(
    serverRound(3, { "player-1": 170, "player-2": 170 }),
    600000,
  );
  assert.equal(store.getState().tournament.lastRoundScores.length, 0);
  assert.equal(getTournamentCelebrationKey(store.getState()), null);
});

test("새 방의 첫 탐험은 이전 방 점수와 축하 키를 가져오지 않는다", () => {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(serverRound(1, {}), 200000);
  store.applyTournamentSnapshotFromRoom(
    serverRound(2, { "player-1": 100, "player-2": 70 }),
    400000,
  );
  store.applyTournamentSnapshotFromRoom({ ...serverRound(1, {}), roomCode: "TEST02" }, 600000);
  assert.equal(getTournamentCelebrationKey(store.getState()), null);
});

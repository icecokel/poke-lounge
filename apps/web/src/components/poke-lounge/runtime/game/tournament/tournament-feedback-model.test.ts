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

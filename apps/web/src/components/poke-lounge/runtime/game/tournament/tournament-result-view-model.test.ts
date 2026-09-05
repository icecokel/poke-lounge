import assert from "node:assert/strict";
import test from "node:test";
import {
  createTournamentResultPanelViewModel,
  formatTournamentResultRow,
} from "./tournament-result-view-model";

const standings = [
  {
    playerId: "player-1",
    displayName: "Player 1",
    seed: 1,
    rank: 1,
    champion: true,
    eliminatedRoundNumber: null,
  },
  {
    playerId: "player-2",
    displayName: "Player 2",
    seed: 2,
    rank: 2,
    champion: false,
    eliminatedRoundNumber: 1,
  },
];

test("최종 결과는 한국어 순위와 방 점수 및 공개 랭킹 반영 여부를 표시한다", function testCase() {
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 3,
    totalRounds: 3,
    final: true,
    standings,
    roundScores: { "player-1": 100, "player-2": 50 },
    cumulativeScores: { "player-1": 100, "player-2": 50 },
  });

  assert.equal(panel.title, "최종 결과");
  assert.equal(panel.nextActionLabel, "챔피언십 종료");
  assert.equal(panel.rankingLabel, "현재 게임 누적 점수");
  assert.equal(
    formatTournamentResultRow(panel.rows[0]!),
    "우승 · 1위 Player 1 · 이번 +100 · 방 점수 100",
  );
  assert.equal(formatTournamentResultRow(panel.rows[1]!), "2위 Player 2 · 이번 +50 · 방 점수 50");
});

test("남은 체력 비율 점수의 소수 값을 유지한다", function testCase() {
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 3,
    totalRounds: 3,
    final: true,
    standings,
    roundScores: { "player-1": 133.3333, "player-2": 66.6666 },
    cumulativeScores: { "player-1": 333.3333, "player-2": 266.6666 },
  });

  assert.equal(
    formatTournamentResultRow(panel.rows[0]!),
    "우승 · 1위 Player 1 · 이번 +133.33 · 방 점수 333.33",
  );
});

test("토너먼트 결과는 현재 게임의 누적 점수임을 안내한다", function testCase() {
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 2,
    totalRounds: 3,
    final: false,
    standings,
  });

  assert.equal(panel.title, "라운드 2/3 결과");
  assert.equal(panel.nextActionLabel, "다음 라운드 시작");
  assert.equal(panel.rankingLabel, "현재 게임 누적 점수");
});

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
    "최종 우승 · 1위 Player 1 · 이번 +100 · 방 점수 100",
  );
  assert.equal(formatTournamentResultRow(panel.rows[1]!), "2위 Player 2 · 이번 +50 · 방 점수 50");
});

test("기존 저장본의 소수 점수 표시를 유지한다", function testCase() {
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
    "최종 우승 · 1위 Player 1 · 이번 +133.33 · 방 점수 333.33",
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

test("누적 공동 1위여도 이번 라운드 우승은 +100점을 받은 한 사람만 표시한다", () => {
  const tied = standings.map(row => ({ ...row, rank: 1, champion: true }));
  const scores = [
    { playerId: "player-1", rank: 1, score: 100 },
    { playerId: "player-2", rank: 1, score: 70 },
  ];
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 2,
    totalRounds: 3,
    final: false,
    standings: tied,
    roundScores: scores,
    cumulativeScores: { "player-1": 170, "player-2": 170 },
  });
  assert.equal(panel.roundWinnerLabel, "이번 라운드 우승 · Player 1");
  assert.equal(
    panel.rows.every(row => !row.champion),
    true,
  );
  assert.equal(
    formatTournamentResultRow(panel.rows[1]!),
    "누적 공동 1위 Player 2 · 이번 +70 · 방 점수 170",
  );
  assert.equal(scores[1]!.score, 70);
});

test("이번 라운드 우승자는 누적 선두와 다를 수 있다", () => {
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 2,
    totalRounds: 3,
    final: false,
    standings,
    roundScores: new Map([
      ["player-1", 70],
      ["player-2", 100],
    ]),
    cumulativeScores: { "player-1": 170, "player-2": 145 },
  });
  assert.equal(panel.roundWinnerLabel, "이번 라운드 우승 · Player 2");
  assert.match(formatTournamentResultRow(panel.rows[0]!), /^누적 1위 Player 1/);
  assert.doesNotMatch(formatTournamentResultRow(panel.rows[0]!), /우승/);
});

test("불완전하거나 과거 점수에는 라운드 우승자를 추측해 붙이지 않는다", () => {
  for (const roundScores of [
    undefined,
    { "player-1": 0 },
    { "player-1": 133.33, "player-2": 66.66 },
    { "player-1": 100, "player-2": 100 },
  ]) {
    const panel = createTournamentResultPanelViewModel({
      roundIndex: 2,
      totalRounds: 3,
      final: false,
      standings,
      roundScores,
    });
    assert.equal(panel.roundWinnerLabel, null);
  }
});

test("최종 공동 우승은 누적 순위를 따르고 마지막 라운드 우승과 혼동하지 않는다", () => {
  const panel = createTournamentResultPanelViewModel({
    roundIndex: 3,
    totalRounds: 3,
    final: true,
    standings: standings.map(row => ({ ...row, rank: 1, champion: true })),
    roundScores: { "player-1": 70, "player-2": 100 },
    cumulativeScores: { "player-1": 270, "player-2": 270 },
  });
  assert.equal(panel.roundWinnerLabel, null);
  for (const row of panel.rows)
    assert.match(formatTournamentResultRow(row), /^최종 우승 · 공동 1위/);
});

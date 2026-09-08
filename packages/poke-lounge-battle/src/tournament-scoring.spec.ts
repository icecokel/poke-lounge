import {
  accumulateTournamentScores,
  DEFAULT_TOURNAMENT_SCORE_BY_RANK,
  rankCumulativeTournamentScores,
  scoreTournamentStandings,
} from "./tournament-scoring";

describe("tournament scoring", function testSuite() {
  it("uses the documented rank score table", function testCase() {
    expect(DEFAULT_TOURNAMENT_SCORE_BY_RANK).toEqual({
      1: 100,
      2: 70,
      3: 45,
      4: 30,
      5: 15,
      6: 5,
    });
  });

  it("scores, accumulates, and ranks tournament standings", function testCase() {
    const roundScores = scoreTournamentStandings([
      standing("player-1", 1, 1),
      standing("player-2", 2, 2),
      standing("player-3", 3, 3),
    ]);
    const cumulative = accumulateTournamentScores({ "player-1": 5, "player-2": 35 }, roundScores);

    expect(cumulative).toEqual({
      "player-1": 105,
      "player-2": 105,
      "player-3": 45,
    });
    expect(
      rankCumulativeTournamentScores(cumulative, [
        participant("player-1", 1),
        participant("player-2", 2),
        participant("player-3", 3),
      ]).map(function mapItem({ playerId, rank }) {
        return { playerId, rank };
      }),
    ).toEqual([
      { playerId: "player-1", rank: 1 },
      { playerId: "player-2", rank: 1 },
      { playerId: "player-3", rank: 3 },
    ]);
  });

  it("awards equal points for the same elimination round, not seed order", function testCase() {
    expect(
      scoreTournamentStandings([
        standing("champion", 8, 1),
        standing("finalist", 7, 2),
        standing("semi-a", 6, 3),
        standing("semi-b", 5, 3),
        standing("quarter-a", 4, 5),
        standing("quarter-b", 3, 5),
        standing("quarter-c", 2, 5),
        standing("quarter-d", 1, 5),
      ]).map(row => row.score),
    ).toEqual([100, 70, 45, 45, 15, 15, 15, 15]);
  });
});

function participant(playerId: string, seed: number) {
  return { playerId, displayName: playerId, seed };
}

function standing(playerId: string, seed: number, rank: number) {
  return {
    ...participant(playerId, seed),
    rank,
    champion: rank === 1,
    eliminatedRoundNumber: rank === 1 ? null : 1,
  };
}

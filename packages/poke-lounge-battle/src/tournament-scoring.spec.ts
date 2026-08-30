import {
  accumulateTournamentScores,
  DEFAULT_TOURNAMENT_SCORE_BY_RANK,
  rankCumulativeTournamentScores,
  scoreRemainingHpPercentage,
  scoreTournamentStandings,
} from "./tournament-scoring";

describe("tournament scoring", () => {
  it("uses the documented rank score table", () => {
    expect(DEFAULT_TOURNAMENT_SCORE_BY_RANK).toEqual({
      1: 100,
      2: 70,
      3: 45,
      4: 30,
      5: 15,
      6: 5,
    });
  });

  it("scores, accumulates, and ranks tournament standings", () => {
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
      ]).map(({ playerId, rank }) => ({ playerId, rank })),
    ).toEqual([
      { playerId: "player-1", rank: 1 },
      { playerId: "player-2", rank: 1 },
      { playerId: "player-3", rank: 3 },
    ]);
  });

  it("sums each party member remaining HP percentage without placement points", () => {
    expect(
      scoreRemainingHpPercentage([
        { currentHp: 39, maxHp: 39 },
        { currentHp: 15, maxHp: 30 },
        { currentHp: 0, maxHp: 44 },
      ]),
    ).toBe(150);
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

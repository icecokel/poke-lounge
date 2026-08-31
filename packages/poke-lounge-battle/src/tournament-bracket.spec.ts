import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  type TournamentBracketState,
} from "./tournament-bracket";

describe("tournament bracket", function testSuite() {
  it.each([
    [2, 1, 0],
    [3, 1, 1],
    [4, 2, 0],
    [5, 1, 3],
    [6, 2, 2],
  ])(
    "places every one of %i participants in exactly one opening match or bye",
    function callback(participantCount, expectedMatches, expectedByes) {
      const state = createTournamentBracketState(participants(participantCount), 1);
      const round = state.currentRound;

      expect(round?.matches).toHaveLength(expectedMatches);
      expect(round?.byes).toHaveLength(expectedByes);
      expect(
        round?.slots.flatMap(function mapItem(slot) {
          return slot.kind === "match"
            ? (round.matches.find(function findItem(match) {
                return match.matchId === slot.matchId;
              })?.participantIds ?? [])
            : [
                round.byes.find(function findItem(bye) {
                  return bye.byeId === slot.byeId;
                })?.entrant.playerId,
              ];
        }),
      ).toEqual(
        expect.arrayContaining(
          participants(participantCount).map(function mapItem(row) {
            return row.playerId;
          }),
        ),
      );
      expect(
        new Set(
          round?.slots.flatMap(function mapItem(slot) {
            return slot.kind === "match"
              ? (round.matches.find(function findItem(match) {
                  return match.matchId === slot.matchId;
                })?.participantIds ?? [])
              : [
                  round.byes.find(function findItem(bye) {
                    return bye.byeId === slot.byeId;
                  })?.entrant.playerId,
                ];
          }),
        ).size,
      ).toBe(participantCount);
    },
  );

  it("creates the documented five-player opening round", function testCase() {
    const state = createTournamentBracketState(participants(5), 1);

    expect(state.currentRound?.matches).toEqual([
      expect.objectContaining({
        matchId: "game-round-1-bracket-1-match-1",
        participantIds: ["player-4", "player-5"],
      }),
    ]);
    expect(
      state.currentRound?.byes.map(function mapItem(bye) {
        return bye.entrant.playerId;
      }),
    ).toEqual(["player-1", "player-3", "player-2"]);
  });

  it("advances a five-player bracket deterministically without omissions", function testCase() {
    let state = createTournamentBracketState(participants(5), 2);

    state = recordTournamentMatchResult(state, "game-round-2-bracket-1-match-1", "player-5");
    expect(state.currentRound?.roundNumber).toBe(2);
    expect(
      state.currentRound?.matches.map(function mapItem(match) {
        return match.participantIds;
      }),
    ).toEqual([
      ["player-1", "player-5"],
      ["player-3", "player-2"],
    ]);

    state = winAllReadyMatches(state, "player-1");
    state = winAllReadyMatches(state, "player-2");
    state = winAllReadyMatches(state, "player-1");

    expect(state.status).toBe("completed");
    expect(state.championPlayerId).toBe("player-1");
    expect(
      getTournamentStandings(state)
        .map(function mapItem(standing) {
          return standing.playerId;
        })
        .sort(),
    ).toEqual(
      participants(5)
        .map(function mapItem(participant) {
          return participant.playerId;
        })
        .sort(),
    );
  });

  it("rejects duplicate players and unsupported participant counts", function testCase() {
    expect(function callback() {
      return createTournamentBracketState(participants(1), 1);
    }).toThrow(RangeError);
    expect(function callback() {
      return createTournamentBracketState(participants(7), 1);
    }).toThrow(RangeError);
    expect(function callback() {
      return createTournamentBracketState(
        [
          { playerId: "same", displayName: "A" },
          { playerId: "same", displayName: "B" },
        ],
        1,
      );
    }).toThrow("Duplicate tournament participant");
  });
});

function participants(count: number) {
  return Array.from({ length: count }, function callback(_, index) {
    return {
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
    };
  });
}

function winAllReadyMatches(
  state: TournamentBracketState,
  preferredWinnerPlayerId: string,
): TournamentBracketState {
  return getReadyTournamentMatches(state).reduce(function reduceItems(current, match) {
    const winnerPlayerId = match.participantIds.includes(preferredWinnerPlayerId)
      ? preferredWinnerPlayerId
      : match.participantIds[0];

    return recordTournamentMatchResult(current, match.matchId, winnerPlayerId);
  }, state);
}

import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  type TournamentBracketState,
} from "./tournament-bracket";

describe("tournament bracket", () => {
  it.each([
    [2, 1, 0],
    [3, 1, 1],
    [4, 2, 0],
    [5, 1, 3],
    [6, 2, 2],
  ])(
    "places every one of %i participants in exactly one opening match or bye",
    (participantCount, expectedMatches, expectedByes) => {
      const state = createTournamentBracketState(participants(participantCount), 1);
      const round = state.currentRound;

      expect(round?.matches).toHaveLength(expectedMatches);
      expect(round?.byes).toHaveLength(expectedByes);
      expect(
        round?.slots.flatMap(slot =>
          slot.kind === "match"
            ? (round.matches.find(match => match.matchId === slot.matchId)?.participantIds ?? [])
            : [round.byes.find(bye => bye.byeId === slot.byeId)?.entrant.playerId],
        ),
      ).toEqual(expect.arrayContaining(participants(participantCount).map(row => row.playerId)));
      expect(
        new Set(
          round?.slots.flatMap(slot =>
            slot.kind === "match"
              ? (round.matches.find(match => match.matchId === slot.matchId)?.participantIds ?? [])
              : [round.byes.find(bye => bye.byeId === slot.byeId)?.entrant.playerId],
          ),
        ).size,
      ).toBe(participantCount);
    },
  );

  it("creates the documented five-player opening round", () => {
    const state = createTournamentBracketState(participants(5), 1);

    expect(state.currentRound?.matches).toEqual([
      expect.objectContaining({
        matchId: "game-round-1-bracket-1-match-1",
        participantIds: ["player-4", "player-5"],
      }),
    ]);
    expect(state.currentRound?.byes.map(bye => bye.entrant.playerId)).toEqual([
      "player-1",
      "player-3",
      "player-2",
    ]);
  });

  it("advances a five-player bracket deterministically without omissions", () => {
    let state = createTournamentBracketState(participants(5), 2);

    state = recordTournamentMatchResult(state, "game-round-2-bracket-1-match-1", "player-5");
    expect(state.currentRound?.roundNumber).toBe(2);
    expect(state.currentRound?.matches.map(match => match.participantIds)).toEqual([
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
        .map(standing => standing.playerId)
        .sort(),
    ).toEqual(
      participants(5)
        .map(participant => participant.playerId)
        .sort(),
    );
  });

  it("rejects duplicate players and unsupported participant counts", () => {
    expect(() => createTournamentBracketState(participants(1), 1)).toThrow(RangeError);
    expect(() => createTournamentBracketState(participants(7), 1)).toThrow(RangeError);
    expect(() =>
      createTournamentBracketState(
        [
          { playerId: "same", displayName: "A" },
          { playerId: "same", displayName: "B" },
        ],
        1,
      ),
    ).toThrow("Duplicate tournament participant");
  });
});

function participants(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
  }));
}

function winAllReadyMatches(
  state: TournamentBracketState,
  preferredWinnerPlayerId: string,
): TournamentBracketState {
  return getReadyTournamentMatches(state).reduce((current, match) => {
    const winnerPlayerId = match.participantIds.includes(preferredWinnerPlayerId)
      ? preferredWinnerPlayerId
      : match.participantIds[0];

    return recordTournamentMatchResult(current, match.matchId, winnerPlayerId);
  }, state);
}

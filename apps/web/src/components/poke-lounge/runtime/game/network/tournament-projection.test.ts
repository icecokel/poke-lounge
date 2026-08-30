import assert from "node:assert/strict";
import test from "node:test";
import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  recordTournamentMatchResult,
} from "@poke-lounge/battle";
import {
  isRoundReadinessDue,
  mapServerTournamentPlayerIds,
  parseServerTournamentState,
  TournamentProjectionSchemaError,
} from "./tournament-projection";

test("라운드 준비 마감 시각부터 준비 확인이 필요하다", () => {
  const round = {
    phase: "round-started" as const,
    endsAtMs: 10_000,
  };

  assert.equal(isRoundReadinessDue("round-started", round, 9_999), false);
  assert.equal(isRoundReadinessDue("round-started", round, 10_000), true);
  assert.equal(isRoundReadinessDue("tournament", round, 10_000), false);
});

function createFivePlayerServerTournament() {
  const bracket = createTournamentBracketState(
    Array.from({ length: 5 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
    })),
    1,
  );

  return {
    version: 2,
    bracket,
    activeMatchId: bracket.currentRound?.matches[0]?.matchId ?? null,
    activeMatchAuthority: "casual",
    cumulativeScores: {},
  };
}

function createCompletedServerTournament(result?: { reason: "faint"; completedAtMs: number }) {
  let bracket = createTournamentBracketState(
    [
      { playerId: "player-1", displayName: "Player 1" },
      { playerId: "player-2", displayName: "Player 2" },
    ],
    1,
  );
  const match = getReadyTournamentMatches(bracket)[0];
  bracket = recordTournamentMatchResult(bracket, match.matchId, match.participantIds[0], result);

  return {
    version: 2,
    bracket,
    activeMatchId: null,
    activeMatchAuthority: null,
    cumulativeScores: {},
  };
}

test("preparation의 null bracket과 null authority는 정상 lobby projection이다", () => {
  assert.deepEqual(
    parseServerTournamentState(
      {
        version: 2,
        bracket: null,
        activeMatchId: null,
        activeMatchAuthority: null,
        cumulativeScores: {},
      },
      1,
    ),
    {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
  );
});

test("남은 체력 비율 누적 점수의 유한한 소수 값을 보존한다", () => {
  const tournament = parseServerTournamentState(
    {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: { "player-1": 133.3333 },
    },
    2,
  );

  assert.equal(tournament.cumulativeScores["player-1"], 133.3333);
});

test("5인 canonical projection은 seed 4/5 match와 seed 1/3/2 bye를 보존한다", () => {
  const tournament = parseServerTournamentState(createFivePlayerServerTournament(), 1);

  assert.deepEqual(tournament.bracket?.currentRound?.matches[0]?.participantIds, [
    "player-4",
    "player-5",
  ]);
  assert.deepEqual(
    tournament.bracket?.currentRound?.byes.map(bye => bye.entrant.playerId),
    ["player-1", "player-3", "player-2"],
  );
});

test("ready match의 결과 metadata는 둘 다 null이어야 한다", () => {
  const tournament = structuredClone(createFivePlayerServerTournament());
  const match = tournament.bracket.currentRound?.matches[0];

  if (!match) {
    throw new Error("Expected a ready tournament match");
  }
  match.resultReason = "faint";
  match.completedAtMs = 1_000;

  assert.throws(() => parseServerTournamentState(tournament, 1), TournamentProjectionSchemaError);
});

test("completed match는 legacy null metadata와 유효한 metadata pair를 모두 적용한다", () => {
  const legacy = parseServerTournamentState(createCompletedServerTournament(), 1);
  const current = parseServerTournamentState(
    createCompletedServerTournament({ reason: "faint", completedAtMs: 1_000 }),
    1,
  );

  assert.deepEqual(legacy.bracket?.completedRounds[0]?.matches[0]?.resultReason, null);
  assert.deepEqual(legacy.bracket?.completedRounds[0]?.matches[0]?.completedAtMs, null);
  assert.equal(current.bracket?.completedRounds[0]?.matches[0]?.resultReason, "faint");
  assert.equal(current.bracket?.completedRounds[0]?.matches[0]?.completedAtMs, 1_000);
});

test("completed match의 한쪽만 있는 결과 metadata는 거부한다", () => {
  for (const metadata of [
    { resultReason: "faint", completedAtMs: null },
    { resultReason: null, completedAtMs: 1_000 },
  ] as const) {
    const tournament = structuredClone(createCompletedServerTournament());
    const match = tournament.bracket.completedRounds[0]?.matches[0];

    if (!match) {
      throw new Error("Expected a completed tournament match");
    }
    match.resultReason = metadata.resultReason;
    match.completedAtMs = metadata.completedAtMs;

    assert.throws(() => parseServerTournamentState(tournament, 1), TournamentProjectionSchemaError);
  }
});

test("slot이 match를 참조하지 않는 projection은 거부한다", () => {
  const tournament = structuredClone(createFivePlayerServerTournament());
  const firstSlot = tournament.bracket.currentRound?.slots[0];

  if (firstSlot?.kind === "bye") {
    firstSlot.byeId = "unknown-bye";
  }

  assert.throws(() => parseServerTournamentState(tournament, 1), TournamentProjectionSchemaError);
});

test("active match가 current round에 없는 projection은 거부한다", () => {
  const tournament = createFivePlayerServerTournament();

  assert.throws(
    () =>
      parseServerTournamentState(
        { ...tournament, activeMatchId: "game-round-1-bracket-1-match-999" },
        1,
      ),
    TournamentProjectionSchemaError,
  );
});

test("local player ID mapping은 bracket의 모든 참가자 참조에 동일하게 적용된다", () => {
  const parsed = parseServerTournamentState(createFivePlayerServerTournament(), 1);
  const mapped = mapServerTournamentPlayerIds(parsed, playerId =>
    playerId === "player-4" ? "local-player" : playerId,
  );

  assert.equal(mapped.bracket?.participants[3]?.playerId, "local-player");
  assert.deepEqual(mapped.bracket?.currentRound?.matches[0]?.participantIds, [
    "local-player",
    "player-5",
  ]);
  assert.equal(mapped.bracket?.currentRound?.matches[0]?.participantA.playerId, "local-player");
});

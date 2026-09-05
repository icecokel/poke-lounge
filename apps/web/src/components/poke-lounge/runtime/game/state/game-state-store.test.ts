import assert from "node:assert/strict";
import test from "node:test";
import {
  createTournamentBracketState,
  recordTournamentMatchResult,
} from "@poke-lounge/battle/tournament-bracket";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import {
  createDefaultLocalPlayer,
  createGameStateStore,
  type GameStateStorage,
  type LocalPlayersSaveState,
} from "./game-state-store";

test("storage scope 전환은 저장 데이터를 지우지 않고 대상 scope 상태를 다시 읽는다", function testCase() {
  let persistedLocalPlayers: LocalPlayersSaveState | null = null;
  let clearCount = 0;
  const storage: GameStateStorage = {
    loadLocalPlayers: () => persistedLocalPlayers,
    saveLocalPlayers: localPlayers => {
      persistedLocalPlayers = localPlayers;
    },
    clear: () => {
      clearCount += 1;
      persistedLocalPlayers = null;
    },
  };
  const store = createGameStateStore({ storage });
  const accountPlayer = {
    ...createDefaultLocalPlayer("account-player"),
    wallet: { pokeDollars: 4321 },
  };
  persistedLocalPlayers = {
    currentPlayerId: accountPlayer.playerId,
    playersById: { [accountPlayer.playerId]: accountPlayer },
  };

  assert.equal(store.reloadLocalPlayersFromStorage(), true);

  assert.equal(store.getState().currentPlayerId, accountPlayer.playerId);
  assert.equal(store.getCurrentLocalPlayer().wallet.pokeDollars, 4321);
  assert.equal(store.getState().session.connectionStatus, "offline");
  assert.equal(clearCount, 0);

  persistedLocalPlayers = null;
  assert.equal(store.reloadLocalPlayersFromStorage(), false);

  assert.equal(store.getState().currentPlayerId, "player-1");
  assert.equal(clearCount, 0);
});

function createProjection(revision: number): TournamentStateRoomPayload {
  const bracket = createTournamentBracketState(
    Array.from({ length: 5 }, function callback(_, index) {
      return {
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      };
    }),
    1,
  );

  return {
    revision,
    roomCode: "ROOM01",
    hostPlayerId: "player-1",
    roundIndex: 1,
    roomStatus: "tournament",
    roomRound: {
      index: 1,
      phase: "tournament",
      durationMs: 300_000,
      startedAtMs: 500,
      endsAtMs: 800,
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
      activeMatchAuthority: "casual",
      cumulativeScores: {},
    },
    ownPlayerId: "player-4",
    activeMatchTransport: "casual",
    competitionKind: "casual-unranked",
    finalStandings: [],
    resultSync: { matchId: null, status: "idle" },
  };
}

function createPreparationProjection(revision: number): TournamentStateRoomPayload {
  return {
    revision,
    roomCode: "ROOM01",
    hostPlayerId: "player-1",
    roundIndex: 1,
    roomStatus: "round-started",
    roomRound: {
      index: 1,
      phase: "round-started",
      durationMs: 300_000,
      startedAtMs: 1_000,
      endsAtMs: 301_000,
    },
    participants: [
      {
        playerId: "player-1",
        displayName: "Player 1",
        role: "participant",
        ready: true,
        partyReady: true,
        connected: true,
        seed: null,
      },
      {
        playerId: "player-2",
        displayName: "Player 2",
        role: "participant",
        ready: true,
        partyReady: true,
        connected: true,
        seed: null,
      },
    ],
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    ownPlayerId: "player-1",
    activeMatchTransport: "awaiting-authority",
    competitionKind: null,
    finalStandings: [],
    resultSync: { matchId: null, status: "idle" },
  };
}

function createCompletedProjection(revision: number): TournamentStateRoomPayload {
  const projection = createProjection(revision);
  let bracket = createTournamentBracketState(
    projection.participants.map(function mapItem({ playerId, displayName }) {
      return { playerId, displayName };
    }),
    3,
  );

  while (bracket.status === "in-progress") {
    for (const match of bracket.currentRound?.matches ?? []) {
      bracket = recordTournamentMatchResult(bracket, match.matchId, match.participantA.playerId);
    }
  }

  const finalStandings = bracket.participants.map(function mapItem(participant, index) {
    return {
      playerId: participant.playerId,
      displayName: participant.displayName,
      rank: index + 1,
      score: 300 - index * 50,
    };
  });

  return {
    ...projection,
    roundIndex: 3,
    roomStatus: "completed",
    roomRound: {
      ...projection.roomRound,
      index: 3,
      phase: "completed",
      startedAtMs: 500,
      endsAtMs: 800,
    },
    tournament: {
      version: 2,
      bracket,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: Object.fromEntries(
        finalStandings.map(function mapItem(row) {
          return [row.playerId, row.score];
        }),
      ),
    },
    finalStandings,
  };
}

test("preparation snapshot은 bracket과 current match를 조기에 만들지 않는다", function testCase() {
  const store = createGameStateStore();

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(createPreparationProjection(3), 1000), {
    ok: true,
  });
  assert.equal(store.getState().round.phase, "preparation");
  assert.equal(store.getState().round.totalRounds, 3);
  assert.equal(store.getState().round.preparationDurationMs, 300_000);
  assert.equal(store.getState().round.phaseStartedAtMs, 1_000);
  assert.equal(store.getState().round.preparationEndsAtMs, 301_000);
  assert.equal(store.getState().tournament.session, null);
  assert.equal(store.getCurrentTournamentMatch(), null);
});

test("server preparation은 로컬 round clock으로 tournament 단계에 진입하지 않는다", function testCase() {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(createPreparationProjection(3), 1_000);

  store.advanceRoundClock(400_000);

  assert.equal(store.getState().round.phase, "preparation");
  assert.equal(store.getState().round.preparationEndsAtMs, 301_000);
});

test("다음 라운드 snapshot은 누적 순위와 직전 라운드 점수를 함께 반영한다", function testCase() {
  const store = createGameStateStore();
  const tournament = createProjection(3);
  store.applyTournamentSnapshotFromRoom(tournament, 1_000);

  const nextRound = createPreparationProjection(4);
  nextRound.roundIndex = 2;
  nextRound.roomRound = {
    ...nextRound.roomRound,
    index: 2,
    startedAtMs: 2_000,
    endsAtMs: 302_000,
  };
  nextRound.tournament.cumulativeScores = {
    "player-1": 25,
    "player-2": 75,
  };

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(nextRound, 2_000), { ok: true });
  assert.deepEqual(
    store.getState().tournament.standings.map(function mapItem(row) {
      return [row.playerId, row.rank, row.score];
    }),
    [
      ["player-2", 1, 75],
      ["player-1", 2, 25],
    ],
  );
  assert.deepEqual(
    store.getState().tournament.lastRoundScores.map(function mapItem(row) {
      return [row.playerId, row.score];
    }),
    [
      ["player-2", 75],
      ["player-1", 25],
    ],
  );
});

test("server projection은 한 번의 notify로 session과 active match에 원자 적용된다", function testCase() {
  const store = createGameStateStore();
  let notifyCount = 0;
  store.subscribe(function callback() {
    notifyCount += 1;
  });

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(createProjection(7), 1000), {
    ok: true,
  });
  assert.equal(notifyCount, 1);
  assert.equal(store.getState().tournament.serverProjection?.revision, 7);
  assert.deepEqual(store.getCurrentTournamentMatch()?.participantIds, ["player-4", "player-5"]);
});

test("공식 라운드 진입은 로컬 파티의 HP, PP와 상태이상을 한 번만 회복한다", function testCase() {
  const local = createDefaultLocalPlayer("local-player-only");
  const store = createGameStateStore({
    storage: {
      loadLocalPlayers: () => ({
        currentPlayerId: local.playerId,
        playersById: { [local.playerId]: local },
      }),
      saveLocalPlayers: () => {},
      clear: () => {},
    },
  });
  store.setStarterPokemon({
    speciesId: 155,
    name: "브케인",
    level: 10,
    currentHp: 3,
    maxHp: 30,
    status: "burned",
    moves: [{ id: 33, name: "몸통박치기", pp: 1, maxPp: 35 }],
  });
  for (let i = 1; i < 6; i++) {
    store.addPokemonToParty({
      speciesId: 152,
      name: "치코리타",
      level: 10,
      currentHp: 0,
      maxHp: 35,
      status: "fainted",
      moves: [{ id: 33, name: "몸통박치기", pp: 0, maxPp: 35 }],
    });
  }
  store.applyTournamentSnapshotFromRoom(createPreparationProjection(3), 1_000);

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(createProjection(4), 2_000), {
    ok: true,
  });
  assert.deepEqual(store.getCurrentLocalPlayer().party[0]?.pokemon, {
    speciesId: 155,
    name: "브케인",
    level: 10,
    currentHp: 30,
    maxHp: 30,
    status: "normal",
    moves: [{ id: 33, name: "몸통박치기", pp: 35, maxPp: 35 }],
  });

  const restored = store.getCurrentLocalPlayer().party[0]?.pokemon;
  assert.ok(restored);
  assert.equal(store.getState().currentPlayerId, "local-player-only");
  assert.equal(store.getCurrentLocalPlayer().party.filter(slot => slot.pokemon).length, 6);
  for (const slot of store.getCurrentLocalPlayer().party) {
    assert.equal(slot.pokemon?.currentHp, slot.pokemon?.maxHp);
    assert.equal(slot.pokemon?.status, "normal");
    assert.equal(slot.pokemon?.moves?.[0].pp, 35);
  }
  store.updateActivePokemon({ ...restored, currentHp: 20 });
  assert.deepEqual(store.applyTournamentSnapshotFromRoom(createProjection(5), 3_000), {
    ok: true,
  });
  assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.currentHp, 20);
});

test("낮은 revision projection은 현재 bracket을 덮지 않는다", function testCase() {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(createProjection(7), 1000);

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(createProjection(6), 1100), {
    ok: false,
    reason: "stale-revision",
  });
  assert.equal(store.getState().tournament.serverProjection?.revision, 7);
});

test("새 방의 낮은 revision은 이전 방의 토너먼트 상태를 교체한다", function testCase() {
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(createCompletedProjection(40), 1_000);
  const nextRoom = createPreparationProjection(1);
  nextRoom.roomCode = "ROOM02";
  nextRoom.roomStatus = "waiting";
  nextRoom.roomRound = {
    ...nextRoom.roomRound,
    phase: "waiting",
    startedAtMs: null,
    endsAtMs: null,
  };
  nextRoom.participants = nextRoom.participants.slice(0, 1);

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(nextRoom, 2_000), { ok: true });
  assert.equal(store.getState().tournament.serverProjection?.roomCode, "ROOM02");
  assert.equal(store.getState().tournament.serverProjection?.participants.length, 1);
  assert.equal(store.getState().round.phase, "waiting");
  assert.deepEqual(store.getState().tournament.scoresByPlayerId, {});
  assert.deepEqual(store.getState().tournament.lastRoundScores, []);
  assert.deepEqual(store.getState().tournament.standings, []);
});

test("같은 revision의 다른 방장이나 bracket은 현재 canonical state를 덮지 않는다", function testCase() {
  const store = createGameStateStore();
  const projection = createProjection(7);
  store.applyTournamentSnapshotFromRoom(projection, 1000);
  const divergentHost = structuredClone(projection);
  divergentHost.hostPlayerId = "player-2";

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(divergentHost, 1050), {
    ok: false,
    reason: "invalid-projection",
  });
  const divergent = structuredClone(projection);
  divergent.tournament.activeMatchId = null;
  divergent.tournament.activeMatchAuthority = null;

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(divergent, 1100), {
    ok: false,
    reason: "invalid-projection",
  });
  assert.equal(
    store.getState().tournament.serverProjection?.tournament.activeMatchId,
    projection.tournament.activeMatchId,
  );
});

test("server projection이 적용된 동안 client result로 bracket을 전진시키지 않는다", function testCase() {
  const store = createGameStateStore();
  const projection = createProjection(7);
  store.applyTournamentSnapshotFromRoom(projection, 1000);

  assert.deepEqual(
    store.recordTournamentMatchResult(
      projection.tournament.activeMatchId ?? "missing",
      "player-4",
      1200,
    ),
    {
      ok: false,
      reason: "invalid-result",
      message: "Server projection is canonical.",
    },
  );
  assert.equal(store.getState().tournament.serverProjection?.revision, 7);
});

test("완료 순위는 재접속 첫 snapshot에서도 canonical seed를 보존한다", function testCase() {
  const store = createGameStateStore();
  const projection = createProjection(8);
  projection.finalStandings = [
    { playerId: "player-5", displayName: "Player 5", rank: 1, score: 300 },
    { playerId: "player-1", displayName: "Player 1", rank: 2, score: 250 },
    { playerId: "player-4", displayName: "Player 4", rank: 3, score: 200 },
    { playerId: "player-2", displayName: "Player 2", rank: 4, score: 150 },
    { playerId: "player-3", displayName: "Player 3", rank: 5, score: 100 },
  ];

  assert.deepEqual(store.applyTournamentSnapshotFromRoom(projection, 1000), { ok: true });
  assert.deepEqual(
    store.getState().tournament.standings.map(function mapItem(row) {
      return [row.playerId, row.seed];
    }),
    [
      ["player-5", 5],
      ["player-1", 1],
      ["player-4", 4],
      ["player-2", 2],
      ["player-3", 3],
    ],
  );
});

test("완료 event와 snapshot 순서가 달라도 이번 라운드 점수를 한 번만 계산한다", function testCase() {
  const completedProjection = createCompletedProjection(9);
  const completedEvent = {
    roundIndex: 3,
    championPlayerId: completedProjection.tournament.bracket?.championPlayerId ?? "",
    standings: completedProjection.finalStandings,
  };
  const expectedRoundScores = [200, 150, 100, 50, 50];

  for (const eventFirst of [false, true]) {
    const store = createGameStateStore();
    completedProjection.finalStandings.forEach(function visitItem(row, index) {
      store.applyRoundScoreUpdatedFromRoom({
        roundIndex: 2,
        playerId: row.playerId,
        rank: row.rank,
        score: index === 4 ? 50 : 100,
      });
    });

    if (eventFirst) {
      assert.deepEqual(store.applyTournamentCompletedFromRoom(completedEvent, 1_000), { ok: true });
      assert.deepEqual(store.applyTournamentSnapshotFromRoom(completedProjection, 1_100), {
        ok: true,
      });
    } else {
      assert.deepEqual(store.applyTournamentSnapshotFromRoom(completedProjection, 1_000), {
        ok: true,
      });
      assert.deepEqual(store.applyTournamentCompletedFromRoom(completedEvent, 1_100), { ok: true });
    }

    assert.deepEqual(
      store.getState().tournament.lastRoundScores.map(function mapItem(row) {
        return row.score;
      }),
      expectedRoundScores,
    );
  }
});

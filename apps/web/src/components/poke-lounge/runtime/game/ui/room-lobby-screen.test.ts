import assert from "node:assert/strict";
import test from "node:test";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import { createRoomLobbyViewState } from "./room-lobby-screen";

function createProjection(): TournamentStateRoomPayload {
  return {
    revision: 1,
    roomCode: "ROOM01",
    hostPlayerId: "player-1",
    roundIndex: 0,
    roomStatus: "waiting",
    roomRound: {
      index: 0,
      phase: "waiting",
      durationMs: 300_000,
      startedAtMs: null,
      endsAtMs: null,
    },
    participants: ["player-1", "player-2"].map(function mapItem(playerId) {
      return {
        playerId,
        displayName: playerId,
        role: "participant" as const,
        ready: true,
        partyReady: true,
        connected: true,
        seed: null,
      };
    }),
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

test("방장은 2명 모두 접속·파티·준비가 끝났을 때만 시작할 수 있다", function testCase() {
  const projection = createProjection();
  assert.deepEqual(createRoomLobbyViewState(projection), {
    participantCount: 2,
    ownReady: true,
    ownPartyReady: true,
    isHost: true,
    readyDisabled: false,
    startDisabledReason: null,
  });

  projection.participants[1]!.connected = false;
  assert.equal(createRoomLobbyViewState(projection).startDisabledReason, "connection");
  projection.participants[1]!.connected = true;
  projection.participants[1]!.partyReady = false;
  assert.equal(createRoomLobbyViewState(projection).startDisabledReason, "party");
  projection.participants[1]!.partyReady = true;
  projection.participants[1]!.ready = false;
  assert.equal(createRoomLobbyViewState(projection).startDisabledReason, "ready");
});

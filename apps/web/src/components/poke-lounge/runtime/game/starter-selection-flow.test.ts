import assert from "node:assert/strict";
import test from "node:test";
import { shouldSelectStarterAfterRoomStart } from "./starter-selection-flow";
import type { TournamentStateRoomPayload } from "./network/tournament-projection";

function projection(roomStatus: TournamentStateRoomPayload["roomStatus"]) {
  return {
    roomStatus,
    ownPlayerId: "host",
    participants: [
      {
        playerId: "host",
        displayName: "Host",
        role: "participant" as const,
        connected: true,
        ready: false,
        partyReady: false,
        seed: null,
      },
    ],
  };
}
test("방 입장·준비 상태에서는 빈 파티여도 선택창을 열지 않는다", function lobbyEntry() {
  assert.equal(shouldSelectStarterAfterRoomStart(projection("waiting"), true), false);
});
test("게임이 시작되면 아직 선택하지 않은 참가자만 포켓몬을 고른다", function started() {
  assert.equal(shouldSelectStarterAfterRoomStart(projection("round-started"), true), true);
  assert.equal(shouldSelectStarterAfterRoomStart(projection("round-started"), false), false);
});
test("종료된 방·관전자·연결이 끊긴 참가자는 선택창을 열지 않는다", function ineligible() {
  for (const status of ["completed", "closed", "tournament"] as const) {
    assert.equal(shouldSelectStarterAfterRoomStart(projection(status), true), false);
  }
  const room = projection("round-started");
  assert.equal(
    shouldSelectStarterAfterRoomStart({ ...room, ownPlayerId: "spectator" }, true),
    false,
  );
  assert.equal(
    shouldSelectStarterAfterRoomStart(
      {
        ...room,
        participants: room.participants.map(function spectator(p) {
          return { ...p, role: "spectator" as const };
        }),
      },
      true,
    ),
    false,
  );
  room.participants[0]!.connected = false;
  assert.equal(shouldSelectStarterAfterRoomStart(room, true), false);
});

test("선택 완료한 참가자도 서버의 공통 시작 시간 전에는 탐험하지 않는다", async () => {
  const { isWaitingForStarterSelections } = await import("./starter-selection-flow");
  const roomRound = {
    index: 1,
    phase: "round-started" as const,
    durationMs: 90_000,
    startedAtMs: null,
    endsAtMs: null,
  };
  assert.equal(isWaitingForStarterSelections({ roomStatus: "round-started", roomRound }), true);
  assert.equal(isWaitingForStarterSelections({ roomStatus: "waiting", roomRound }), false);
  assert.equal(isWaitingForStarterSelections(null), false);
  assert.equal(
    isWaitingForStarterSelections({
      roomStatus: "round-started",
      roomRound: { ...roomRound, startedAtMs: 5000, endsAtMs: 95000 },
    }),
    false,
  );
});

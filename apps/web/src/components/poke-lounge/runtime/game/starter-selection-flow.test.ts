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

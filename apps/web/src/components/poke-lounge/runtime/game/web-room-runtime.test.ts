import assert from "node:assert/strict";
import test from "node:test";
import { createLocalPreviewRoom } from "./network/localPreviewRoom";
import { createGameStateStore } from "./state/gameStateStore";
import { startWebRoomRuntime } from "./web-room-runtime";

test("Web room runtime은 연결 상태와 파티 스냅샷을 게임 엔진 없이 동기화한다", () => {
  const store = createGameStateStore();
  const room = createLocalPreviewRoom({ roomId: "web-runtime-test", sessionId: "session-1" });
  const runtime = startWebRoomRuntime({ gameStateStore: store, room });

  assert.equal(store.getState().session.connectionStatus, "online");
  assert.equal(store.getState().session.roomId, "web-runtime-test");

  store.setLocalPlayerPokeDollars(1234);
  runtime.dispose();

  assert.equal(store.getState().session.connectionStatus, "offline");
  assert.equal(store.getState().session.roomId, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createWorldFrameStore, type WorldFrame } from "./world-frame-store";

const frame = (x: number, remotePlayers: WorldFrame["remotePlayers"] = []): WorldFrame => ({
  battleIntroPlaying: false,
  camera: { height: 384, width: 512, x: 0, y: 0 },
  localPlayer: { facing: "right", frameName: "hero-right", walking: x > 0, x, y: 20 },
  remotePlayers,
});

test("월드 frame 갱신은 React에 매 frame 알리지 않고 actor 구조 변경만 알린다", () => {
  const store = createWorldFrameStore();
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.publish(frame(10));
  store.publish(frame(20));
  assert.equal(notifications, 0);
  assert.equal(store.read().localPlayer.x, 20);

  const remote = {
    displayName: "원격 트레이너",
    facing: "front" as const,
    frameName: "hero-front",
    sessionId: "remote-1",
    walking: false,
    x: 30,
    y: 40,
  };
  store.publish(frame(20, [remote]));
  store.publish(frame(21, [{ ...remote, x: 50 }]));
  assert.equal(notifications, 1);

  store.publish(frame(21, [{ ...remote, displayName: "새 이름" }]));
  assert.equal(notifications, 2);
  store.clear();
  assert.equal(notifications, 3);
});

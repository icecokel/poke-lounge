import assert from "node:assert/strict";
import test from "node:test";
import { createLobbyCommandRunner, type LobbyCommandState } from "./lobby-command-runner";
test("대기실은 React batching과 관계없이 동시 명령을 차단한다", async () => {
  const states: LobbyCommandState[] = [];
  let release!: () => void,
    calls = 0;
  const c = createLobbyCommandRunner(s => states.push(s));
  const first = c.run("ready", () => {
    calls++;
    return new Promise<void>(r => {
      release = r;
    });
  });
  await c.run("start", async () => {
    calls++;
  });
  assert.equal(calls, 1);
  assert.deepEqual(states, [{ pending: "ready", failed: false }]);
  release();
  await first;
  assert.deepEqual(states.at(-1), { pending: null, failed: false });
  c.dispose();
});
test("대기실 명령 오류 후 잠금을 해제하고 폐기한 UI에 알리지 않는다", async () => {
  const states: LobbyCommandState[] = [];
  const c = createLobbyCommandRunner(s => states.push(s));
  await c.run("ai-add", async () => {
    throw Error("failed");
  });
  assert.deepEqual(states.at(-1), { pending: null, failed: true });
  let release!: () => void;
  const pending = c.run(
    "start",
    () =>
      new Promise<void>(r => {
        release = r;
      }),
  );
  const size = states.length;
  c.dispose();
  release();
  await pending;
  assert.equal(states.length, size);
  let called = false;
  await c.run("ready", async () => {
    called = true;
  });
  assert.equal(called, false);
});

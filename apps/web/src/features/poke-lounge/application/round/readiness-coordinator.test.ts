import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgePreparation } from "./acknowledge-preparation";
import { createReadinessCoordinator, type ReadinessStatus } from "./readiness-coordinator";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const ready = { key: "room:1:player", roundIndex: 1, rendered: true };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test("준비 조정은 연속 두 프레임 뒤 한 번 전송하고 DOM 없이 실행된다", async () => {
  const statuses: ReadinessStatus[] = [];
  let calls = 0;
  const coordinator = createReadinessCoordinator({
    submit: async () => {
      calls++;
    },
    onStatus: s => statuses.push(s),
  });
  coordinator.observe(ready);
  await flush();
  assert.equal(calls, 0);
  coordinator.observe({ ...ready, rendered: false });
  coordinator.observe(ready);
  await flush();
  assert.equal(calls, 0);
  coordinator.observe(ready);
  for (let i = 0; i < 10; i++) coordinator.observe(ready);
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(statuses, ["sending", "ready"]);
  coordinator.observe(ready);
  await flush();
  assert.equal(calls, 1);
  coordinator.dispose();
});
test("준비 실패는 자동 재전송하지 않고 사용자 재시도 뒤에만 처리한다", async () => {
  const statuses: ReadinessStatus[] = [];
  let calls = 0;
  const c = createReadinessCoordinator({
    submit: async () => {
      if (++calls === 1) throw Error("offline");
    },
    onStatus: s => statuses.push(s),
  });
  c.observe(ready);
  c.observe(ready);
  await flush();
  assert.equal(statuses.at(-1), "failed");
  c.observe(ready);
  await flush();
  assert.equal(calls, 1);
  c.retry();
  c.observe(ready);
  c.observe(ready);
  await flush();
  assert.equal(calls, 2);
  assert.equal(statuses.at(-1), "ready");
  c.dispose();
});
test("이전 라운드 응답이 새 준비 상태를 변경하지 않는다", async () => {
  const first = deferred(),
    second = deferred(),
    statuses: ReadinessStatus[] = [];
  const c = createReadinessCoordinator({
    submit: index => (index === 1 ? first.promise : second.promise),
    onStatus: s => statuses.push(s),
  });
  c.observe(ready);
  c.observe(ready);
  await flush();
  const next = { ...ready, key: "room:2:player", roundIndex: 2 };
  c.observe(next);
  c.observe(next);
  await flush();
  first.reject(Error("stale failure"));
  await flush();
  assert.equal(statuses.at(-1), "sending");
  second.resolve();
  await flush();
  assert.equal(statuses.at(-1), "ready");
  c.dispose();
});
test("화면 폐기 직후 예약된 전송은 실행하지 않고 이미 진행 중인 결과도 무시한다", async () => {
  let calls = 0;
  const statuses: ReadinessStatus[] = [];
  const c = createReadinessCoordinator({
    submit: async () => {
      calls++;
    },
    onStatus: s => statuses.push(s),
  });
  c.observe(ready);
  c.observe(ready);
  c.dispose();
  await flush();
  assert.equal(calls, 0);
  assert.deepEqual(statuses, ["sending"]);
  const d = deferred();
  const second = createReadinessCoordinator({
    submit: () => d.promise,
    onStatus: s => statuses.push(s),
  });
  second.observe(ready);
  second.observe(ready);
  await flush();
  const count = statuses.length;
  second.dispose();
  d.resolve();
  await flush();
  assert.equal(statuses.length, count);
});
test("공통 준비 확인은 revision 충돌에만 재시도하며 최신 상태를 적용한다", async () => {
  let calls = 0;
  const applied: number[] = [];
  await acknowledgePreparation({
    isNeeded: () => true,
    submit: async () => {
      if (++calls < 3) throw "revision";
      return 9;
    },
    apply: s => applied.push(s),
    isRevisionConflict: e => e === "revision",
  });
  assert.equal(calls, 3);
  assert.deepEqual(applied, [9]);
});
test("준비 확인 재시도는 8번을 넘지 않고 일반 오류를 숨기지 않는다", async () => {
  let calls = 0;
  await assert.rejects(
    acknowledgePreparation({
      isNeeded: () => true,
      submit: async () => {
        calls++;
        throw Error("revision");
      },
      apply: () => {},
      isRevisionConflict: () => true,
    }),
    /revision/,
  );
  assert.equal(calls, 8);
  calls = 0;
  await assert.rejects(
    acknowledgePreparation({
      isNeeded: () => true,
      submit: async () => {
        calls++;
        throw Error("network");
      },
      apply: () => {},
      isRevisionConflict: () => false,
    }),
    /network/,
  );
  assert.equal(calls, 1);
});
test("이미 출발했거나 준비된 상태에서는 준비 요청을 추가 전송하지 않는다", async () => {
  let calls = 0;
  await acknowledgePreparation({
    isNeeded: () => false,
    submit: async () => {
      calls++;
    },
    apply: () => {},
    isRevisionConflict: () => true,
  });
  assert.equal(calls, 0);
  let needed = true;
  await acknowledgePreparation({
    isNeeded: () => needed,
    submit: async () => {
      calls++;
      needed = false;
      throw "revision";
    },
    apply: () => {},
    isRevisionConflict: () => true,
  });
  assert.equal(calls, 1);
});

import { createGameStateStore } from "@/components/poke-lounge/runtime/game/state/game-state-store";
import { buildPokeLoungeSaveSnapshot } from "@/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";
import assert from "node:assert/strict";
import test from "node:test";
import { hydrateGameProgress, type HydrationPorts } from "./hydrate-game-progress";

function fixture() {
  const local = buildPokeLoungeSaveSnapshot(createGameStateStore());
  const server = structuredClone(local);
  server.state.playersById[server.state.currentPlayerId]!.wallet.pokeDollars += 100;
  const called: string[] = [];
  const ports: HydrationPorts = {
    isCurrent: () => true,
    selectAnonymousScope: () => {
      called.push("anonymous");
    },
    selectAccountScope: () => true,
    load: async () => ({ success: true, snapshot: server, revision: 4 }),
    readLocal: () => local,
    hydrate: () => {
      called.push("hydrate");
    },
  };
  return { ports, local, server, called };
}
const account = { authenticated: true, accountId: "a", token: "token" };
test("저장 복원은 익명과 신원 오류를 구분하고 서버를 호출하지 않는다", async () => {
  const { ports, called } = fixture();
  ports.load = async () => {
    throw Error("must not load");
  };
  assert.deepEqual(await hydrateGameProgress({ ...account, authenticated: false }, ports), {
    kind: "anonymous",
  });
  assert.deepEqual(await hydrateGameProgress({ ...account, token: undefined }, ports), {
    kind: "identity-error",
  });
  assert.deepEqual(called, ["anonymous", "anonymous"]);
});
test("복원한 로컬 진행이 다르면 선택을 요청하고 어느 쪽도 덮어쓰지 않는다", async () => {
  const { ports, called, server } = fixture();
  const result = await hydrateGameProgress(account, ports);
  assert.deepEqual(result, { kind: "conflict", accountId: "a", revision: 4, snapshot: server });
  assert.deepEqual(called, []);
});
test("첫 로그인에서는 서버 상태를 반영하고 실패 시 로컬 대체로 반환한다", async () => {
  const { ports, called } = fixture();
  ports.selectAccountScope = () => false;
  assert.deepEqual(await hydrateGameProgress(account, ports), {
    kind: "ready",
    accountId: "a",
    revision: 4,
    flushLocal: false,
  });
  assert.deepEqual(called, ["hydrate"]);
  ports.load = async () => ({ success: false, unavailable: true, message: "offline" });
  assert.deepEqual(await hydrateGameProgress(account, ports), { kind: "local-fallback" });
});
test("서버 저장이 없으면 로컬 진행을 보존하고 후속 업로드를 요청한다", async () => {
  const { ports, called } = fixture();
  ports.load = async () => ({ success: true, snapshot: null, revision: 0 });
  assert.deepEqual(await hydrateGameProgress(account, ports), {
    kind: "ready",
    accountId: "a",
    revision: 0,
    flushLocal: true,
  });
  assert.deepEqual(called, []);
});
test("재시도는 동일한 진행이라도 저장소를 다시 덮지 않는다", async () => {
  const { ports, local, called } = fixture();
  ports.load = async () => ({ success: true, snapshot: local, revision: 5 });
  assert.deepEqual(await hydrateGameProgress({ ...account, mode: "retry" }, ports), {
    kind: "ready",
    accountId: "a",
    revision: 5,
    flushLocal: true,
  });
  assert.deepEqual(called, []);
});
test("계정이 바뀌거나 화면이 사라진 뒤 응답은 복원하지 않는다", async () => {
  const { ports, called, server } = fixture();
  let current = true;
  ports.isCurrent = () => current;
  ports.selectAccountScope = () => false;
  ports.load = async () => {
    current = false;
    return { success: true, snapshot: server, revision: 4 };
  };
  assert.deepEqual(await hydrateGameProgress(account, ports), { kind: "cancelled" });
  assert.deepEqual(called, []);
  assert.deepEqual(await hydrateGameProgress(account, ports), { kind: "cancelled" });
});

import { expect, test } from "@playwright/test";
import {
  buildPokeLoungeSaveSnapshot,
  POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
} from "../../src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";
import { createGameStateStore } from "../../src/components/poke-lounge/runtime/game/state/gameStateStore";
import {
  createPokeLoungeAutosaveLifecycle,
  createPokeLoungeTokenLifecycle,
  getPokeLoungeTokenLifecycle,
  startPokeLoungeAutosave,
} from "../../src/components/poke-lounge/poke-lounge-autosave";
import {
  loadPokeLoungeState,
  savePokeLoungeState,
} from "../../src/services/poke-lounge-state-service";
import { ApiError } from "../../src/lib/api-client";

const CLIENT_UPDATED_AT = "2026-07-08T12:00:00.000Z";

const createStarterPokemon = (name = "브케인") => ({
  speciesId: 155,
  name,
  level: 5,
  maxHp: 20,
  currentHp: 20,
  experience: 0,
  growthRate: 1_000_000,
  status: "normal" as const,
  moves: [
    {
      id: 33,
      name: "몸통박치기",
      pp: 35,
      maxPp: 35,
    },
  ],
});

function createManualScheduler() {
  type ScheduledTask = {
    delayMs: number;
    callback: () => void;
  };

  const timeouts: ScheduledTask[] = [];
  const intervals: ScheduledTask[] = [];

  const removeTask = (tasks: ScheduledTask[], task: ScheduledTask) => {
    const index = tasks.indexOf(task);
    if (index >= 0) {
      tasks.splice(index, 1);
    }
  };

  return {
    timeouts,
    intervals,
    scheduler: {
      setTimeout(callback: () => void, delayMs: number) {
        const task = { delayMs, callback };
        timeouts.push(task);
        return task;
      },
      clearTimeout(task: ScheduledTask) {
        removeTask(timeouts, task);
      },
      setInterval(callback: () => void, delayMs: number) {
        const task = { delayMs, callback };
        intervals.push(task);
        return task;
      },
      clearInterval(task: ScheduledTask) {
        removeTask(intervals, task);
      },
    },
    runNextTimeout() {
      const task = timeouts.shift();
      task?.callback();
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

test.describe("Poke Lounge autosave", () => {
  test("저장 스냅샷은 현재 GameState를 JSON 직렬화 가능한 복사본으로 만든다", () => {
    const store = createGameStateStore();
    const starter = createStarterPokemon();
    store.setStarterPokemon(starter);

    const snapshot = buildPokeLoungeSaveSnapshot(store);

    expect(snapshot.version).toBe(POKE_LOUNGE_SAVE_SNAPSHOT_VERSION);
    expect(snapshot.game).toBe("poke-lounge");
    expect(snapshot.state.currentPlayerId).toBe("player-1");
    expect(snapshot.state.playersById["player-1"]?.party[0]?.pokemon?.name).toBe("브케인");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);

    store.updateActivePokemon({
      ...starter,
      name: "리아코",
    });

    expect(snapshot.state.playersById["player-1"]?.party[0]?.pokemon?.name).toBe("브케인");
  });

  test("저장 서비스는 인증 토큰으로 권장 API 계약에 맞춰 PUT 요청을 보낸다", async () => {
    const state = {
      version: POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
      game: "poke-lounge",
      state: { currentPlayerId: "player-1" },
    };
    const calls: unknown[] = [];

    const result = await savePokeLoungeState(
      {
        state,
        expectedRevision: 4,
        clientUpdatedAt: CLIENT_UPDATED_AT,
      },
      "id-token",
      {
        put: async (...args) => {
          calls.push(args);
          return { revision: 5 };
        },
      },
    );

    expect(result).toEqual({ success: true, revision: 5 });
    expect(calls).toEqual([
      [
        "/game/poke-lounge/state",
        {
          state,
          expectedRevision: 4,
          clientUpdatedAt: CLIENT_UPDATED_AT,
        },
        {
          token: "id-token",
          signal: expect.any(AbortSignal),
        },
      ],
    ]);
  });

  test("저장 서비스는 page exit 요청에 fetch keepalive를 전달한다", async () => {
    const calls: unknown[] = [];

    const result = await savePokeLoungeState(
      { state: { marker: "page-exit" }, expectedRevision: 0 },
      "id-token",
      {
        put: async (...args) => {
          calls.push(args);
          return { revision: 1 };
        },
      },
      { keepalive: true },
    );

    expect(result).toEqual({ success: true, revision: 1 });
    expect(calls).toEqual([
      [
        "/game/poke-lounge/state",
        { state: { marker: "page-exit" }, expectedRevision: 0 },
        { token: "id-token", keepalive: true, signal: expect.any(AbortSignal) },
      ],
    ]);
  });

  test("인증된 GET이 완료되기 전에는 첫 PUT을 시작하지 않는다", async () => {
    const calls: string[] = [];
    const deferredGet = createDeferred<unknown>();
    const store = createGameStateStore();
    const snapshot = buildPokeLoungeSaveSnapshot(store);
    const manualScheduler = createManualScheduler();

    const startAfterHydration = async () => {
      const loaded = await loadPokeLoungeState("id-token", {
        get: async () => {
          calls.push("GET");
          return deferredGet.promise;
        },
      });

      if (!loaded.success) {
        return;
      }

      if (loaded.snapshot) {
        store.hydrateLocalPlayers(loaded.snapshot.state);
      }

      const autosave = startPokeLoungeAutosave({
        gameStateStore: store,
        token: "id-token",
        initialRevision: loaded.revision,
        scheduler: manualScheduler.scheduler,
        saveState: async payload => {
          calls.push("PUT");
          return { success: true, revision: payload.expectedRevision + 1 };
        },
      });

      await autosave.flush();
      await autosave.dispose({ flush: false });
    };

    const startPromise = startAfterHydration();

    expect(calls).toEqual(["GET"]);

    deferredGet.resolve({ state: snapshot, revision: 3 });
    await startPromise;

    expect(calls).toEqual(["GET", "PUT"]);
  });

  test("404 상태 조회는 빈 저장 상태로 정규화한다", async () => {
    const result = await loadPokeLoungeState("id-token", {
      get: async () => {
        throw new ApiError(404, "Poke Lounge state not found");
      },
    });

    expect(result).toEqual({ success: true, snapshot: null, revision: 0 });
  });

  test("revision이 없는 빈 성공 응답은 저장 없음으로 오인하지 않는다", async () => {
    const result = await loadPokeLoungeState("id-token", {
      get: async () => ({}),
    });

    expect(result).toEqual({
      success: false,
      unavailable: true,
      message: "저장된 Poke Lounge revision 형식이 올바르지 않습니다.",
    });
  });

  test("2xx state null 응답은 초기 상태로 대체하지 않고 계약 오류로 처리한다", async () => {
    const result = await loadPokeLoungeState("id-token", {
      get: async () => ({ state: null, revision: 5 }),
    });

    expect(result).toEqual({
      success: false,
      unavailable: true,
      message: "저장된 Poke Lounge 상태가 응답에 없습니다.",
    });
  });

  test("저장 revision 충돌은 409로 명시해 덮어쓰기를 막는다", async () => {
    const result = await savePokeLoungeState(
      {
        state: { marker: "stale-device" },
        expectedRevision: 2,
      },
      "id-token",
      {
        put: async () => {
          throw new ApiError(409, "Poke Lounge state revision conflict");
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      conflict: true,
      unavailable: true,
      status: 409,
    });
  });

  test("자동 저장 409는 stale revision 재시도를 중단하고 재수화를 한 번 요청한다", async () => {
    const store = createGameStateStore();
    const manualScheduler = createManualScheduler();
    const revisions: number[] = [];
    let conflicts = 0;
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      initialRevision: 2,
      scheduler: manualScheduler.scheduler,
      saveState: async payload => {
        revisions.push(payload.expectedRevision);
        return { success: false, conflict: true, status: 409 };
      },
      onRevisionConflict: () => {
        conflicts += 1;
      },
    });

    await autosave.flush();
    store.setStarterPokemon(createStarterPokemon());
    manualScheduler.runNextTimeout();
    await autosave.waitForIdle();

    expect(revisions).toEqual([2]);
    expect(conflicts).toBe(1);
    expect(manualScheduler.timeouts).toHaveLength(0);
    await autosave.dispose();
    expect(revisions).toEqual([2]);
  });

  test("page exit flush는 keepalive 요청으로 마지막 상태를 전송한다", async () => {
    const store = createGameStateStore();
    const keepaliveValues: boolean[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      saveState: async payload => {
        keepaliveValues.push(payload.keepalive);
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });

    await autosave.flush({ keepalive: true });
    await autosave.dispose({ flush: false });

    expect(keepaliveValues).toEqual([true]);
  });

  test("동일 계정 토큰 갱신은 재수화 없이 다음 저장부터 새 토큰을 사용한다", async () => {
    const store = createGameStateStore();
    const tokens: string[] = [];
    let currentToken = "token-a";
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: currentToken,
      getToken: () => currentToken,
      saveState: async payload => {
        tokens.push(payload.token);
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });

    await autosave.flush();
    currentToken = "token-a-refreshed";
    store.setStarterPokemon(createStarterPokemon());
    await autosave.flush();
    await autosave.dispose({ flush: false });

    expect(tokens).toEqual(["token-a", "token-a-refreshed"]);
  });

  test("계정 전환은 token A 마지막 저장을 마친 뒤 token B 상태를 조회한다", async () => {
    const calls: string[] = [];
    const tokenBGet = createDeferred<unknown>();
    const store = createGameStateStore();
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "token-a",
      saveState: async payload => {
        calls.push(`PUT:${payload.token}`);
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });
    const lifecycle = createPokeLoungeAutosaveLifecycle(autosave);
    const tokenLifecycle = createPokeLoungeTokenLifecycle();
    tokenLifecycle.registerAutosave(lifecycle);

    store.setStarterPokemon(createStarterPokemon());
    const nextHydration = tokenLifecycle.runHydration(async () => {
      return loadPokeLoungeState("token-b", {
        get: async () => {
          calls.push("GET:token-b");
          return tokenBGet.promise;
        },
      });
    });

    await expect.poll(() => calls).toEqual(["PUT:token-a", "GET:token-b"]);

    tokenBGet.reject(new Error("network unavailable"));
    await expect(nextHydration).resolves.toMatchObject({ success: false, unavailable: true });
    expect(calls).toEqual(["PUT:token-a", "GET:token-b"]);
  });

  test("token B hydration은 token A의 진행 중인 PUT이 끝난 뒤 최종 서버 상태를 조회한다", async () => {
    const calls: string[] = [];
    const store = createGameStateStore();
    const tokenAPut = createDeferred<{ success: true; revision: number }>();
    let serverSnapshot = buildPokeLoungeSaveSnapshot(store);
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "token-a",
      saveState: async payload => {
        calls.push("PUT:token-a");
        await tokenAPut.promise;
        serverSnapshot = payload.snapshot;
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });
    const lifecycle = createPokeLoungeAutosaveLifecycle(autosave);
    const tokenLifecycle = createPokeLoungeTokenLifecycle();

    store.setStarterPokemon(createStarterPokemon("리아코"));
    const putPromise = autosave.flush();
    tokenLifecycle.disposeForRehydration(lifecycle);

    store.updateActivePokemon(createStarterPokemon("치코리타"));
    const hydrationPromise = tokenLifecycle.runHydration(async () => {
      calls.push("GET:token-b");
      const loaded = await loadPokeLoungeState("token-b", {
        get: async () => ({ state: serverSnapshot, revision: 1 }),
      });
      if (loaded.success && loaded.snapshot) {
        store.hydrateLocalPlayers(loaded.snapshot.state);
      }
    });

    await Promise.resolve();
    expect(calls).toEqual(["PUT:token-a"]);

    tokenAPut.resolve({ success: true, revision: 1 });
    await Promise.all([putPromise, hydrationPromise]);

    expect(calls).toEqual(["PUT:token-a", "PUT:token-a", "GET:token-b"]);
    expect(store.getState().playersById["player-1"]?.party[0]?.pokemon?.name).toBe("치코리타");
  });

  test("정상 unmount lifecycle은 마지막 자동 저장을 유지한다", async () => {
    const store = createGameStateStore();
    const saves: string[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "token-a",
      saveState: async payload => {
        saves.push(payload.token);
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });
    const lifecycle = createPokeLoungeAutosaveLifecycle(autosave);

    store.setStarterPokemon(createStarterPokemon());
    await lifecycle.disposeForUnmount();

    expect(saves).toEqual(["token-a"]);
  });

  test("StrictMode 재실행 hydration은 unmount cleanup의 마지막 flush를 기다린다", async () => {
    const calls: string[] = [];
    const store = createGameStateStore();
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "token-a",
      saveState: async payload => {
        calls.push("PUT:token-a");
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });
    const lifecycle = createPokeLoungeAutosaveLifecycle(autosave);
    const tokenLifecycle = createPokeLoungeTokenLifecycle();
    tokenLifecycle.registerAutosave(lifecycle);
    store.setStarterPokemon(createStarterPokemon());

    tokenLifecycle.disposeForUnmount(lifecycle);
    await tokenLifecycle.runHydration(async () => {
      calls.push("GET:token-a");
    });

    expect(calls).toEqual(["PUT:token-a", "GET:token-a"]);
  });

  test("실제 remount hydration은 이전 인스턴스의 진행 중 PUT과 unmount flush를 기다린다", async () => {
    const calls: string[] = [];
    const store = createGameStateStore();
    const firstPut = createDeferred<{ success: true; revision: number }>();
    const finalPut = createDeferred<{ success: true; revision: number }>();
    let putCount = 0;
    const firstInstanceLifecycle = getPokeLoungeTokenLifecycle();
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "token-a",
      saveState: async () => {
        putCount += 1;
        calls.push(`PUT:${putCount}`);
        return putCount === 1 ? firstPut.promise : finalPut.promise;
      },
    });
    const autosaveLifecycle = createPokeLoungeAutosaveLifecycle(autosave);
    firstInstanceLifecycle.registerAutosave(autosaveLifecycle);

    store.setStarterPokemon(createStarterPokemon("리아코"));
    const inFlightPut = autosave.flush();
    store.updateActivePokemon(createStarterPokemon("치코리타"));
    firstInstanceLifecycle.disposeForUnmount(autosaveLifecycle);

    const remountedInstanceLifecycle = getPokeLoungeTokenLifecycle();
    const hydration = remountedInstanceLifecycle.runHydration(async () => {
      calls.push("GET:token-a");
    });

    await Promise.resolve();
    expect(calls).toEqual(["PUT:1"]);

    firstPut.resolve({ success: true, revision: 1 });
    await inFlightPut;
    await expect.poll(() => calls).toEqual(["PUT:1", "PUT:2"]);

    finalPut.resolve({ success: true, revision: 2 });
    await hydration;

    expect(calls).toEqual(["PUT:1", "PUT:2", "GET:token-a"]);
  });

  test("dispose 대기 중 취소된 hydration은 GET 없이 끝나고 다음 hydration을 막지 않는다", async () => {
    const calls: string[] = [];
    const disposal = createDeferred<void>();
    const tokenLifecycle = createPokeLoungeTokenLifecycle();
    const lifecycle = {
      disposeForRehydration: () => disposal.promise,
      disposeForUnmount: () => disposal.promise,
    };
    let cancelled = false;
    tokenLifecycle.registerAutosave(lifecycle);

    const cancelledHydration = tokenLifecycle.runHydration(async () => {
      if (!cancelled) {
        calls.push("GET:cancelled");
      }
    });
    cancelled = true;
    const nextHydration = tokenLifecycle.runHydration(async () => {
      calls.push("GET:next");
    });

    disposal.resolve();
    await Promise.all([cancelledHydration, nextHydration]);

    expect(calls).toEqual(["GET:next"]);
  });

  test("저장 서비스는 토큰이 없으면 요청을 보내지 않고 조용히 건너뛴다", async () => {
    const calls: unknown[] = [];

    const result = await savePokeLoungeState(
      {
        state: {
          version: POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
          game: "poke-lounge",
          state: { currentPlayerId: "player-1" },
        },
        expectedRevision: 0,
        clientUpdatedAt: CLIENT_UPDATED_AT,
      },
      undefined,
      {
        put: async (...args) => {
          calls.push(args);
          return { saved: true };
        },
      },
    );

    expect(result).toEqual({ success: false, skipped: true, requiresAuth: true });
    expect(calls).toEqual([]);
  });

  test("자동 저장 클라이언트는 상태 변경을 debounce하고 마지막 cleanup flush를 수행한다", async () => {
    const store = createGameStateStore();
    const manualScheduler = createManualScheduler();
    const saves: unknown[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      intervalMs: 30_000,
      debounceMs: 2_000,
      scheduler: manualScheduler.scheduler,
      getClientUpdatedAt: () => CLIENT_UPDATED_AT,
      saveState: async payload => {
        saves.push(payload);
        return { success: true, revision: payload.expectedRevision + 1 };
      },
    });

    expect(manualScheduler.intervals[0]?.delayMs).toBe(30_000);

    store.setStarterPokemon(createStarterPokemon());

    expect(manualScheduler.timeouts[0]?.delayMs).toBe(2_000);

    manualScheduler.runNextTimeout();
    await autosave.waitForIdle();

    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      token: "id-token",
      expectedRevision: 0,
      clientUpdatedAt: CLIENT_UPDATED_AT,
      snapshot: {
        version: POKE_LOUNGE_SAVE_SNAPSHOT_VERSION,
        game: "poke-lounge",
      },
    });

    store.updateActivePokemon(createStarterPokemon("리아코"));
    await autosave.dispose();

    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({
      token: "id-token",
      expectedRevision: 1,
      clientUpdatedAt: CLIENT_UPDATED_AT,
      snapshot: {
        state: {
          playersById: {
            "player-1": {
              party: [
                {
                  pokemon: {
                    name: "리아코",
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  test("자동 저장 상태를 대기·저장 중·완료 순서로 알린다", async () => {
    const store = createGameStateStore();
    const manualScheduler = createManualScheduler();
    const statuses: string[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      scheduler: manualScheduler.scheduler,
      saveState: async payload => ({
        success: true,
        revision: payload.expectedRevision + 1,
      }),
      onStatusChange: status => statuses.push(status),
    });

    expect(statuses).toEqual(["idle"]);

    store.setStarterPokemon(createStarterPokemon());
    expect(statuses).toEqual(["idle", "pending"]);

    manualScheduler.runNextTimeout();
    await autosave.waitForIdle();

    expect(statuses).toEqual(["idle", "pending", "saving", "saved"]);
    await autosave.dispose({ flush: false });
  });

  test("자동 저장 요청 예외는 실패 상태로 알리고 다음 저장 대상으로 유지한다", async () => {
    const store = createGameStateStore();
    const statuses: string[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      saveState: async () => {
        throw new Error("network unavailable");
      },
      onStatusChange: status => statuses.push(status),
    });

    await expect(autosave.flush()).resolves.toBeUndefined();
    expect(statuses).toEqual(["idle", "saving", "error"]);
    await autosave.dispose({ flush: false });
  });

  test("in-flight 저장 중 dispose하면 dispose 시점 스냅샷을 마지막으로 저장한다", async () => {
    const store = createGameStateStore();
    const manualScheduler = createManualScheduler();
    const firstSave = createDeferred<{ success: true; revision: number }>();
    const saves: unknown[] = [];
    const autosave = startPokeLoungeAutosave({
      gameStateStore: store,
      token: "id-token",
      intervalMs: 30_000,
      debounceMs: 2_000,
      scheduler: manualScheduler.scheduler,
      getClientUpdatedAt: () => CLIENT_UPDATED_AT,
      saveState: payload => {
        saves.push(payload);
        return saves.length === 1
          ? firstSave.promise
          : Promise.resolve({ success: true, revision: payload.expectedRevision + 1 });
      },
    });

    store.setStarterPokemon(createStarterPokemon("브케인"));
    manualScheduler.runNextTimeout();

    store.updateActivePokemon(createStarterPokemon("리아코"));
    const disposePromise = autosave.dispose();

    store.updateActivePokemon(createStarterPokemon("치코리타"));
    firstSave.resolve({ success: true, revision: 1 });
    await disposePromise;

    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({
      expectedRevision: 1,
      snapshot: {
        state: {
          playersById: {
            "player-1": {
              party: [
                {
                  pokemon: {
                    name: "리아코",
                  },
                },
              ],
            },
          },
        },
      },
    });
  });
});

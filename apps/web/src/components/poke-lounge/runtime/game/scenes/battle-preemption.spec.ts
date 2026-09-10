import assert from "node:assert/strict";
import test from "node:test";
import { BattleController } from "./battle-scene";
import { createSampleBattleState } from "../battle/battle-sample-state";
import { toPlayerPokemon } from "../battle/battle-world-persistence";
import { createGameStateStore } from "../state/game-state-store";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

for (const captured of [true, false]) {
  test(`집결 선점은 ${captured ? "확정된 포획을 한 번만 저장" : "미확정 포획을 생성하지 않음"}`, async () => {
    // Unit-only isolated controller; never used by the live player sessions.
    const store = createGameStateStore();
    const state = createSampleBattleState();
    state.battleKind = "wild";
    state.player.playerId = store.getState().currentPlayerId;
    store.setStarterPokemon(toPlayerPokemon(state.player.pokemon));
    const snapshot = store.getState();
    const gameStateStore = {
      ...store,
      getState: () => ({
        ...store.getState(),
        round: { ...snapshot.round, phase: "tournament" as const },
      }),
    };
    const controller = Object.create(BattleController.prototype) as BattleController;
    let transitions = 0;
    const fields = {
      gameStateStore,
      sceneLifecycleActive: true,
      sceneGeneration: 1,
      competitivePreemptionQueued: false,
      authoritativeProjection: null,
      messageAutoAdvanceTimer: null,
      options: { onReturnToWorld: () => transitions++ },
      ownerDocument: { dispatchEvent: () => true },
      pendingMoveLearnings: [],
      state: {
        ...state,
        tournamentMatchId: undefined,
        returnToWorld: { mapKey: "town", x: 0, y: 0, facing: "front" },
        result: captured
          ? {
              winnerPlayerId: state.player.playerId,
              loserPlayerId: state.opponent.playerId,
              reason: "capture",
              capturedPokemon: state.opponent.pokemon,
            }
          : null,
      },
    };
    for (const [key, value] of Object.entries(fields)) Reflect.set(controller, key, value);
    const preempt = Reflect.get(controller, "preemptLocalBattleForTournament") as (
      now: number,
    ) => boolean;
    assert.equal(preempt.call(controller, 1000), true);
    assert.equal(preempt.call(controller, 1000), true);
    await Promise.resolve();
    const party = store.getCurrentLocalPlayer().party.filter(slot => slot.pokemon);
    assert.equal(party.length, captured ? 2 : 1);
    assert.equal(transitions, 1);
    if (captured) {
      assert.equal(party[1].pokemon?.name, state.opponent.pokemon.name);
      assert.equal(party[1].pokemon?.currentHp, party[1].pokemon?.maxHp);
    }
  });
}

test("집결 확정 승리는 경험치 메시지 전에도 경험치·화폐를 한 번만 보존한다", async () => {
  const store = createGameStateStore();
  const state = createSampleBattleState();
  state.battleKind = "wild";
  state.phase = "ended";
  state.player.playerId = store.getState().currentPlayerId;
  store.setStarterPokemon(toPlayerPokemon(state.player.pokemon));
  const before = structuredClone(store.getCurrentLocalPlayer());
  const rewardedPokemon = {
    ...state.player.pokemon,
    experience: state.player.pokemon.experience + 80,
  };
  state.pendingExperienceReward = { message: "80 경험치", pokemon: rewardedPokemon };
  state.messageQueue = ["상대 포켓몬은 쓰러졌다!", "80 경험치"];
  state.returnToWorld = { mapKey: "town", x: 656, y: 446, facing: "front" };
  state.result = {
    winnerPlayerId: state.player.playerId,
    loserPlayerId: state.opponent.playerId,
    reason: "faint",
    experienceGained: 80,
    rewardPokeDollars: 50,
  };
  const controller = Object.create(BattleController.prototype) as BattleController;
  const fields = {
    gameStateStore: {
      ...store,
      getState: () => ({
        ...store.getState(),
        round: { ...store.getState().round, phase: "tournament" as const },
      }),
    },
    sceneLifecycleActive: true,
    sceneGeneration: 1,
    competitivePreemptionQueued: false,
    authoritativeProjection: null,
    messageAutoAdvanceTimer: null,
    options: { onReturnToWorld: () => {} },
    ownerDocument: { dispatchEvent: () => true },
    runtimeAssets: { json: new Map() },
    pendingMoveLearnings: [],
    state,
  };
  for (const [key, value] of Object.entries(fields)) Reflect.set(controller, key, value);
  const preempt = Reflect.get(controller, "preemptLocalBattleForTournament") as (
    now: number,
  ) => boolean;
  assert.equal(preempt.call(controller, 1000), true);
  assert.equal(preempt.call(controller, 1000), true);
  await Promise.resolve();
  const after = store.getCurrentLocalPlayer();
  assert.equal(after.wallet.pokeDollars, before.wallet.pokeDollars + 50);
  assert.equal(after.party[0].pokemon?.experience, rewardedPokemon.experience);
  assert.equal(after.party[0].pokemon?.currentHp, after.party[0].pokemon?.maxHp);
});

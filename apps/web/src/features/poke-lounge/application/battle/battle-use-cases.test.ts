import { createSampleBattleState } from "@/components/poke-lounge/runtime/game/battle/battle-sample-state";
import { createGameStateStore } from "@/components/poke-lounge/runtime/game/state/game-state-store";
import { loadPublicRuntimeGameDataFixture } from "@/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { isBattleParticipantDefeated } from "../../domain/battle/party-defeat";
import { freeze } from "../../testing/freeze";
import { toPlayerPokemon } from "./battle-world-persistence";
import { executeBattleChoice } from "./execute-battle-choice";
import { settleBattleToWorld } from "./settle-battle";
test.before(loadPublicRuntimeGameDataFixture);
function fixture() {
  const store = createGameStateStore();
  const state = createSampleBattleState();
  state.player.playerId = store.getState().currentPlayerId;
  state.battleKind = "wild";
  state.phase = "ended";
  state.returnToWorld = { mapKey: "town", x: 700, y: 400, facing: "front" };
  store.setStarterPokemon(toPlayerPokemon(state.player.pokemon));
  state.result = {
    winnerPlayerId: state.player.playerId,
    loserPlayerId: state.opponent.playerId,
    reason: "faint",
    rewardPokeDollars: 50,
  };
  return { store, state };
}
const options = {
  completedCompetitiveBattle: false,
  authoritative: false,
  persistPosition: true,
  soloChallenge: false,
  recoveryPosition: { mapKey: "town", x: 640, y: 280, facing: "front" as const },
  nowMs: 1000,
};
test("전투 종료 서비스는 UI 없이 보상·파티·복귀 위치를 반영한다", () => {
  const { store, state } = fixture();
  const before = store.getCurrentLocalPlayer().wallet.pokeDollars;
  state.player.pokemon.currentHp = 3;
  const result = settleBattleToWorld({ ...options, store, state });
  assert.equal(store.getCurrentLocalPlayer().wallet.pokeDollars, before + 50);
  assert.equal(store.getCurrentLocalPlayer().party[0]!.pokemon!.currentHp, 3);
  assert.deepEqual(result.destination, state.returnToWorld);
});
test("전원 전투불능일 때만 회복 지점으로 복귀한다", () => {
  const { store, state } = fixture();
  state.player.pokemon.currentHp = 0;
  for (const slot of state.player.party) if (slot.pokemon) slot.pokemon.currentHp = 0;
  state.result = {
    winnerPlayerId: state.opponent.playerId,
    loserPlayerId: state.player.playerId,
    reason: "faint",
  };
  assert.equal(isBattleParticipantDefeated(state.player), true);
  assert.deepEqual(
    settleBattleToWorld({ ...options, store, state }).destination,
    options.recoveryPosition,
  );
});
test("서버 토너먼트 종료는 개인 필드 파티 HP를 PvP 피해로 덮지 않는다", () => {
  const { store, state } = fixture();
  const before = store.getCurrentLocalPlayer().party[0]!.pokemon!.currentHp;
  state.player.pokemon.currentHp = 1;
  settleBattleToWorld({
    ...options,
    store,
    state,
    completedCompetitiveBattle: true,
    authoritative: true,
    persistPosition: false,
  });
  assert.equal(store.getCurrentLocalPlayer().party[0]!.pokemon!.currentHp, before);
});
test("포획 정산은 가득 찬 파티 대신 박스를 사용하고 안내는 데이터로 반환한다", () => {
  const { store, state } = fixture();
  const local = store.getCurrentLocalPlayer();
  store.upsertLocalPlayer({
    ...local,
    party: Array.from({ length: 6 }, (_, slotIndex) => ({
      slotIndex,
      pokemon: toPlayerPokemon(state.player.pokemon),
    })),
  });
  state.result = {
    winnerPlayerId: state.player.playerId,
    loserPlayerId: state.opponent.playerId,
    reason: "capture",
    capturedPokemon: state.opponent.pokemon,
  };
  const result = settleBattleToWorld({ ...options, store, state });
  assert.equal(store.getCurrentLocalPlayer().pokemonBox.length, 1);
  assert.equal(result.boxedPokemon?.speciesId, state.opponent.pokemon.speciesId);
});
test("명령 선택은 상태를 불변으로 반환하고 가방 열기만으로 아이템을 소비하지 않는다", () => {
  const { store, state } = fixture();
  state.phase = "command";
  state.result = null;
  state.messageQueue = [];
  const original = structuredClone(state);
  freeze(state);
  const result = executeBattleChoice(state, { kind: "command", command: "bag" }, store);
  assert.equal(result.state.phase, "bag-select");
  assert.deepEqual(state, original);
  assert.equal(store.getCurrentLocalPlayer().inventory.potion, 5);
});

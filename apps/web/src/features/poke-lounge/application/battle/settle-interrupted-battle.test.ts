import assert from "node:assert/strict";
import test from "node:test";
import { createSampleBattleState } from "@/components/poke-lounge/runtime/game/battle/battle-sample-state";
import { loadPublicRuntimeGameDataFixture } from "@/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import { freeze } from "../../testing/freeze";
import { materializeResolvedWildBattleReward } from "./settle-interrupted-battle";
test.before(loadPublicRuntimeGameDataFixture);

function won() {
  const state = createSampleBattleState();
  state.battleKind = "wild";
  state.phase = "ended";
  const member = { ...state.player.pokemon, experience: state.player.pokemon.experience + 80 };
  const reserve = { ...state.opponent.pokemon, experience: state.opponent.pokemon.experience + 40 };
  state.pendingExperienceReward = {
    message: "계산된 경험치",
    pokemon: member,
    party: [
      { slotIndex: 0, pokemon: member },
      { slotIndex: 1, pokemon: reserve },
    ],
  };
  state.result = {
    reason: "faint",
    winnerPlayerId: state.player.playerId,
    loserPlayerId: state.opponent.playerId,
    experienceGained: 80,
    rewardPokeDollars: 50,
  };
  return state;
}
test("이미 계산된 선두·예비 경험치를 적용하고 액션·메시지·PP를 재실행하지 않는다", () => {
  const state = won();
  const before = structuredClone(state);
  freeze(state);
  const after = materializeResolvedWildBattleReward(state);
  assert.deepEqual(state, before);
  assert.deepEqual(after.messageQueue, before.messageQueue);
  assert.equal(after.turn, state.turn);
  assert.deepEqual(after.player.pokemon.moves, state.player.pokemon.moves);
  assert.equal(after.player.pokemon.experience, state.pendingExperienceReward!.pokemon.experience);
  assert.deepEqual(after.player.party, state.pendingExperienceReward!.party);
  assert.equal(after.pendingExperienceReward, null);
  assert.equal(materializeResolvedWildBattleReward(after), after);
});
test("미확정·패배·트레이너전에는 경험치 정산을 만들어 내지 않는다", () => {
  const state = won();
  const cases = [
    { ...state, result: null },
    { ...state, battleKind: "trainer" as const },
    { ...state, result: { ...state.result!, winnerPlayerId: state.opponent.playerId } },
    { ...state, result: { ...state.result!, reason: "capture" as const } },
  ];
  for (const candidate of cases)
    assert.equal(materializeResolvedWildBattleReward(candidate), candidate);
});

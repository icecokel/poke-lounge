import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { createSampleBattleState } from "./battle-sample-state";
import {
  getAuthoritativeHpLossTargets,
  getPreviousCombatantPokemon,
} from "./authoritative-hp-feedback";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

test("서버 전투는 양쪽 피해를 표시하고 재전송·회복에는 타격을 재생하지 않는다", () => {
  const before = createSampleBattleState();
  const after = structuredClone(before);
  after.player.pokemon.currentHp -= 1;
  after.opponent.pokemon.currentHp -= 1;
  for (const side of ["player", "opponent"] as const) {
    after[side].party = after[side].party.map(slot =>
      slot.slotIndex === after[side].activePartySlotIndex
        ? { ...slot, pokemon: after[side].pokemon }
        : slot,
    );
  }
  assert.deepEqual(getAuthoritativeHpLossTargets(before, after), ["player", "opponent"]);
  assert.deepEqual(getAuthoritativeHpLossTargets(after, after), []);
  assert.deepEqual(getAuthoritativeHpLossTargets(after, before), []);
  assert.deepEqual(
    getAuthoritativeHpLossTargets(before, { ...after, tournamentMatchId: "new-match" }),
    [],
  );
});

test("다친 포켓몬으로 교체만 하면 타격 없이 표시하고, 교체 후 맞은 피해만 재생한다", () => {
  const before = createSampleBattleState();
  const reserve = { ...structuredClone(before.player.pokemon), currentHp: 5 };
  before.player.party = [
    { slotIndex: 0, pokemon: before.player.pokemon },
    { slotIndex: 1, pokemon: reserve },
  ];
  before.player.activePartySlotIndex = 0;
  const after = structuredClone(before);
  after.player.activePartySlotIndex = 1;
  after.player.pokemon = structuredClone(reserve);
  assert.equal(getPreviousCombatantPokemon(before, after, "player")?.currentHp, 5);
  assert.deepEqual(getAuthoritativeHpLossTargets(before, after), []);
  after.player.pokemon.currentHp = 3;
  assert.deepEqual(getAuthoritativeHpLossTargets(before, after), ["player"]);
});

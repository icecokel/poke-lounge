import { applyInventoryItemEffect } from "../items/inventory-item-effects";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRuntimeGameDataJsonFixture } from "../testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { COMPETITIVE_MOVE_CATALOG } from "@poke-lounge/battle/competitive-catalog.generated";
import { GEN4_ROM_MOVE_NAMES } from "@poke-lounge/battle/gen4/rom-catalog.generated";
import {
  initializeGen4Adventure,
  restoreGen4FieldPokemon,
} from "@poke-lounge/battle/gen4/adventure";
import { createSampleBattleState } from "./battle-sample-state";
import {
  choosePlayerMove,
  choosePartySlot,
  chooseBattleBagItem,
  chooseBattleCommand,
  popBattleMessage,
  isForcedPartySwitch,
} from "./battle-logic";
import { toPlayerPokemon } from "./battle-world-persistence";
import type { BattleMove, BattlePokemon, BattleScreenState } from "./battle-types";

const root = fileURLToPath(new URL("../../../../../../public/", import.meta.url));
test.before(() =>
  loadRuntimeGameDataJsonFixture(async input => {
    const path =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    return new Response(fs.readFileSync(root + path.replace(/^\//, ""), "utf8"), {
      headers: { "Content-Type": "application/json" },
    });
  }),
);
test.after(resetRuntimeGameDataJsonStateForTest);
function move(id: number): BattleMove {
  const m = COMPETITIVE_MOVE_CATALOG[id]!;
  return {
    id,
    name: GEN4_ROM_MOVE_NAMES[id]!,
    pp: m.maxPp,
    maxPp: m.maxPp,
    type: "",
    typeId: m.typeId,
    category: m.category,
    effectCode: m.effectCode,
    effectChance: m.effectChance,
    priority: m.priority,
    power: m.power,
    accuracy: m.accuracy,
  };
}
function start(
  own: number[],
  foe: number[] = [150],
  ownPatch: Partial<BattlePokemon> = {},
  foePatch: Partial<BattlePokemon> = {},
): BattleScreenState {
  const state = createSampleBattleState();
  const player = {
    ...state.player.pokemon,
    level: 50,
    maxHp: 1000,
    currentHp: 1000,
    speed: 150,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    moves: own.map(move),
    ...ownPatch,
  };
  const opponent = {
    ...state.opponent.pokemon,
    level: 50,
    maxHp: 1000,
    currentHp: 1000,
    speed: 50,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    moves: foe.map(move),
    ...foePatch,
  };
  const reserve = { ...player, name: "예비 치코리타", moves: [move(150)], currentHp: 100 };
  return drain(
    initializeGen4Adventure(
      {
        ...state,
        battleKind: "wild",
        messageQueue: [],
        player: {
          ...state.player,
          pokemon: player,
          party: [
            { slotIndex: 0, pokemon: player },
            { slotIndex: 2, pokemon: reserve },
          ],
          activePartySlotIndex: 0,
        },
        opponent: {
          ...state.opponent,
          pokemon: opponent,
          party: [{ slotIndex: 0, pokemon: opponent }],
          activePartySlotIndex: 0,
        },
      },
      () => 0.371,
    ),
  );
}
function drain(input: BattleScreenState): BattleScreenState {
  let s = input;
  for (
    let i = 0;
    i < 128 &&
    s.messageQueue.length &&
    s.messageQueue[0] !== "전투를 마쳤다. 확인하면 필드로 돌아갑니다.";
    i++
  ) {
    const n = popBattleMessage(s);
    if (n === s) break;
    s = n;
  }
  return s;
}
function attack(s: BattleScreenState, index = 0): BattleScreenState {
  return choosePlayerMove({ ...s, phase: "move-select" }, index, { random: () => 0.371 });
}

test("라이브 가방은 대상 선택 전 소비하지 않으며 대기 팀원만 회복한다", () => {
  const before = start([150]);
  const chosen = chooseBattleBagItem({ ...before, phase: "bag-select" }, "potion", {
    itemCount: 1,
  });
  assert.equal(chosen.pendingBattleItemId, "potion");
  assert.equal(chosen.phase, "party-select");
  assert.equal(chosen.usedInventoryItemId, null);
  assert.equal(chosen.turn, before.turn);
  const after = choosePartySlot(chosen, 2);
  assert.equal(after.usedInventoryItemId, "potion");
  assert.equal(after.player.party[1]!.pokemon!.currentHp, 120);
  assert.equal(after.player.pokemon.currentHp, 1000);
  assert.equal(after.player.activePartySlotIndex, 0);
  assert.ok(after.messageHpSnapshots?.every(s => s.playerCurrentHp === 1000));
});
test("도구 대상 선택에서 전투불능 팀원을 부활시킬 수 있다", () => {
  const seed = start([150]);
  const reserve = { ...seed.player.party[1]!.pokemon!, currentHp: 0, status: "fainted" as const };
  const before = initializeGen4Adventure(
    {
      ...seed,
      gen4Session: undefined,
      player: {
        ...seed.player,
        party: [seed.player.party[0]!, { slotIndex: 2, pokemon: reserve }],
      },
    },
    () => 0.371,
  );
  const chosen = chooseBattleBagItem({ ...before, phase: "bag-select" }, "revive", {
    itemCount: 1,
  });
  const after = choosePartySlot(chosen, 2);
  assert.equal(after.player.party[1]!.pokemon!.currentHp, 500);
  assert.equal(after.usedInventoryItemId, "revive");
  assert.equal(after.player.activePartySlotIndex, 0);
});
test("공중날기는 첫 턴 피해 없이 다음 턴 이어가며 가방으로 취소되지 않는다", () => {
  const before = start([19]);
  const charging = attack(before);
  assert.equal(charging.opponent.pokemon.currentHp, before.opponent.pokemon.currentHp);
  assert.equal(charging.gen4Requests?.[0].forcedMoveId, 19);
  const after = chooseBattleCommand(drain(charging), "bag");
  assert.equal(after.phase, "resolving");
  assert.ok(after.opponent.pokemon.currentHp < 1000);
  assert.equal(after.player.pokemon.moves[0]!.pp, before.player.pokemon.moves[0]!.pp - 1);
});
test("유턴은 살아 있는 선두도 교체를 요구하고 이미 선택된 공격만 다음 포켓몬이 받는다", () => {
  const hit = attack(start([369], [33]));
  assert.equal(hit.gen4Requests?.[0].kind, "switch");
  assert.ok(isForcedPartySwitch(hit));
  assert.ok(hit.player.pokemon.currentHp > 0);
  const after = choosePartySlot(drain(hit), 2);
  assert.equal(after.player.activePartySlotIndex, 2);
  assert.ok(after.player.pokemon.currentHp < 100);
  assert.equal(after.opponent.pokemon.moves[0]!.pp, COMPETITIVE_MOVE_CATALOG[33]!.maxPp - 1);
  const first = after.messageHpSnapshots?.[0];
  assert.equal(first?.playerPartySlotIndex, 2);
});
test("자폭으로 양쪽 전멸한 야생 전투를 자동 회복·재경기로 바꾸지 않는다", () => {
  const seed = start([120], [150], { currentHp: 1, attack: 999 }, { currentHp: 1 });
  const before = initializeGen4Adventure(
    { ...seed, gen4Session: undefined, player: { ...seed.player, party: [seed.player.party[0]!] } },
    () => 0.371,
  );
  const after = attack(drain(before));
  assert.equal(after.phase, "ended");
  assert.equal(after.player.pokemon.currentHp, 0);
  assert.equal(after.result?.loserPlayerId, after.player.playerId);
  assert.equal(after.result?.rewardPokeDollars, undefined);
});
test("실패한 포획은 볼 1개와 상대 행동 1회만 소비하며 기술 PP를 소비하지 않는다", () => {
  const before = start([150]);
  const after = chooseBattleBagItem({ ...before, phase: "bag-select" }, "pokeball", {
    itemCount: 1,
    captureRandom16: () => 65535,
  });
  assert.equal(after.usedInventoryItemId, "pokeball");
  assert.equal(after.result, null);
  assert.equal(after.player.pokemon.moves[0]!.pp, before.player.pokemon.moves[0]!.pp);
  assert.equal(after.opponent.pokemon.moves[0]!.pp, before.opponent.pokemon.moves[0]!.pp - 1);
  assert.equal(after.messageQueue.length, after.messageHpSnapshots?.length);
  assert.match(after.messageQueue[0]!, /던졌다/);
});
test("순간이동은 야생 전투만 종료하고 트레이너 전투에서는 실패한다", () => {
  const wild = attack(start([100]));
  assert.equal(wild.result?.reason, "run");
  assert.equal(wild.result?.rewardPokeDollars, undefined);
  const seed = start([100]);
  const trainer = initializeGen4Adventure(
    { ...seed, battleKind: "trainer", gen4Session: undefined },
    () => 0.371,
  );
  const after = attack(drain(trainer));
  assert.equal(after.result, null);
  assert.notEqual(after.phase, "ended");
});
test("필드 복귀 시 변신 기술을 원래대로 복원하고 경험치·노력치·새 레벨은 보존한다", () => {
  const before = start([144]);
  const transformed = attack(before);
  assert.equal(transformed.player.pokemon.moves[0]!.id, 150);
  const restored = restoreGen4FieldPokemon(transformed, 0);
  assert.equal(restored.moves[0]!.id, 144);
  assert.equal(restored.moves[0]!.pp, 9);
  const grown = {
    ...transformed,
    player: {
      ...transformed.player,
      pokemon: { ...transformed.player.pokemon, level: 51, experience: 77777, currentHp: 999 },
    },
  };
  assert.equal(restoreGen4FieldPokemon(grown, 0).experience, 77777);
  assert.equal(restoreGen4FieldPokemon(grown, 0).level, 51);
  assert.equal(restoreGen4FieldPokemon(grown, 0).currentHp, 999);
  const saved = toPlayerPokemon({
    ...restored,
    natureId: 3,
    effortValues: { hp: 1, attack: 2, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 },
    status: "asleep",
    statusTurns: 2,
  });
  assert.equal(saved.natureId, 3);
  assert.equal(saved.effortValues?.attack, 2);
  assert.equal(saved.statusTurns, 2);
  assert.equal(saved.status, "asleep");
});

test("필드에 저장한 맹독도 해독제로 치료된다", () => {
  const result = applyInventoryItemEffect("antidote", {
    name: "치코리타",
    currentHp: 20,
    maxHp: 30,
    status: "badlyPoisoned",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pokemon.status, "normal");
});

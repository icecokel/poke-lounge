import assert from "node:assert/strict";
import test from "node:test";
import { createSampleBattleState } from "@/components/poke-lounge/runtime/game/battle/battle-sample-state";
import { loadPublicRuntimeGameDataFixture } from "@/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "@/components/poke-lounge/runtime/game/data/game-data-json";
import type { BattlePokemonStatus } from "@poke-lounge/battle/adventure/battle/battle-types";
import { createOpponentPartySummary, getOpponentPartyCopy } from "./opponent-party";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

function fixture(size = 4) {
  const opponent = createSampleBattleState().opponent;
  opponent.party = Array.from({ length: 6 }, (_, slotIndex) => ({
    slotIndex,
    pokemon:
      slotIndex < size
        ? { ...opponent.pokemon, currentHp: 30, maxHp: 40, status: "normal" as const }
        : null,
  }));
  return {
    battleKind: "trainer" as const,
    opponent,
    visibleSlotIndex: 0,
    displayedHp: 30,
    displayedStatus: "normal" as BattlePokemonStatus,
  };
}

test("파티 4마리면 현재 출전 포함 4/4, 빈 슬롯은 표시하지 않는다", () => {
  const summary = createOpponentPartySummary(fixture())!;
  assert.equal(summary.total, 4);
  assert.equal(summary.remaining, 4);
  assert.deepEqual(
    summary.slots.filter(s => s.active).map(s => s.slotIndex),
    [0],
  );
});

for (const size of [1, 2, 3, 5, 6]) {
  test(`실제 참가 파티 ${size}마리만 표시한다`, () => {
    const summary = createOpponentPartySummary(fixture(size))!;
    assert.equal(summary.total, size);
    assert.equal(summary.remaining, size);
    assert.equal(summary.slots.length, size);
  });
}

test("기절해도 아이콘·슬롯 순서·전체 수가 유지된다", () => {
  const f = fixture();
  f.opponent.party[0].pokemon!.currentHp = 0;
  f.opponent.party[0].pokemon!.status = "fainted";
  const summary = createOpponentPartySummary({ ...f, displayedHp: 0, displayedStatus: "fainted" })!;
  assert.equal(summary.remaining, 3);
  assert.equal(summary.total, 4);
  assert.deepEqual(
    summary.slots.map(s => s.slotIndex),
    [0, 1, 2, 3],
  );
  assert.deepEqual(summary.slots[0], { slotIndex: 0, fainted: true, active: false });
});

test("서버에서 기절 확정돼도 화면 HP가 내려가는 동안 잔여 수를 미리 줄이지 않는다", () => {
  const f = fixture();
  f.opponent.party[0].pokemon!.currentHp = 0;
  f.opponent.party[0].pokemon!.status = "fainted";
  for (const displayedHp of [30, 12.8, 0.6]) {
    const summary = createOpponentPartySummary({ ...f, displayedHp })!;
    assert.equal(summary.remaining, 4);
    assert.equal(summary.slots[0].fainted, false);
  }
  assert.equal(createOpponentPartySummary({ ...f, displayedHp: 0.4 })!.remaining, 3);
  assert.equal(
    createOpponentPartySummary({ ...f, displayedHp: 0, displayedStatus: "fainted" })!.remaining,
    3,
  );
});

test("교체는 잔여 수를 줄이지 않고 화면에 나온 슬롯만 강조한다", () => {
  const f = fixture();
  // Local replay may still show the old combatant even after the engine switched.
  f.opponent.activePartySlotIndex = 2;
  assert.equal(createOpponentPartySummary(f)!.slots[0].active, true);
  const switched = createOpponentPartySummary({ ...f, visibleSlotIndex: 2 })!;
  assert.equal(switched.remaining, 4);
  assert.deepEqual(
    switched.slots.filter(s => s.active).map(s => s.slotIndex),
    [2],
  );
});

test("기절 뒤 강제 교체 시 이미 쓰러진 슬롯이 부활하지 않는다", () => {
  const f = fixture();
  f.opponent.party[0].pokemon!.currentHp = 0;
  f.opponent.party[0].pokemon!.status = "fainted";
  const switched = createOpponentPartySummary({ ...f, visibleSlotIndex: 2 })!;
  assert.equal(switched.remaining, 3);
  assert.equal(switched.slots[0].fainted, true);
  assert.equal(switched.slots[2].active, true);
});

test("마비·수면·독·화상·얼음은 전투불능으로 세지 않는다", () => {
  const f = fixture(6);
  const statuses: BattlePokemonStatus[] = [
    "asleep",
    "frozen",
    "poisoned",
    "badlyPoisoned",
    "burned",
    "paralyzed",
  ];
  f.opponent.party.forEach((slot, i) => {
    slot.pokemon!.status = statuses[i];
  });
  const result = createOpponentPartySummary({ ...f, displayedStatus: "asleep" })!;
  assert.equal(result.remaining, 6);
  assert(result.slots.every(s => !s.fainted));
});

test("전멸은 0/N, 0/0을 만들지 않고 야생전·샘플에는 표시하지 않는다", () => {
  const f = fixture();
  f.opponent.party.forEach(slot => {
    if (slot.pokemon) slot.pokemon.currentHp = 0;
  });
  assert.equal(createOpponentPartySummary({ ...f, displayedHp: 0 })!.remaining, 0);
  assert.equal(createOpponentPartySummary(fixture(0)), null);
  assert.equal(createOpponentPartySummary({ ...f, battleKind: "wild" }), null);
  assert.equal(createOpponentPartySummary({ ...f, battleKind: "sample" }), null);
});

test("파티 슬롯의 빈 간격·정렬을 지키며 종족·기술·체력 데이터는 뷰로 노출하지 않는다", () => {
  const f = fixture(6);
  f.opponent.party = [f.opponent.party[5], { slotIndex: 1, pokemon: null }, f.opponent.party[2]];
  const before = structuredClone(f.opponent);
  const result = createOpponentPartySummary({ ...f, visibleSlotIndex: 5 })!;
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.slots.map(s => s.slotIndex),
    [2, 5],
  );
  assert.deepEqual(Object.keys(result.slots[0]).sort(), ["active", "fainted", "slotIndex"]);
  assert.deepEqual(f.opponent, before);
});

test("같은 서버 상태 재수신은 중복 차감 없이 같은 결과다", () => {
  const f = fixture();
  f.opponent.party[2].pokemon!.currentHp = 0;
  const summary = createOpponentPartySummary(f);
  assert.equal(summary!.remaining, 3);
  assert.deepEqual(createOpponentPartySummary(structuredClone(f)), summary);
});

test("새 경기는 이전 경기의 잔여 수를 가져오지 않는다", () => {
  const f = fixture(6);
  f.opponent.party.forEach(s => {
    s.pokemon!.currentHp = 0;
  });
  assert.equal(createOpponentPartySummary({ ...f, displayedHp: 0 })!.remaining, 0);
  const fresh = createOpponentPartySummary(fixture(2))!;
  assert.equal(fresh.remaining, 2);
  assert.equal(fresh.total, 2);
});

test("세 언어의 접근성 문구가 현재 출전 포함 의미를 제공한다", () => {
  const summary = createOpponentPartySummary(fixture())!;
  assert.match(getOpponentPartyCopy("ko-KR", summary).label, /4마리 중 4마리.*현재 출전/);
  assert.match(getOpponentPartyCopy("en-US", summary).label, /4 of 4.*including the active/);
  assert.match(getOpponentPartyCopy("ja-JP", summary).label, /4匹中4匹.*含みます/);
});

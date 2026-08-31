import assert from "node:assert/strict";
import test from "node:test";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { createSampleBattleState } from "./battleSampleState";
import { BATTLE_LAYOUT } from "./battleLayout";
import {
  createBattlePartySlotViews,
  formatBattlePartyPokemonName,
  getFirstSwitchableBattlePartySlotIndex,
  getBattlePartySlotIndexAtPoint,
  moveBattlePartySelection,
  resolveBattlePartySlotRects,
  type BattlePartySelectionDirection,
} from "./battle-party-select";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

test("HGSS 파티 트레이는 여섯 슬롯의 선택·출전·기절·빈 상태를 만든다", () => {
  const state = createSampleBattleState();
  const currentPokemon = structuredClone(state.player.pokemon);
  const reservePokemon = structuredClone(state.opponent.pokemon);
  const faintedPokemon = {
    ...structuredClone(state.opponent.pokemon),
    currentHp: 0,
    status: "fainted" as const,
  };
  const poisonedPokemon = {
    ...structuredClone(state.opponent.pokemon),
    status: "poisoned" as const,
  };
  const views = createBattlePartySlotViews({
    activePartySlotIndex: 0,
    panel: BATTLE_LAYOUT.partyWindow,
    party: [
      { slotIndex: 0, pokemon: currentPokemon },
      { slotIndex: 1, pokemon: reservePokemon },
      { slotIndex: 2, pokemon: faintedPokemon },
      { slotIndex: 3, pokemon: null },
      { slotIndex: 4, pokemon: poisonedPokemon },
      { slotIndex: 5, pokemon: null },
    ],
    selectedPartySlotIndex: 2,
  });

  assert.deepEqual(
    views.map(view => view.slotIndex),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    views.map(view => ({
      canSwitch: view.canSwitch,
      current: view.isCurrent,
      empty: view.isEmpty,
      fainted: view.isFainted,
      selected: view.isSelected,
      statusLabel: view.statusLabel,
    })),
    [
      {
        canSwitch: false,
        current: true,
        empty: false,
        fainted: false,
        selected: false,
        statusLabel: "전투 중",
      },
      {
        canSwitch: true,
        current: false,
        empty: false,
        fainted: false,
        selected: false,
        statusLabel: null,
      },
      {
        canSwitch: false,
        current: false,
        empty: false,
        fainted: true,
        selected: true,
        statusLabel: "전투불능",
      },
      {
        canSwitch: false,
        current: false,
        empty: true,
        fainted: false,
        selected: false,
        statusLabel: null,
      },
      {
        canSwitch: true,
        current: false,
        empty: false,
        fainted: false,
        selected: false,
        statusLabel: "독",
      },
      {
        canSwitch: false,
        current: false,
        empty: true,
        fainted: false,
        selected: false,
        statusLabel: null,
      },
    ],
  );
  assert.equal(views[0]?.hpRatio, currentPokemon.currentHp / currentPokemon.maxHp);
  assert.equal(views[2]?.hpRatio, 0);
});

test("HGSS 파티 트레이 슬롯은 3열 2행 좌표와 포인터 hit-test를 공유한다", () => {
  const rects = resolveBattlePartySlotRects(BATTLE_LAYOUT.partyWindow);

  assert.deepEqual(rects, [
    { x: 4, y: 150, width: 80, height: 18 },
    { x: 88, y: 150, width: 80, height: 18 },
    { x: 172, y: 150, width: 80, height: 18 },
    { x: 4, y: 171, width: 80, height: 18 },
    { x: 88, y: 171, width: 80, height: 18 },
    { x: 172, y: 171, width: 80, height: 18 },
  ]);

  rects.forEach((rect, slotIndex) => {
    assert.equal(
      getBattlePartySlotIndexAtPoint(
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        BATTLE_LAYOUT.partyWindow,
      ),
      slotIndex,
    );
  });
  assert.equal(getBattlePartySlotIndexAtPoint({ x: 86, y: 156 }, BATTLE_LAYOUT.partyWindow), null);
  assert.equal(getBattlePartySlotIndexAtPoint({ x: 120, y: 145 }, BATTLE_LAYOUT.partyWindow), null);
  assert.equal(getBattlePartySlotIndexAtPoint({ x: 255, y: 191 }, BATTLE_LAYOUT.partyWindow), null);
});

test("HGSS 파티 트레이 방향 이동은 행과 열 경계에서 멈춘다", () => {
  const expectedByIndex: Array<Record<BattlePartySelectionDirection, number>> = [
    { left: 0, right: 1, up: 0, down: 3 },
    { left: 0, right: 2, up: 1, down: 4 },
    { left: 1, right: 2, up: 2, down: 5 },
    { left: 3, right: 4, up: 0, down: 3 },
    { left: 3, right: 5, up: 1, down: 4 },
    { left: 4, right: 5, up: 2, down: 5 },
  ];

  expectedByIndex.forEach((expected, slotIndex) => {
    for (const direction of ["left", "right", "up", "down"] as const) {
      assert.equal(moveBattlePartySelection(slotIndex, direction), expected[direction]);
    }
  });
});

test("HGSS 파티 트레이는 교체 가능한 첫 후보를 기본 선택한다", () => {
  const state = createSampleBattleState();
  const activePokemon = structuredClone(state.player.pokemon);
  const faintedPokemon = {
    ...structuredClone(state.opponent.pokemon),
    currentHp: 0,
    status: "fainted" as const,
  };
  const reservePokemon = structuredClone(state.opponent.pokemon);

  assert.equal(
    getFirstSwitchableBattlePartySlotIndex(
      [
        { slotIndex: 0, pokemon: activePokemon },
        { slotIndex: 1, pokemon: null },
        { slotIndex: 2, pokemon: faintedPokemon },
        { slotIndex: 3, pokemon: reservePokemon },
      ],
      0,
    ),
    3,
  );
  assert.equal(
    getFirstSwitchableBattlePartySlotIndex(
      [
        { slotIndex: 0, pokemon: activePokemon },
        { slotIndex: 1, pokemon: null },
        { slotIndex: 2, pokemon: faintedPokemon },
      ],
      0,
    ),
    0,
  );
});

test("HGSS 파티 카드 이름은 여섯 글자를 넘으면 말줄임한다", () => {
  assert.equal(formatBattlePartyPokemonName("가나다라마바"), "가나다라마바");
  assert.equal(formatBattlePartyPokemonName("가나다라마바사"), "가나다라마…");
});

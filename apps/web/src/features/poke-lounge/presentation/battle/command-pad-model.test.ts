import assert from "node:assert/strict";
import test from "node:test";
import type { MobileBattlePartyOption } from "../../contracts/battle-controls";
import { getBattlePadCommands, getBattlePadParty } from "./command-pad-model";

function pokemon(
  slotIndex: number,
  overrides: Partial<MobileBattlePartyOption> = {},
): MobileBattlePartyOption {
  return {
    slotIndex,
    name: `Pokemon ${slotIndex}`,
    level: 5,
    currentHp: 20,
    maxHp: 20,
    status: "normal",
    selected: false,
    isCurrent: false,
    isFainted: false,
    isEmpty: false,
    canSwitch: true,
    sprite: null,
    ...overrides,
  };
}

test("HeartGold visual order keeps the original runtime action indexes and selection", () => {
  const commands = [
    { id: "fight", selected: false },
    { id: "bag", selected: false },
    { id: "pokemon", selected: true },
    { id: "run", selected: false },
  ] as const;
  assert.deepEqual(
    getBattlePadCommands(commands).map(({ id, index, selected }) => [id, index, selected]),
    [
      ["fight", 0, false],
      ["bag", 1, false],
      ["run", 3, false],
      ["pokemon", 2, true],
    ],
  );
  assert.equal(commands[2].id, "pokemon");
});

test("reordered or missing runtime commands never dispatch their visual position", () => {
  assert.deepEqual(
    getBattlePadCommands([
      { id: "pokemon", selected: false },
      { id: "fight", selected: true },
    ]).map(({ id, index }) => [id, index]),
    [
      ["fight", 1],
      ["pokemon", 0],
    ],
  );
});

test("six party balls preserve sparse slot indexes and the actual active Pokemon", () => {
  const slots = getBattlePadParty([pokemon(4), pokemon(1, { isCurrent: true })]);
  assert.equal(slots.length, 6);
  assert.deepEqual(
    slots.map(slot => slot.status),
    ["empty", "ready", "empty", "empty", "ready", "empty"],
  );
  assert.equal(slots[1].pokemon?.isCurrent, true);
  assert.equal(slots[0].pokemon, null);
});

test("fainted and zero-HP Pokemon are distinct from empty party slots", () => {
  const slots = getBattlePadParty([
    pokemon(0, { isFainted: true }),
    pokemon(1, { currentHp: 0 }),
    pokemon(2, { isEmpty: true }),
    pokemon(3),
  ]);
  assert.deepEqual(
    slots.map(slot => slot.status),
    ["fainted", "fainted", "empty", "ready", "empty", "empty"],
  );
  assert.equal(slots[2].pokemon, null);
});

test("an empty party does not invent six available Pokemon", () => {
  assert.ok(getBattlePadParty([]).every(slot => slot.status === "empty" && slot.pokemon === null));
});

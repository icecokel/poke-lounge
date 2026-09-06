import { findBattleReadyPartySlot, isPartyPokemonBattleReady } from "./battle-ready-party";

describe("battle-ready party selection", () => {
  it("keeps a healthy preferred member without moving slots", () => {
    const party = [
      { slotIndex: 0, pokemon: { currentHp: 12 } },
      { slotIndex: 4, pokemon: { currentHp: 1 } },
    ];
    expect(findBattleReadyPartySlot(party, 4)).toBe(party[1]);
  });
  it("uses a living reserve even when the lead is fainted and slots are sparse", () => {
    const party = [
      { slotIndex: 0, pokemon: { currentHp: 0, status: "fainted" } },
      { slotIndex: 2, pokemon: null },
      { slotIndex: 5, pokemon: { currentHp: 2, status: "poisoned" } },
    ];
    const before = structuredClone(party);
    expect(findBattleReadyPartySlot(party, 0)?.slotIndex).toBe(5);
    expect(party).toEqual(before);
  });
  it("never treats an empty, all-fainted, invalid HP or stale-fainted party as alive", () => {
    expect(findBattleReadyPartySlot([], 0)).toBeNull();
    for (const pokemon of [
      null,
      { currentHp: 0 },
      { currentHp: -1 },
      { currentHp: NaN },
      { currentHp: Infinity },
      { currentHp: 10, status: "fainted" },
    ]) {
      expect(isPartyPokemonBattleReady(pokemon)).toBe(false);
      expect(findBattleReadyPartySlot([{ slotIndex: 0, pokemon }], 0)).toBeNull();
    }
  });
  it("supports legacy saves with HP initialized from ROM at battle entry", () => {
    expect(isPartyPokemonBattleReady({ status: "normal" })).toBe(true);
  });
});

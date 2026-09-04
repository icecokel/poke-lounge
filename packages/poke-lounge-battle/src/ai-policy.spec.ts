import {
  appendAiCapturedPokemon,
  chooseAiCompetitiveAction,
  createAiStarterParty,
} from "./ai-policy";

describe("AI battle policy", function testSuite() {
  it("creates a valid starter, captures into the next slot, and switches after fainting", function testCase() {
    const starter = createAiStarterParty(function random() {
      return 0;
    });
    const party = appendAiCapturedPokemon(starter, 25, 8);
    const [active, replacement] = party.members;

    expect(starter.members[0]?.speciesId).toBe(152);
    expect(party.members).toHaveLength(2);
    expect(replacement).toMatchObject({ slotIndex: 1, speciesId: 25, level: 8 });
    expect(
      chooseAiCompetitiveAction(
        {
          playersById: {
            ai: {
              activeSlotIndex: 0,
              team: [{ ...active!, currentHp: 0 }, replacement!],
            },
          },
        },
        "ai",
      ),
    ).toEqual({ kind: "switch", slotIndex: 1 });
  });

  it("values Dragon Rage as fixed 40 damage", function testCase() {
    expect(
      chooseAiCompetitiveAction(
        {
          playersById: {
            ai: {
              activeSlotIndex: 0,
              team: [
                {
                  slotIndex: 0,
                  speciesId: 7,
                  maxHp: 100,
                  currentHp: 100,
                  moves: [
                    { moveId: 33, pp: 35 },
                    { moveId: 82, pp: 10 },
                  ],
                },
              ],
            },
          },
        },
        "ai",
      ),
    ).toEqual({ kind: "move", moveId: 82 });
  });
});

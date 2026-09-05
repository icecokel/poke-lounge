import { chooseAiCompetitiveAction, createAiStarterParty } from "./ai-policy";

describe("AI battle policy", function testSuite() {
  it("rolls player-equivalent starter IVs and switches after fainting", function testCase() {
    const starter = createAiStarterParty(function random() {
      return 0;
    });
    const active = starter.members[0]!;
    const replacement = { ...createAiStarterParty(() => 0.9).members[0]!, slotIndex: 1 };

    expect(starter.members[0]?.speciesId).toBe(152);
    expect(active.individualValues.hp).toBe(0);
    expect(replacement.individualValues.hp).toBe(28);
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

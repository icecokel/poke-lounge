import { chooseAiCompetitiveAction, createAiStarterParty, estimateAiMoveDamage } from "./ai-policy";
import { createDefaultBattleStatStages } from "./battle-stat-stages";
import { COMPETITIVE_SPECIES_CATALOG } from "./competitive-catalog.generated";
import type { CanonicalCombatantState } from "./canonical-state";
import type { Gen4ActionRequest } from "./gen4/types";

describe("AI battle policy", function testSuite() {
  it("keeps player-equivalent starter IVs", function testCase() {
    expect(createAiStarterParty(() => 0).members[0]).toMatchObject({
      speciesId: 152,
      individualValues: { hp: 0 },
    });
    expect(createAiStarterParty(() => 0.9).members[0]?.individualValues.hp).toBe(28);
  });

  it("uses matchup, damage category, fixed damage, and accuracy rather than power alone", function testCase() {
    const cases = [
      // Water Gun beats a stronger resisted Ember against Geodude.
      [pokemon(4, [52, 55]), pokemon(74, [33]), 55],
      // Electric and Ground immunity, including fixed Normal damage (Sonic Boom).
      [pokemon(25, [85, 33]), pokemon(50, [33]), 33],
      [pokemon(74, [89, 33]), pokemon(16, [33]), 33],
      [pokemon(7, [49, 55]), pokemon(92, [33]), 55],
      [pokemon(7, [33, 82], { level: 10 }), pokemon(7, [33]), 82],
      [pokemon(7, [33, 55], { attack: 200, specialAttack: 20 }), pokemon(7, [33]), 33],
      // Both attacks KO: prefer accurate Surf over Hydro Pump.
      [pokemon(7, [56, 57]), pokemon(4, [33], { currentHp: 1 }), 57],
    ] as const;
    for (const [active, target, moveId] of cases)
      expect(choose([active], target)).toEqual({ kind: "move", moveId });
  });

  it("accounts for stat stages and the physical damage penalty of burns", function testCase() {
    const active = pokemon(7, [33]);
    const target = pokemon(7, [33]);
    const baseline = estimateAiMoveDamage(active, target, 33);
    expect(estimateAiMoveDamage({ ...active, status: "burned" }, target, 33)).toBeLessThan(
      baseline,
    );
    expect(
      estimateAiMoveDamage(
        {
          ...active,
          statStages: {
            ...active.statStages,
            attack: 2,
          },
        },
        target,
        33,
      ),
    ).toBeGreaterThan(baseline);
  });

  it("replaces a fainted Pokemon with a legal favorable matchup, not the first slot", function testCase() {
    const team = [
      pokemon(4, [52], { currentHp: 0 }),
      pokemon(4, [52], { slotIndex: 1 }),
      pokemon(1, [22], { slotIndex: 2 }),
    ];
    const target = pokemon(7, [55]);
    expect(choose(team, target)).toEqual({ kind: "switch", slotIndex: 2 });
    expect(choose(team, target, request({ kind: "switch", switchSlots: [1, 2] }))).toEqual({
      kind: "switch",
      slotIndex: 2,
    });
    expect(choose(team, target, request({ kind: "switch", switchSlots: [1] }))).toEqual({
      kind: "switch",
      slotIndex: 1,
    });
    expect(() => choose(team, target, request({ kind: "switch" }))).toThrow("legal replacement");
  });

  it("switches out of a dangerous matchup without immediately switching back", function testCase() {
    const active = pokemon(4, [52], { currentHp: 30 });
    const reserve = pokemon(1, [22], { slotIndex: 1 });
    const target = pokemon(7, [55]);
    expect(choose([active, reserve], target)).toEqual({ kind: "switch", slotIndex: 1 });
    expect(choose([reserve, active], target)).toEqual({ kind: "move", moveId: 22 });
    expect(
      choose(
        [active, reserve],
        target,
        request({
          moves: [{ moveId: 52, pp: 10, maxPp: 25, disabled: false }],
          switchSlots: [1],
          trapped: true,
        }),
      ),
    ).toEqual({ kind: "move", moveId: 52 });
  });

  it("honors forced moves, recharge, disabled moves, PP, and wait requests", function testCase() {
    const active = pokemon(7, [55, 33]);
    const target = pokemon(4, [52]);
    for (const forced of [{ forcedMoveId: 55 }, { recharge: true }])
      expect(choose([active], target, request(forced))).toEqual({ kind: "continue" });
    expect(
      choose(
        [active],
        target,
        request({
          moves: [
            { moveId: 55, pp: 10, maxPp: 25, disabled: true },
            { moveId: 33, pp: 10, maxPp: 35, disabled: false },
          ],
        }),
      ),
    ).toEqual({ kind: "move", moveId: 33 });
    expect(choose([{ ...active, moves: [{ moveId: 55, pp: 0 }] }], target)).toEqual({
      kind: "move",
      moveId: "struggle",
    });
    for (const kind of ["wait", "ended"] as const)
      expect(() => choose([active], target, request({ kind }))).toThrow("not being asked");
  });
});

function pokemon(
  speciesId: number,
  moves: number[],
  overrides: Partial<CanonicalCombatantState> = {},
): CanonicalCombatantState {
  return {
    ...createAiStarterParty(() => 0).members[0]!,
    speciesId,
    slotIndex: 0,
    level: 50,
    currentHp: 100,
    maxHp: 100,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    speed: 100,
    typeIds: COMPETITIVE_SPECIES_CATALOG[speciesId]!.typeIds,
    statStages: createDefaultBattleStatStages(),
    moves: moves.map(moveId => ({ moveId, pp: 10 })),
    ...overrides,
  };
}

function choose(
  team: CanonicalCombatantState[],
  target: CanonicalCombatantState,
  actionRequest?: Gen4ActionRequest,
) {
  return chooseAiCompetitiveAction(
    {
      playersById: {
        ai: { playerId: "ai", activeSlotIndex: team[0].slotIndex, team, actionRequest },
        opponent: { playerId: "opponent", activeSlotIndex: target.slotIndex, team: [target] },
      },
    },
    "ai",
  );
}

function request(overrides: Partial<Gen4ActionRequest>): Gen4ActionRequest {
  return {
    kind: "move",
    moves: [],
    switchSlots: [],
    trapped: false,
    forcedMoveId: null,
    recharge: false,
    ...overrides,
  };
}

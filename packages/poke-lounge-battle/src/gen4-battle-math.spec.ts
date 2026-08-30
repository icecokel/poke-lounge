import {
  applyBattleStatStageDelta,
  calculateBattleStageModifiedStat,
  calculateGen4BattleStats,
  calculateGen4Damage,
  calculateGen4TypeEffectiveness,
  createDefaultBattleStatStages,
} from "./index";

describe("shared Gen 4 battle math", () => {
  it("calculates the Lv.11 Squirtle IV fixture with zero EV", () => {
    expect(
      calculateGen4BattleStats(
        {
          hp: 44,
          attack: 48,
          defense: 65,
          specialAttack: 50,
          specialDefense: 64,
          speed: 43,
        },
        11,
        {
          hp: 31,
          attack: 31,
          defense: 31,
          specialAttack: 31,
          specialDefense: 31,
          speed: 31,
        },
      ),
    ).toEqual({
      maxHp: 34,
      attack: 18,
      defense: 22,
      specialAttack: 19,
      specialDefense: 22,
      speed: 17,
    });
  });

  it("applies water STAB and fire weakness", () => {
    const effectiveness = calculateGen4TypeEffectiveness(11, [10]);

    expect(effectiveness).toBe(2);
    expect(
      calculateGen4Damage({
        level: 11,
        power: 40,
        attack: 20,
        defense: 20,
        moveTypeId: 11,
        attackerTypeIds: [11],
        typeEffectiveness: effectiveness,
        randomFactor: 100,
        critical: false,
        category: "special",
      }),
    ).toBe(18);
  });

  it("clamps stat stages to -6 through +6", () => {
    const lowered = applyBattleStatStageDelta(createDefaultBattleStatStages(), "attack", -20);
    const raised = applyBattleStatStageDelta(lowered, "attack", 30);

    expect(lowered.attack).toBe(-6);
    expect(calculateBattleStageModifiedStat(100, lowered.attack)).toBe(25);
    expect(raised.attack).toBe(6);
    expect(calculateBattleStageModifiedStat(100, raised.attack)).toBe(400);
  });
});

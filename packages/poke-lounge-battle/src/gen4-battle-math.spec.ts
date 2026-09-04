import {
  applyBattleStatStageDelta,
  calculateBattleStageModifiedStat,
  createDefaultBattleStatStages,
} from "./battle-stat-stages";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";
import { calculateGen4Damage, getGen4FixedDamage } from "./gen4-battle-math";
import { calculateGen4TypeEffectiveness } from "./gen4-type-chart";

describe("shared Gen 4 battle math", function testSuite() {
  it("calculates the Lv.11 Squirtle IV fixture with zero EV", function testCase() {
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

  it("applies water STAB and fire weakness", function testCase() {
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

  it.each([
    [41, 40],
    [130, 20],
    [0, null],
  ])("maps fixed-damage effect %i to %s", function testCase(effectCode, expected) {
    expect(getGen4FixedDamage(effectCode)).toBe(expected);
  });

  it("clamps stat stages to -6 through +6", function testCase() {
    const lowered = applyBattleStatStageDelta(createDefaultBattleStatStages(), "attack", -20);
    const raised = applyBattleStatStageDelta(lowered, "attack", 30);

    expect(lowered.attack).toBe(-6);
    expect(calculateBattleStageModifiedStat(100, lowered.attack)).toBe(25);
    expect(raised.attack).toBe(6);
    expect(calculateBattleStageModifiedStat(100, raised.attack)).toBe(400);
  });
});

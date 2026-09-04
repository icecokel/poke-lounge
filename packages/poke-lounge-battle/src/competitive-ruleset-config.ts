import { GEN4_FIXED_DAMAGE_BY_EFFECT_CODE, getGen4FixedDamage } from "./gen4-battle-math";

export const COMPETITIVE_RULESET_VERSION = 2;
export const COMPETITIVE_STRUGGLE_MOVE_ID = "struggle" as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const COMPETITIVE_RULESET_V2 = deepFreeze({
  version: COMPETITIVE_RULESET_VERSION,
  participantCount: 2,
  partySize: { minimum: 1, maximum: 6 },
  moveCountMaximum: 4,
  scores: { win: 100, loss: 50 },
  paralysisNoActionChance: 0.25,
  poisonDamageDivisor: 8,
  burnDamageDivisor: 8,
  burnPhysicalAttackDivisor: 2,
  damageRangePercent: { minimum: 85, maximum: 100 },
  criticalHitChance: 1 / 16,
  fixedDamageByEffectCode: GEN4_FIXED_DAMAGE_BY_EFFECT_CODE,
  struggle: {
    moveId: COMPETITIVE_STRUGGLE_MOVE_ID,
    typeId: 0,
    category: "physical",
    power: 50,
    accuracy: 100,
    effectCode: 0,
    effectChance: 0,
    priority: 0,
    maxPp: 0,
    recoilMaxHpDivisor: 4,
  },
  supportedPrimaryStatusEffectCodes: [18, 19, 20, 23, 60, 66, 67, 156],
  supportedSecondaryEffectCodes: [4, 6],
  priorityEffectCodes: [103],
  randomConsumptionOrder: [
    "speed-tie",
    "paralysis",
    "accuracy",
    "critical-hit",
    "damage-range",
    "secondary-effect",
  ],
} as const);

export const APPROVED_COMPETITIVE_RULESET_V2 = COMPETITIVE_RULESET_V2;

export interface CompetitiveMoveEffectDescriptor {
  category: "physical" | "special" | "status";
  effectCode: number;
  power: number;
}

export function isCompetitiveMoveEffectSelectable(move: CompetitiveMoveEffectDescriptor): boolean {
  if (move.category === "status") {
    return COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes.includes(
      move.effectCode as (typeof COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes)[number],
    );
  }

  // HGSS 기술표의 위력 1은 별도 대미지 공식이 필요한 센티널이다.
  return move.power !== 1 || getGen4FixedDamage(move.effectCode) !== null;
}

// canonical JSON({ catalogHash, ruleset: COMPETITIVE_RULESET_V2 })의 SHA-256이다.
export const COMPETITIVE_RULESET_HASH =
  "f5011fa021d23fb38aa9bc4d6db8382bfa7b93e9041048939795416b6fc8d05e";

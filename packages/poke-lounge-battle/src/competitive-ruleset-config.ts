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
}

export function isCompetitiveMoveEffectSelectable(move: CompetitiveMoveEffectDescriptor): boolean {
  return (
    move.category !== "status" ||
    COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes.includes(
      move.effectCode as (typeof COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes)[number],
    )
  );
}

// canonical JSON({ catalogHash, ruleset: COMPETITIVE_RULESET_V2 })의 SHA-256이다.
export const COMPETITIVE_RULESET_HASH =
  "011a0f940d36c676d61345d10068a55ab979446f6a9f49063e489b73954bb152";

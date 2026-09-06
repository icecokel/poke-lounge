import { GEN4_FIXED_DAMAGE_BY_EFFECT_CODE, getGen4FixedDamage } from "./gen4-battle-math";

export const COMPETITIVE_RULESET_VERSION = 3;
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
  version: 2,
  participantCount: 2,
  partySize: { minimum: 1, maximum: 6 },
  moveCountMaximum: 4,
  forcedReplacement: { separatePhase: true, residualDamage: false, timeout: "first-healthy-slot" },
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

export function isLegacyCompetitiveMoveEffectSelectable(
  move: CompetitiveMoveEffectDescriptor,
): boolean {
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
  "e42604b7ba272d0ab93ebd5b4de302c4ab985c7ee1d41c98a683f023dae67097";

/** New matches use HGSS turn semantics; old V2 snapshots retain their original resolver. */
export const COMPETITIVE_RULESET_V3 = deepFreeze({
  version: 3,
  engine: "@pkmn/sim@0.10.11:gen4",
  romSha1: "5834fb3a2d751c48501d47d6a56898d7af6ccf9e",
  participantCount: 2,
  partySize: { minimum: 1, maximum: 6 },
  moveCountMaximum: 4,
  moveIds: { minimum: 1, maximum: 467 },
  allGen4Effects: true,
  multiTurnContinuation: true,
  midTurnReplacement: true,
  statuses: [
    "normal",
    "poisoned",
    "badlyPoisoned",
    "burned",
    "paralyzed",
    "asleep",
    "frozen",
    "fainted",
  ],
  nature: true,
  abilities: true,
  heldItems: true,
  effortValues: { perStat: 255, total: 510 },
  timeout: "first-legal-action",
  draw: "rematch-with-restored-parties",
  scores: { win: 100, loss: 50 },
} as const);
export const LEGACY_COMPETITIVE_RULESET_HASH =
  "caa92057632c9a8d0767cf517d250181ab97b57cad4227cfe73e67966277f065";

export function isCompetitiveMoveEffectSelectable(move: CompetitiveMoveEffectDescriptor): boolean {
  return Number.isInteger(move.effectCode) && move.effectCode >= 0 && move.effectCode <= 276;
}

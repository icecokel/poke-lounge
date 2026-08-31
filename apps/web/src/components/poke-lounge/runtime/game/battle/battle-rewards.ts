export type WildBattleRewardOutcome = "faint" | "capture";

export interface WildBattlePokeDollarRewardInput {
  baseExpYield: number;
  defeatedLevel: number;
  outcome: WildBattleRewardOutcome;
}

const WILD_BATTLE_REWARD_MIN_POKE_DOLLARS = 20;
const WILD_BATTLE_REWARD_MAX_POKE_DOLLARS = 9_999;

export function calculateWildBattlePokeDollarReward({
  baseExpYield,
  defeatedLevel,
  outcome,
}: WildBattlePokeDollarRewardInput): number {
  const normalizedBaseExpYield = clampInteger(baseExpYield, 0, Number.MAX_SAFE_INTEGER);
  const normalizedDefeatedLevel = clampInteger(defeatedLevel, 0, 100);

  if (normalizedBaseExpYield <= 0 || normalizedDefeatedLevel <= 0) {
    return 0;
  }

  const faintReward = clampInteger(
    Math.floor((normalizedBaseExpYield * normalizedDefeatedLevel) / 10),
    WILD_BATTLE_REWARD_MIN_POKE_DOLLARS,
    WILD_BATTLE_REWARD_MAX_POKE_DOLLARS,
  );

  return outcome === "capture" ? Math.floor(faintReward / 2) : faintReward;
}

export function formatBattlePokeDollars(pokeDollars: number): string {
  return `₽ ${Math.max(0, Math.floor(pokeDollars)).toLocaleString("en-US")}`;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

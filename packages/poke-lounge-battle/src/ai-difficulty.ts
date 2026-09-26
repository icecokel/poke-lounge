export const AI_DIFFICULTIES = ["easy", "normal", "hard"] as const;

export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = "easy";

export interface AiDifficultyProfile {
  roundOnePartyLimit: number;
  wildActionDelayMs: number;
  wildMoveSelection: "random" | "optimal";
  pvpMoveSelection: "random" | "optimal";
  captureRateMultiplier: number;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: {
    roundOnePartyLimit: 3,
    wildActionDelayMs: 1_000,
    wildMoveSelection: "random",
    pvpMoveSelection: "random",
    captureRateMultiplier: 1,
  },
  normal: {
    roundOnePartyLimit: 4,
    wildActionDelayMs: 0,
    wildMoveSelection: "random",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1,
  },
  hard: {
    roundOnePartyLimit: Number.POSITIVE_INFINITY,
    wildActionDelayMs: 0,
    wildMoveSelection: "optimal",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1.1,
  },
};

export function nextAiDifficulty(difficulty: AiDifficulty): AiDifficulty {
  const index = AI_DIFFICULTIES.indexOf(difficulty);
  return AI_DIFFICULTIES[(index + 1) % AI_DIFFICULTIES.length]!;
}

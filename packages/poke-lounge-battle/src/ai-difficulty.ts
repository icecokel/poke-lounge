export const AI_DIFFICULTIES = ["normal", "hard"] as const;

export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = "normal";

export interface AiDifficultyProfile {
  wildActionDelayMs: number;
  wildMoveSelection: "random" | "optimal";
  pvpMoveSelection: "random" | "optimal";
  captureRateMultiplier: number;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  normal: {
    wildActionDelayMs: 0,
    wildMoveSelection: "random",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1.25,
  },
  hard: {
    wildActionDelayMs: 0,
    wildMoveSelection: "optimal",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1.5,
  },
};

export function nextAiDifficulty(difficulty: AiDifficulty): AiDifficulty {
  const index = AI_DIFFICULTIES.indexOf(difficulty);
  return AI_DIFFICULTIES[(index + 1) % AI_DIFFICULTIES.length]!;
}

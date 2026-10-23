export const AI_DIFFICULTIES = ["normal", "hard"] as const;

export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

export function isAiDifficulty(value: unknown): value is AiDifficulty {
  return AI_DIFFICULTIES.includes(value as AiDifficulty);
}

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = "normal";

export interface AiDifficultyProfile {
  /**
   * Extra wait before each AI wild-battle action (and once at battle start), on top of
   * message auto-advance. The worker resolves battles instantly, so without it an AI
   * fights a wild battle in a few seconds and outlevels every human by round end.
   * Tuned so AI ends a round a few levels above the top human: normal ≈ 1.3-1.6×,
   * hard ≈ 2× the human battle count.
   */
  wildActionDelayMs: number;
  wildMoveSelection: "random" | "optimal";
  pvpMoveSelection: "random" | "optimal";
  captureRateMultiplier: number;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  normal: {
    wildActionDelayMs: 4_500,
    wildMoveSelection: "random",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1.25,
  },
  hard: {
    wildActionDelayMs: 3_000,
    wildMoveSelection: "optimal",
    pvpMoveSelection: "optimal",
    captureRateMultiplier: 1.5,
  },
};

export function nextAiDifficulty(difficulty: AiDifficulty): AiDifficulty {
  const index = AI_DIFFICULTIES.indexOf(difficulty);
  return AI_DIFFICULTIES[(index + 1) % AI_DIFFICULTIES.length]!;
}

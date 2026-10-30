import { ROM_TRAINERS } from "./rom-trainers";

export const GYM_TRAINERS = [
  { npcKey: "falkner", trainerId: 20 },
  { npcKey: "bugsy", trainerId: 21 },
  { npcKey: "whitney", trainerId: 30 },
  { npcKey: "morty", trainerId: 31 },
  { npcKey: "chuck", trainerId: 34 },
  { npcKey: "jasmine", trainerId: 33 },
  { npcKey: "pryce", trainerId: 32 },
  { npcKey: "clair", trainerId: 35 },
] as const;

export const GYM_LEVEL_PLANS = {
  original: GYM_TRAINERS.map(({ trainerId }) =>
    ROM_TRAINERS[trainerId].members.map(member => member.level),
  ),
  "curve-v1": [
    [10, 12],
    [17, 15, 15],
    [20, 22],
    [24, 24, 27, 25],
    [30, 32],
    [34, 34, 37],
    [39, 40, 42],
    [44, 44, 44, 46],
  ],
} as const;

export type GymLevelPlan = keyof typeof GYM_LEVEL_PLANS;

// OQ4 확정값. 밸런스는 직접 플레이 후 새 계획을 추가해 시즌 경계에서 조정한다.
export const DEFAULT_GYM_LEVEL_PLAN = "curve-v1" as const;

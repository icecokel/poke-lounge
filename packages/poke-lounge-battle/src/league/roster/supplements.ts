import type { LeagueNpcKey } from "../contract";

export interface SupplementMember {
  readonly speciesId: number;
  readonly level: number;
  readonly moveIds: readonly number[];
  readonly heldItemId: 0;
}

// D5: 재대전 종족, 해당 종족의 보충 레벨 이하 ROM 레벨업 기술만 사용한다.
export const ELITE_FOUR_SUPPLEMENTS = {
  lance: [],
  will: [{ speciesId: 282, level: 41, moveIds: [94, 345, 347, 104], heldItemId: 0 }],
  koga: [{ speciesId: 454, level: 43, moveIds: [398, 279, 389, 207], heldItemId: 0 }],
  bruno: [{ speciesId: 297, level: 43, moveIds: [358, 395, 265, 282], heldItemId: 0 }],
  karen: [{ speciesId: 359, level: 45, moveIds: [389, 44, 163, 14], heldItemId: 0 }],
} as const satisfies Readonly<Record<LeagueNpcKey, readonly SupplementMember[]>>;

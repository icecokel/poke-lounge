export type CanonicalMoveId = number | "struggle";

export type CanonicalCompetitiveAction =
  { kind: "move"; moveId: CanonicalMoveId } | { kind: "switch"; slotIndex: number };

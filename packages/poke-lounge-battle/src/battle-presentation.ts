/** Cosmetic, resolved-action telemetry. Never used to decide damage, PP, turn order or a winner. */
export type PresentationStatus = "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";
export interface ResolvedAnimationEvent {
  kind: "move" | "status";
  actorPlayerId: string;
  targetPlayerId: string;
  actorSlotIndex: number;
  targetSlotIndex: number;
  moveId: number;
  status: PresentationStatus;
  hit: boolean;
  damage: number;
  actorHp: number;
  targetHp: number;
  actorStatus: PresentationStatus;
  targetStatus: PresentationStatus;
}
export interface ResolvedTurnPresentation {
  turn: number;
  events: ResolvedAnimationEvent[];
}
export interface BattleAnimationCue {
  kind: "move" | "status";
  source: "player" | "opponent";
  target: "player" | "opponent";
  moveId: number;
  status: PresentationStatus;
  hit: boolean;
  damage: number;
}

/** Optional visual data is bounded and may be discarded without rejecting valid battle state. */
export function parseResolvedTurnPresentation(
  value: unknown,
  playerIds: readonly string[],
  currentTurn: number,
): ResolvedTurnPresentation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.turn !== currentTurn - 1 || !Array.isArray(v.events) || v.events.length > 12)
    return undefined;
  const result: ResolvedAnimationEvent[] = [];
  const statuses = ["normal", "poisoned", "burned", "paralyzed", "fainted"];
  for (const input of v.events) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const e = input as Record<string, unknown>;
    if (
      (e.kind !== "move" && e.kind !== "status") ||
      !playerIds.includes(e.actorPlayerId as string) ||
      !playerIds.includes(e.targetPlayerId as string) ||
      !statuses.includes(e.status as string) ||
      !statuses.includes(e.actorStatus as string) ||
      !statuses.includes(e.targetStatus as string) ||
      typeof e.hit !== "boolean"
    )
      return undefined;
    for (const [key, max] of [
      ["actorSlotIndex", 5],
      ["targetSlotIndex", 5],
      ["moveId", 470],
      ["damage", 65535],
      ["actorHp", 65535],
      ["targetHp", 65535],
    ] as const)
      if (!Number.isSafeInteger(e[key]) || (e[key] as number) < 0 || (e[key] as number) > max)
        return undefined;
    if (
      (e.kind === "move" &&
        (e.moveId === 0 || e.status !== "normal" || e.actorPlayerId === e.targetPlayerId)) ||
      (e.kind === "status" &&
        (e.moveId !== 0 ||
          !["poisoned", "burned", "paralyzed"].includes(e.status as string) ||
          e.actorPlayerId !== e.targetPlayerId))
    )
      return undefined;
    result.push({
      kind: e.kind,
      actorPlayerId: e.actorPlayerId as string,
      targetPlayerId: e.targetPlayerId as string,
      actorSlotIndex: e.actorSlotIndex as number,
      targetSlotIndex: e.targetSlotIndex as number,
      moveId: e.moveId as number,
      status: e.status as PresentationStatus,
      hit: e.hit,
      damage: e.damage as number,
      actorHp: e.actorHp as number,
      targetHp: e.targetHp as number,
      actorStatus: e.actorStatus as PresentationStatus,
      targetStatus: e.targetStatus as PresentationStatus,
    });
  }
  return { turn: v.turn as number, events: result };
}

import {
  parseResolvedTurnPresentation,
  type BattleAnimationCue,
} from "@poke-lounge/battle/battle-presentation";
import type { BattleScreenState, BattlePokemonStatus } from "./battle-types";
import type { CompetitiveProjection } from "../network/local-preview-room";

export type EffectHpTargets = Record<
  "player" | "opponent",
  { hp: number; status: BattlePokemonStatus }
>;
export interface QueuedBattleEffect {
  cue: BattleAnimationCue;
  targets?: Partial<EffectHpTargets>;
}

export function createAuthoritativeEffectSequence(
  projection: CompetitiveProjection,
  next: BattleScreenState,
): QueuedBattleEffect[] {
  const trace = parseResolvedTurnPresentation(
    projection.currentState.lastTurnPresentation,
    projection.playerIds,
    projection.currentTurn,
  );
  if (!trace) return [];
  const toSide = (id: string): "player" | "opponent" =>
    id === next.player.playerId ? "player" : "opponent";
  return trace.events.flatMap(event => {
    const source = toSide(event.actorPlayerId),
      target = toSide(event.targetPlayerId);
    // Do not animate a previously active Pokémon over a newly switched-in sprite.
    if (
      next[source].activePartySlotIndex !== event.actorSlotIndex ||
      next[target].activePartySlotIndex !== event.targetSlotIndex
    )
      return [];
    return [
      {
        cue: {
          kind: event.kind,
          source,
          target,
          moveId: event.moveId,
          status: event.status,
          hit: event.hit,
          damage: event.damage,
        },
        targets: {
          [source]: { hp: event.actorHp, status: event.actorStatus },
          [target]: { hp: event.targetHp, status: event.targetStatus },
        },
      },
    ];
  });
}

export function createLocalEffectSequence(
  previous: BattleScreenState,
  next: BattleScreenState,
  statuses: Record<"player" | "opponent", BattlePokemonStatus>,
): QueuedBattleEffect[] {
  const snapshot = next.messageHpSnapshots?.[0];
  if (!snapshot?.animation || snapshot === previous.messageHpSnapshots?.[0]) return [];
  const result: QueuedBattleEffect[] = [{ cue: snapshot.animation }];
  if (snapshot.animation.kind === "move") {
    for (const side of ["player", "opponent"] as const) {
      const status = side === "player" ? snapshot.playerStatus : snapshot.opponentStatus;
      if (
        status !== statuses[side] &&
        (status === "poisoned" || status === "burned" || status === "paralyzed")
      )
        result.push({
          cue: {
            kind: "status",
            source: side,
            target: side,
            moveId: 0,
            status,
            hit: false,
            damage: 0,
          },
        });
    }
  }
  return result;
}

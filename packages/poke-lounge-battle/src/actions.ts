export type CanonicalMoveId = number | "struggle";

export type CanonicalCompetitiveAction =
  | { kind: "move"; moveId: CanonicalMoveId }
  | { kind: "switch"; slotIndex: number }
  | { kind: "continue" };

export function getCompetitiveActionPlayerIds(state: {
  participantIds: readonly string[];
  terminal: unknown;
  playersById: Readonly<
    Record<
      string,
      {
        actionRequest?: import("./gen4/types").Gen4ActionRequest;
        activeSlotIndex: number;
        team: readonly { slotIndex: number; currentHp: number }[];
      }
    >
  >;
}): readonly string[] {
  if (state.terminal) return [];
  if (state.participantIds.every(id => state.playersById[id]?.actionRequest)) {
    return state.participantIds.filter(id =>
      ["move", "switch"].includes(state.playersById[id]!.actionRequest!.kind),
    );
  }
  const replacing = state.participantIds.filter(playerId => {
    const player = state.playersById[playerId]!;
    return player.team.some(
      member => member.slotIndex === player.activeSlotIndex && member.currentHp === 0,
    );
  });
  return replacing.length > 0 ? replacing : state.participantIds;
}

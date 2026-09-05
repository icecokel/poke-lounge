export type CanonicalMoveId = number | "struggle";

export type CanonicalCompetitiveAction =
  { kind: "move"; moveId: CanonicalMoveId } | { kind: "switch"; slotIndex: number };

export function getCompetitiveActionPlayerIds(state: {
  participantIds: readonly string[];
  terminal: unknown;
  playersById: Readonly<
    Record<
      string,
      {
        activeSlotIndex: number;
        team: readonly { slotIndex: number; currentHp: number }[];
      }
    >
  >;
}): readonly string[] {
  if (state.terminal) return [];
  const replacing = state.participantIds.filter(playerId => {
    const player = state.playersById[playerId]!;
    return player.team.some(
      member => member.slotIndex === player.activeSlotIndex && member.currentHp === 0,
    );
  });
  return replacing.length > 0 ? replacing : state.participantIds;
}

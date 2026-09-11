/** Server room IDs must be sorted before any client-local ID remapping.
 * AI seats can share a join timestamp, so insertion order is not a seed order.
 * Returning a copy preserves the room's original participant/event ordering.
 */
export function sortTournamentParticipantsByJoinOrder<
  T extends { playerId: string; joinedAtMs: number },
>(participants: readonly T[]): T[] {
  return [...participants].sort(
    (left, right) =>
      left.joinedAtMs - right.joinedAtMs || left.playerId.localeCompare(right.playerId),
  );
}

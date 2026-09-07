import type { MoveReplacementConfirmation } from "../../contracts/move-learning";
export function createMoveReplacementConfirmation(
  moves: ReadonlyArray<{ id: number }>,
  newMove: { id: number } | null | undefined,
  index: number,
): MoveReplacementConfirmation | null {
  const oldMove = moves[index];
  if (!Number.isInteger(index) || !oldMove || !newMove) return null;
  return { index, oldMoveId: oldMove.id, newMoveId: newMove.id };
}

export function isMoveReplacementConfirmationCurrent(
  confirmation: MoveReplacementConfirmation | null,
  moves: ReadonlyArray<{ id: number }>,
  newMove: { id: number } | null | undefined,
): boolean {
  return (
    confirmation !== null &&
    moves[confirmation.index]?.id === confirmation.oldMoveId &&
    newMove?.id === confirmation.newMoveId
  );
}

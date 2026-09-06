export const DESKTOP_BATTLE_BAG_COLUMNS = 2;
export const BATTLE_BAG_PAGE_SIZE = 4;
export type BattleBagDirection = "up" | "down" | "left" | "right";

export function moveBattleBagSelection(
  index: number,
  direction: BattleBagDirection,
  itemCount: number,
  columns: 1 | 2,
): number {
  const last = Math.max(0, itemCount - 1);
  const selected = Math.max(0, Math.min(last, index));
  const column = selected % columns;
  if (direction === "left") return column > 0 ? selected - 1 : selected;
  if (direction === "right") return column + 1 < columns ? Math.min(last, selected + 1) : selected;
  if (direction === "up") return Math.max(0, selected - columns);
  return Math.min(last, selected + columns);
}

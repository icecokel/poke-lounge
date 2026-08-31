import { PLAYER_PARTY_SLOT_COUNT } from "../player/player-types";
import { canPokemonBattle } from "./battle-logic";
import { getBattleStatusTextView, hpRatio, type BattleRect } from "./battle-layout";
import type { BattlePartySlot, BattlePokemon } from "./battle-types";

export const BATTLE_PARTY_SELECT_GRID = {
  columns: 3,
  rows: 2,
  insetX: 4,
  headerHeight: 12,
  footerHeight: 3,
  columnGap: 4,
  rowGap: 3,
} as const;

const BATTLE_PARTY_NAME_MAX_CHARACTERS = 6;

export type BattlePartySelectionDirection = "up" | "down" | "left" | "right";

export interface BattlePartySlotView {
  slotIndex: number;
  rect: BattleRect;
  pokemon: BattlePokemon | null;
  displayName: string;
  isSelected: boolean;
  isCurrent: boolean;
  isFainted: boolean;
  isEmpty: boolean;
  canSwitch: boolean;
  hpRatio: number;
  statusLabel: string | null;
}

export function getFirstSwitchableBattlePartySlotIndex(
  party: BattlePartySlot[],
  activePartySlotIndex: number,
): number {
  return (
    party.find(function findItem(slot) {
      return (
        slot.slotIndex !== activePartySlotIndex &&
        slot.pokemon !== null &&
        canPokemonBattle(slot.pokemon)
      );
    })?.slotIndex ?? activePartySlotIndex
  );
}

export function resolveBattlePartySlotRects(panel: BattleRect): BattleRect[] {
  const slotWidth =
    (panel.width -
      BATTLE_PARTY_SELECT_GRID.insetX * 2 -
      BATTLE_PARTY_SELECT_GRID.columnGap * (BATTLE_PARTY_SELECT_GRID.columns - 1)) /
    BATTLE_PARTY_SELECT_GRID.columns;
  const gridHeight =
    panel.height - BATTLE_PARTY_SELECT_GRID.headerHeight - BATTLE_PARTY_SELECT_GRID.footerHeight;
  const slotHeight =
    (gridHeight - BATTLE_PARTY_SELECT_GRID.rowGap * (BATTLE_PARTY_SELECT_GRID.rows - 1)) /
    BATTLE_PARTY_SELECT_GRID.rows;

  return Array.from({ length: PLAYER_PARTY_SLOT_COUNT }, function callback(_, slotIndex) {
    const column = slotIndex % BATTLE_PARTY_SELECT_GRID.columns;
    const row = Math.floor(slotIndex / BATTLE_PARTY_SELECT_GRID.columns);

    return {
      x:
        panel.x +
        BATTLE_PARTY_SELECT_GRID.insetX +
        column * (slotWidth + BATTLE_PARTY_SELECT_GRID.columnGap),
      y:
        panel.y +
        BATTLE_PARTY_SELECT_GRID.headerHeight +
        row * (slotHeight + BATTLE_PARTY_SELECT_GRID.rowGap),
      width: slotWidth,
      height: slotHeight,
    };
  });
}

export function createBattlePartySlotViews({
  activePartySlotIndex,
  panel,
  party,
  selectedPartySlotIndex,
}: {
  activePartySlotIndex: number;
  panel: BattleRect;
  party: BattlePartySlot[];
  selectedPartySlotIndex: number;
}): BattlePartySlotView[] {
  const rects = resolveBattlePartySlotRects(panel);

  return rects.map(function mapItem(rect, slotIndex) {
    const pokemon =
      party.find(function findItem(slot) {
        return slot.slotIndex === slotIndex;
      })?.pokemon ?? null;
    const isEmpty = pokemon === null;
    const isCurrent = slotIndex === activePartySlotIndex;
    const isFainted = pokemon !== null && !canPokemonBattle(pokemon);
    const statusLabel = resolveBattlePartyStatusLabel({ isCurrent, isFainted, pokemon });

    return {
      slotIndex,
      rect,
      pokemon,
      displayName: pokemon ? formatBattlePartyPokemonName(pokemon.name) : "",
      isSelected: slotIndex === selectedPartySlotIndex,
      isCurrent,
      isFainted,
      isEmpty,
      canSwitch: !isEmpty && !isCurrent && !isFainted,
      hpRatio: pokemon ? hpRatio(pokemon.currentHp, pokemon.maxHp) : 0,
      statusLabel,
    };
  });
}

export function getBattlePartySlotIndexAtPoint(
  point: Pick<BattleRect, "x" | "y">,
  panel: BattleRect,
): number | null {
  const slotIndex = resolveBattlePartySlotRects(panel).findIndex(function findItemIndex(rect) {
    return (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height
    );
  });

  return slotIndex >= 0 ? slotIndex : null;
}

export function moveBattlePartySelection(
  currentIndex: number,
  direction: BattlePartySelectionDirection,
): number {
  const lastIndex = PLAYER_PARTY_SLOT_COUNT - 1;
  const normalizedIndex = Math.min(lastIndex, Math.max(0, Math.floor(currentIndex)));
  const column = normalizedIndex % BATTLE_PARTY_SELECT_GRID.columns;
  const row = Math.floor(normalizedIndex / BATTLE_PARTY_SELECT_GRID.columns);

  switch (direction) {
    case "left":
      return column > 0 ? normalizedIndex - 1 : normalizedIndex;
    case "right":
      return column < BATTLE_PARTY_SELECT_GRID.columns - 1 ? normalizedIndex + 1 : normalizedIndex;
    case "up":
      return row > 0 ? normalizedIndex - BATTLE_PARTY_SELECT_GRID.columns : normalizedIndex;
    case "down":
      return row < BATTLE_PARTY_SELECT_GRID.rows - 1
        ? normalizedIndex + BATTLE_PARTY_SELECT_GRID.columns
        : normalizedIndex;
  }
}

export function formatBattlePartyPokemonName(name: string): string {
  const characters = Array.from(name);

  return characters.length <= BATTLE_PARTY_NAME_MAX_CHARACTERS
    ? name
    : `${characters.slice(0, BATTLE_PARTY_NAME_MAX_CHARACTERS - 1).join("")}…`;
}

function resolveBattlePartyStatusLabel({
  isCurrent,
  isFainted,
  pokemon,
}: {
  isCurrent: boolean;
  isFainted: boolean;
  pokemon: BattlePokemon | null;
}): string | null {
  if (!pokemon) {
    return null;
  }

  if (isFainted) {
    return getBattleStatusTextView("fainted")?.label ?? "전투불능";
  }

  const statusText = getBattleStatusTextView(pokemon.status);

  if (statusText) {
    return statusText.label;
  }

  if (isCurrent) {
    return "전투 중";
  }

  return null;
}

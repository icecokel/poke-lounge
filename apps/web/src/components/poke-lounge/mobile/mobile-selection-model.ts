import type {
  MobileBattleUiAction,
  MobileBattleUiState,
} from "../runtime/game/ui/mobile-battle-ui";

export type BattleCandidate = {
  context: string;
  kind: "party" | "item";
  identity: string;
  index: number;
};
export function selectionContext(state: MobileBattleUiState): string {
  return state.selectionKey ?? state.phase;
}
export function pokemonIdentity(pokemon: MobileBattleUiState["party"][number]): string {
  return `${pokemon.slotIndex}:${pokemon.name}:${pokemon.level}:${pokemon.sprite?.path ?? ""}:${pokemon.sprite?.frame ?? ""}`;
}
export function canChooseBattleAction(state: MobileBattleUiState, now = Date.now()): boolean {
  return (
    !state.isInputLocked &&
    !state.spectating &&
    !state.isHelpOpen &&
    (state.canSubmitAction ?? !state.message) &&
    (state.turnEndsAtMs == null || state.turnEndsAtMs > now) &&
    ["command", "move-select", "party-select", "bag-select"].includes(state.phase)
  );
}

// Revalidate against the *latest* snapshot at confirmation time. Filtered list
// positions must never be confused with runtime party slots or item indexes.
export function candidateAction(
  candidate: BattleCandidate | null,
  state: MobileBattleUiState,
  now = Date.now(),
): MobileBattleUiAction | null {
  if (
    !candidate ||
    candidate.context !== selectionContext(state) ||
    !canChooseBattleAction(state, now)
  )
    return null;
  if (candidate.kind === "party" && state.phase === "party-select") {
    const pokemon = state.party.find(p => p.slotIndex === candidate.index);
    return pokemon &&
      !pokemon.isEmpty &&
      !pokemon.isFainted &&
      !pokemon.isCurrent &&
      pokemon.canSwitch &&
      pokemon.currentHp > 0 &&
      pokemonIdentity(pokemon) === candidate.identity
      ? { type: "select-party", index: pokemon.slotIndex }
      : null;
  }
  if (candidate.kind === "item" && state.phase === "bag-select") {
    const item = state.items.find(
      item => item.id === candidate.identity && item.index === candidate.index,
    );
    return item && item.count > 0 && !item.disabled
      ? { type: "select-item", index: item.index }
      : null;
  }
  return null;
}

export function pokemonHealth(current: number | null, max: number | null) {
  if (
    current == null ||
    max == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(max) ||
    max <= 0 ||
    current < 0 ||
    current > max
  )
    return null;
  return { current: Math.floor(current), max: Math.floor(max), ratio: current / max };
}

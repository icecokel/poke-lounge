import type { BattlePokemon, BattleScreenState } from "./battle-types";
export type BattleFeedbackSide = "player" | "opponent";

/** Compare the same Pokémon, including a reserve switching in; never compare two unrelated HP bars. */
export function getPreviousCombatantPokemon(
  previous: BattleScreenState,
  next: BattleScreenState,
  side: BattleFeedbackSide,
): BattlePokemon | null {
  if (
    previous.tournamentMatchId !== next.tournamentMatchId ||
    previous.roundIndex !== next.roundIndex ||
    previous[side].playerId !== next[side].playerId
  )
    return null;
  const participant = next[side];
  const slot = previous[side].party?.find(
    slot => slot.slotIndex === participant.activePartySlotIndex,
  );
  const pokemon =
    slot?.pokemon ??
    (previous[side].activePartySlotIndex === participant.activePartySlotIndex
      ? previous[side].pokemon
      : null);
  return pokemon?.speciesId === participant.pokemon.speciesId ? pokemon : null;
}

export function getAuthoritativeHpLossTargets(
  previous: BattleScreenState,
  next: BattleScreenState,
): BattleFeedbackSide[] {
  return (["player", "opponent"] as const).filter(side => {
    const before = getPreviousCombatantPokemon(previous, next, side);
    return before !== null && next[side].pokemon.currentHp < before.currentHp;
  });
}

import type { BattleScreenState } from "@poke-lounge/battle/adventure/battle/battle-types";
import { syncActivePartyPokemon } from "@poke-lounge/battle/adventure/battle/battle-party";

/** Commit only the reward already computed for a finished victory, without advancing combat. */
export function materializeResolvedWildBattleReward(state: BattleScreenState): BattleScreenState {
  const reward = state.pendingExperienceReward;
  if (
    state.battleKind !== "wild" ||
    state.result?.reason !== "faint" ||
    state.result.winnerPlayerId !== state.player.playerId ||
    !reward
  )
    return state;
  return {
    ...state,
    player: syncActivePartyPokemon(
      { ...state.player, party: reward.party ?? state.player.party },
      reward.pokemon,
    ),
    pendingExperienceReward: null,
  };
}

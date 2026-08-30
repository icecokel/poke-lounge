import assert from "node:assert/strict";
import test from "node:test";
import { createGameStateStore } from "./state/gameStateStore";
import { createSampleBattleState } from "./battle/battleSampleState";
import { resolveWebMoveLearning, settleWebBattle } from "./web-battle-runtime";
import { toPlayerPokemon } from "./battle/battle-world-persistence";

test("Web battle settlement persists party damage, capture, and reward", () => {
  const gameStateStore = createGameStateStore();
  const battleState = createSampleBattleState();
  gameStateStore.setStarterPokemon(toPlayerPokemon(battleState.player.pokemon));
  const capturedPokemon = { ...battleState.opponent.pokemon, name: "포획 테스트" };
  const damagedPokemon = { ...battleState.player.pokemon, currentHp: 1 };

  settleWebBattle(
    {
      ...battleState,
      player: {
        ...battleState.player,
        pokemon: damagedPokemon,
        party: battleState.player.party.map(slot =>
          slot.slotIndex === 0 ? { ...slot, pokemon: damagedPokemon } : slot,
        ),
      },
      result: {
        winnerPlayerId: battleState.player.playerId,
        loserPlayerId: battleState.opponent.playerId,
        reason: "capture",
        capturedPokemon,
        rewardPokeDollars: 120,
      },
    },
    gameStateStore,
  );

  const player = gameStateStore.getCurrentLocalPlayer();
  assert.equal(player.party[0]?.pokemon?.currentHp, 1);
  assert.equal(player.party[1]?.pokemon?.name, "포획 테스트");
  assert.equal(player.wallet.pokeDollars, 120);
});

test("Web battle move learning replaces the selected move and returns to the end flow", () => {
  const state = createSampleBattleState();
  const learnedMove = { ...state.player.pokemon.moves[0], id: 999, name: "새 기술" };
  const result = resolveWebMoveLearning(
    { ...state, phase: "move-replace-select" },
    [{ slotIndex: 0, pokemonName: state.player.pokemon.name, newMove: learnedMove }],
    0,
  );

  assert.equal(result.state.player.pokemon.moves[0]?.name, "새 기술");
  assert.equal(result.state.phase, "ended");
  assert.equal(result.pendingMoveLearnings.length, 0);
});

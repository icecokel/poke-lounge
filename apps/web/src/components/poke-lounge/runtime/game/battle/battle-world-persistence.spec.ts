import assert from "node:assert/strict";
import test from "node:test";
import { createSampleBattleState } from "./battleSampleState";
import {
  persistBattlePartyToWorld,
  persistCapturedPokemonToWorld,
  toPlayerPokemon,
} from "./battle-world-persistence";
import { createGameStateStore } from "../state/gameStateStore";

test("서버 권위 PvP 결과의 HP, PP, 상태를 월드 파티에 기록하지 않는다", () => {
  const gameStateStore = createGameStateStore();
  const battleState = createSampleBattleState();
  gameStateStore.setStarterPokemon(toPlayerPokemon(battleState.player.pokemon));
  const worldPartyBeforeBattle = structuredClone(gameStateStore.getCurrentLocalPlayer().party);
  const completedParticipant = structuredClone(battleState.player);
  const activePokemon = completedParticipant.party[0]?.pokemon;
  assert.ok(activePokemon);
  activePokemon.currentHp = 1;
  activePokemon.status = "burned";
  activePokemon.moves[0] = { ...activePokemon.moves[0], pp: 0 };
  completedParticipant.pokemon = activePokemon;

  persistBattlePartyToWorld({
    completedCompetitiveBattle: true,
    gameStateStore,
    localPlayer: gameStateStore.getCurrentLocalPlayer(),
    participant: completedParticipant,
  });

  assert.deepEqual(gameStateStore.getCurrentLocalPlayer().party, worldPartyBeforeBattle);
});

test("일반 전투 결과는 기존처럼 월드 파티에 기록한다", () => {
  const gameStateStore = createGameStateStore();
  const battleState = createSampleBattleState();
  gameStateStore.setStarterPokemon(toPlayerPokemon(battleState.player.pokemon));
  const completedParticipant = structuredClone(battleState.player);
  const activePokemon = completedParticipant.party[0]?.pokemon;
  assert.ok(activePokemon);
  activePokemon.currentHp = 1;
  activePokemon.status = "paralyzed";
  completedParticipant.pokemon = activePokemon;

  persistBattlePartyToWorld({
    completedCompetitiveBattle: false,
    gameStateStore,
    localPlayer: gameStateStore.getCurrentLocalPlayer(),
    participant: completedParticipant,
  });

  assert.equal(gameStateStore.getCurrentLocalPlayer().party[0]?.pokemon?.currentHp, 1);
  assert.equal(gameStateStore.getCurrentLocalPlayer().party[0]?.pokemon?.status, "paralyzed");
});

test("포획 결과는 월드 전환 전에 빈 파티 슬롯에 기록한다", () => {
  const gameStateStore = createGameStateStore();
  const battleState = createSampleBattleState();
  gameStateStore.setStarterPokemon(toPlayerPokemon(battleState.player.pokemon));

  const placement = persistCapturedPokemonToWorld({
    capturedPokemon: battleState.opponent.pokemon,
    gameStateStore,
  });

  assert.deepEqual(placement, { ok: true, destination: "party", slotIndex: 1 });
  assert.equal(
    gameStateStore.getCurrentLocalPlayer().party[1]?.pokemon?.name,
    battleState.opponent.pokemon.name,
  );
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDefaultLocalPlayer, type PlayerPokemon } from "../state/gameStateStore";
import { createPvpBattleState } from "./pvpBattleFactory";
import type { RomPersonalRecordCollection, RomRefinedMoveCollection } from "./wildBattleFactory";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const personalRecords = readPublicJson(
  "/assets/poke-lounge/extraction/personal-data.json",
) as RomPersonalRecordCollection;
const moveRecords = readPublicJson(
  "/assets/poke-lounge/extraction/refined-battle-records.json",
) as RomRefinedMoveCollection;

test("로컬 PvP도 ROM 종족값, 타입과 기술 데이터를 사용한다", () => {
  const player = createDefaultLocalPlayer("player-1");
  const opponent = createDefaultLocalPlayer("player-2");
  player.party = [{ slotIndex: 0, pokemon: createPokemon(4, "파이리", 52, "불꽃세례") }];
  opponent.party = [{ slotIndex: 0, pokemon: createPokemon(7, "꼬부기", 55, "물대포") }];

  const state = createPvpBattleState({
    roundIndex: 0,
    matchIndex: 0,
    player,
    opponent,
    personalRecords,
    moveRecords,
  });

  assert.deepEqual(state.player.pokemon.typeIds, [10]);
  assert.equal(state.player.pokemon.baseStats.attack, 52);
  assert.notEqual(state.player.pokemon.attack, state.player.pokemon.level);
  assert.deepEqual(
    state.player.pokemon.moves.map(move => ({
      id: move.id,
      typeId: move.typeId,
      category: move.category,
      power: move.power,
      effectCode: move.effectCode,
    })),
    [{ id: 52, typeId: 10, category: "special", power: 40, effectCode: 4 }],
  );
  assert.deepEqual(state.opponent.pokemon.typeIds, [11]);
});

test("IV가 없는 구버전 파티 미러전은 같은 능력치를 사용한다", () => {
  const player = createDefaultLocalPlayer("player-1");
  const opponent = createDefaultLocalPlayer("player-2");
  const legacyPokemon = createPokemon(152, "치코리타", 33, "몸통박치기");
  player.party = [{ slotIndex: 0, pokemon: legacyPokemon }];
  opponent.party = [{ slotIndex: 0, pokemon: structuredClone(legacyPokemon) }];

  const state = createPvpBattleState({
    roundIndex: 0,
    matchIndex: 0,
    player,
    opponent,
    personalRecords,
    moveRecords,
  });

  assert.deepEqual(state.player.pokemon.individualValues, state.opponent.pokemon.individualValues);
  assert.deepEqual(
    [state.player.pokemon.maxHp, state.player.pokemon.attack, state.player.pokemon.speed],
    [state.opponent.pokemon.maxHp, state.opponent.pokemon.attack, state.opponent.pokemon.speed],
  );
});

function createPokemon(
  speciesId: number,
  name: string,
  moveId: number,
  moveName: string,
): PlayerPokemon {
  return {
    speciesId,
    name,
    level: 10,
    moves: [{ id: moveId, name: moveName, pp: 25, maxPp: 25 }],
  };
}

function readPublicJson(publicPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")), "utf8"),
  );
}

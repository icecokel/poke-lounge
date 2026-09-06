import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  POKEMON_DATA_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import { createDefaultLocalPlayer, type PlayerPokemon } from "../state/game-state-store";
import { createPvpBattleState } from "./pvp-battle-factory";
import type { RomPersonalRecordCollection, RomRefinedMoveCollection } from "./wild-battle-factory";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
const personalRecords = pokemonData as RomPersonalRecordCollection;
const moveRecords = pokemonData as RomRefinedMoveCollection;

test.before(async function callback() {
  await loadRuntimeGameDataJson(async function callback(input) {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    return new Response(JSON.stringify(readPublicJson(requestPath)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

test.after(function callback() {
  return resetRuntimeGameDataJsonStateForTest();
});

test("로컬 PvP도 ROM 종족값, 타입과 기술 데이터를 사용한다", function testCase() {
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
    state.player.pokemon.moves.map(function mapItem(move) {
      return {
        id: move.id,
        typeId: move.typeId,
        category: move.category,
        power: move.power,
        effectCode: move.effectCode,
      };
    }),
    [{ id: 52, typeId: 10, category: "special", power: 40, effectCode: 4 }],
  );
  assert.deepEqual(state.opponent.pokemon.typeIds, [11]);
});

test("IV가 없는 구버전 파티 미러전은 같은 능력치를 사용한다", function testCase() {
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

test("기절한 선두 대신 살아 있는 팀원으로 전투에 진입하고 소개 이름도 일치한다", () => {
  const player = createDefaultLocalPlayer("player-1");
  const opponent = createDefaultLocalPlayer("player-2");
  player.party = [
    {
      slotIndex: 0,
      pokemon: { ...createPokemon(4, "파이리", 52, "불꽃세례"), currentHp: 0, status: "fainted" },
    },
    { slotIndex: 3, pokemon: { ...createPokemon(7, "꼬부기", 55, "물대포"), currentHp: 5 } },
  ];
  opponent.party = [
    {
      slotIndex: 0,
      pokemon: { ...createPokemon(152, "치코리타", 33, "몸통박치기"), currentHp: 0 },
    },
    { slotIndex: 5, pokemon: { ...createPokemon(155, "브케인", 52, "불꽃세례"), currentHp: 5 } },
  ];
  const before = structuredClone([player, opponent]);
  const state = createPvpBattleState({
    roundIndex: 1,
    matchIndex: 0,
    player,
    opponent,
    personalRecords,
    moveRecords,
  });
  assert.equal(state.player.activePartySlotIndex, 3);
  assert.equal(state.opponent.activePartySlotIndex, 5);
  assert.equal(state.player.pokemon.currentHp, 5);
  assert.equal(state.player.party[0].pokemon?.currentHp, 0);
  assert.equal(state.result, null);
  assert.match(state.messageQueue[0], /브케인/);
  assert.match(state.messageQueue[1], /꼬부기/);
  assert.deepEqual([player, opponent], before);
  player.party[1].pokemon!.currentHp = 0;
  assert.throws(
    () =>
      createPvpBattleState({
        roundIndex: 1,
        matchIndex: 0,
        player,
        opponent,
        personalRecords,
        moveRecords,
      }),
    /no battle-ready Pokemon/,
  );
});

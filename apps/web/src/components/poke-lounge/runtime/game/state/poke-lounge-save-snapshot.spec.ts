import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPokeLoungeSaveSnapshot,
  parsePokeLoungeSaveSnapshot,
} from "./poke-lounge-save-snapshot";
import { createGameStateStore, type PlayerPokemonMove } from "./game-state-store";

test("저장 스냅샷은 493번 포켓몬까지 복원한다", function testCase() {
  const store = createGameStateStore();
  store.setStarterPokemon({
    speciesId: 493,
    name: "아르세우스",
    level: 50,
    gender: "genderless",
  });

  const parsed = parsePokeLoungeSaveSnapshot(buildPokeLoungeSaveSnapshot(store));

  assert.equal(parsed?.state.playersById["player-1"]?.party[0]?.pokemon?.speciesId, 493);
  assert.equal(parsed?.state.playersById["player-1"]?.party[0]?.pokemon?.gender, "genderless");
});

test("성별이 없는 구버전 저장 스냅샷도 계속 복원한다", function testCase() {
  const store = createGameStateStore();
  store.setStarterPokemon({ speciesId: 155, name: "브케인", level: 10 });

  const parsed = parsePokeLoungeSaveSnapshot(buildPokeLoungeSaveSnapshot(store));

  assert.equal(parsed?.state.playersById["player-1"]?.party[0]?.pokemon?.gender, undefined);
});

test("저장 스냅샷은 지원 범위를 벗어난 포켓몬을 거부한다", function testCase() {
  const snapshot = buildPokeLoungeSaveSnapshot(createGameStateStore());
  snapshot.state.playersById["player-1"]!.pokemonBox = [{ speciesId: 494, name: "알", level: 1 }];

  assert.equal(parsePokeLoungeSaveSnapshot(snapshot), null);
});

test("저장 스냅샷은 중복 기술 ID를 첫 슬롯 하나로 정규화한다", function testCase() {
  const snapshot = createStarterSnapshot();
  snapshot.state.playersById["player-1"]!.party[0]!.pokemon!.moves = [
    { id: 33, name: "몸통박치기", pp: 7, maxPp: 35 },
    { id: 33, name: "몸통박치기", pp: 1, maxPp: 35 },
    { id: 43, name: "째려보기", pp: 20, maxPp: 30 },
  ];

  const moves =
    parsePokeLoungeSaveSnapshot(snapshot)?.state.playersById["player-1"]?.party[0]?.pokemon?.moves;

  assert.deepEqual(moves, [
    { id: 33, name: "몸통박치기", pp: 7, maxPp: 35 },
    { id: 43, name: "째려보기", pp: 20, maxPp: 30 },
  ]);
});

test("저장 스냅샷은 잘못된 기술 형태와 PP를 거부한다", function testCase() {
  const malformedMoves = [
    { id: 33, name: "몸통박치기", pp: -1, maxPp: 35 },
    { id: 33, name: "몸통박치기", pp: 36, maxPp: 35 },
    { id: 33, name: "몸통박치기", pp: 1, maxPp: "35" },
    { id: 468, name: "내부 기술", pp: 1, maxPp: 1 },
    { id: 33, name: "몸통박치기", pp: 0, maxPp: 0 },
    { id: 33, name: "몸통박치기", pp: 1, maxPp: 41 },
    { id: 33, pp: 1, maxPp: 35 },
  ];

  for (const malformedMove of malformedMoves) {
    const snapshot = createStarterSnapshot();
    snapshot.state.playersById["player-1"]!.party[0]!.pokemon!.moves = [
      malformedMove as PlayerPokemonMove,
    ];

    assert.equal(parsePokeLoungeSaveSnapshot(snapshot), null);
  }
});

test("스냅샷 생성 단계에서도 중복 기술 ID를 정규화한다", function testCase() {
  const store = createGameStateStore();
  store.setStarterPokemon({
    speciesId: 155,
    name: "브케인",
    level: 10,
    moves: [
      { id: 33, name: "몸통박치기", pp: 7, maxPp: 35 },
      { id: 33, name: "몸통박치기", pp: 1, maxPp: 35 },
    ],
  });

  assert.deepEqual(
    buildPokeLoungeSaveSnapshot(store).state.playersById["player-1"]?.party[0]?.pokemon?.moves,
    [{ id: 33, name: "몸통박치기", pp: 7, maxPp: 35 }],
  );
});

function createStarterSnapshot() {
  const store = createGameStateStore();
  store.setStarterPokemon({ speciesId: 155, name: "브케인", level: 10 });
  return buildPokeLoungeSaveSnapshot(store);
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPokeLoungeSaveSnapshot,
  parsePokeLoungeSaveSnapshot,
} from "./poke-lounge-save-snapshot";
import { createGameStateStore } from "./gameStateStore";

test("저장 스냅샷은 493번 포켓몬까지 복원한다", () => {
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

test("성별이 없는 구버전 저장 스냅샷도 계속 복원한다", () => {
  const store = createGameStateStore();
  store.setStarterPokemon({ speciesId: 155, name: "브케인", level: 10 });

  const parsed = parsePokeLoungeSaveSnapshot(buildPokeLoungeSaveSnapshot(store));

  assert.equal(parsed?.state.playersById["player-1"]?.party[0]?.pokemon?.gender, undefined);
});

test("저장 스냅샷은 지원 범위를 벗어난 포켓몬을 거부한다", () => {
  const snapshot = buildPokeLoungeSaveSnapshot(createGameStateStore());
  snapshot.state.playersById["player-1"]!.pokemonBox = [{ speciesId: 494, name: "알", level: 1 }];

  assert.equal(parsePokeLoungeSaveSnapshot(snapshot), null);
});

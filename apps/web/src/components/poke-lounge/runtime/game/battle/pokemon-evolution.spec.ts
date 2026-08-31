import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import { EVOLUTION_STONE_CATALOG, EVOLUTION_STONE_ITEM_IDS } from "../items/evolution-stones";
import {
  applyEvolutionStone,
  FEMALE_ITEM_EVOLUTION_METHOD,
  ITEM_EVOLUTION_METHODS,
  MALE_ITEM_EVOLUTION_METHOD,
  normalizePokemonEvolutionTable,
} from "./pokemon-evolution";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);

test.before(async () => {
  await loadRuntimeGameDataJson(async input => {
    const requestPath = readRequestPath(input);
    return new Response(JSON.stringify(readPublicJson(requestPath)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

test.after(() => resetRuntimeGameDataJsonStateForTest());

test("진화 대상 이름은 포켓몬 데이터의 한국어 종 이름을 사용한다", () => {
  const evolutionTable = normalizePokemonEvolutionTable({
    version: 1,
    species: {
      1: {
        speciesId: 1,
        name: "이상해씨",
        evolutions: [{ method: 4, parameter: 16, targetSpeciesId: 2 }],
      },
      2: {
        speciesId: 2,
        name: "이상해풀",
        evolutions: [],
      },
    },
  });

  assert.equal(evolutionTable[1]?.[0]?.targetSpeciesName, "이상해풀");
});

test("이름이 없는 구버전 데이터는 종 번호 fallback을 유지한다", () => {
  const evolutionTable = normalizePokemonEvolutionTable({
    version: 1,
    species: {
      1: {
        speciesId: 1,
        evolutions: [{ method: 4, parameter: 16, targetSpeciesId: 2 }],
      },
    },
  });

  assert.equal(evolutionTable[1]?.[0]?.targetSpeciesName, undefined);
});

test("진화의 돌 9종은 성별 전용 각성의돌을 포함한 진화 규칙 27개를 연결한다", () => {
  const evolutionTable = normalizePokemonEvolutionTable(pokemonData);
  const itemEvolutionMethods = new Set<number>(ITEM_EVOLUTION_METHODS);
  const itemEvolutionRules = Object.values(evolutionTable)
    .flat()
    .filter(rule => itemEvolutionMethods.has(rule.method));

  assert.equal(EVOLUTION_STONE_ITEM_IDS.length, 9);
  assert.equal(new Set(EVOLUTION_STONE_ITEM_IDS).size, 9);
  assert.equal(itemEvolutionRules.length, 27);
  assert.ok(itemEvolutionRules.every(rule => rule.targetSpeciesName));

  for (const [speciesId, rules] of Object.entries(evolutionTable)) {
    for (const rule of rules.filter(candidate => itemEvolutionMethods.has(candidate.method))) {
      const itemId = EVOLUTION_STONE_ITEM_IDS.find(
        candidate =>
          EVOLUTION_STONE_CATALOG[candidate].evolutionParameter === rule.parameter &&
          EVOLUTION_STONE_CATALOG[candidate].evolutionMethods.some(
            method => method === rule.method,
          ),
      );
      assert.ok(itemId);

      const result = applyEvolutionStone({
        itemId,
        pokemon: {
          speciesId: Number(speciesId),
          name: `포켓몬 #${speciesId}`,
          level: 30,
          gender:
            rule.method === MALE_ITEM_EVOLUTION_METHOD
              ? "male"
              : rule.method === FEMALE_ITEM_EVOLUTION_METHOD
                ? "female"
                : "genderless",
          status: "normal",
        },
        pokemonData,
      });

      assert.equal(result.evolved, true);
      assert.equal(result.pokemon.speciesId, rule.targetSpeciesId);
      assert.equal(result.pokemon.name, rule.targetSpeciesName);
    }
  }
});

test("각성의돌은 수컷 킬리아만 엘레이드로 진화시킨다", () => {
  const maleResult = applyEvolutionStone({
    itemId: "dawnStone",
    pokemon: {
      speciesId: 281,
      name: "킬리아",
      level: 30,
      gender: "male",
      status: "normal",
    },
    pokemonData,
  });
  const femaleResult = applyEvolutionStone({
    itemId: "dawnStone",
    pokemon: {
      speciesId: 281,
      name: "킬리아",
      level: 30,
      gender: "female",
      status: "normal",
    },
    pokemonData,
  });
  const legacyResult = applyEvolutionStone({
    itemId: "dawnStone",
    pokemon: {
      speciesId: 281,
      name: "킬리아",
      level: 30,
      status: "normal",
    },
    pokemonData,
  });

  assert.equal(maleResult.evolved, true);
  assert.equal(maleResult.pokemon.speciesId, 475);
  assert.equal(maleResult.pokemon.name, "엘레이드");
  assert.equal(femaleResult.evolved, false);
  assert.equal(legacyResult.evolved, false);
});

test("각성의돌은 암컷 눈꼬마만 눈여아로 진화시킨다", () => {
  const femaleResult = applyEvolutionStone({
    itemId: "dawnStone",
    pokemon: {
      speciesId: 361,
      name: "눈꼬마",
      level: 30,
      gender: "female",
      status: "normal",
    },
    pokemonData,
  });
  const maleResult = applyEvolutionStone({
    itemId: "dawnStone",
    pokemon: {
      speciesId: 361,
      name: "눈꼬마",
      level: 30,
      gender: "male",
      status: "normal",
    },
    pokemonData,
  });

  assert.equal(femaleResult.evolved, true);
  assert.equal(femaleResult.pokemon.speciesId, 478);
  assert.equal(femaleResult.pokemon.name, "눈여아");
  assert.equal(maleResult.evolved, false);
});

test("호환되는 진화의 돌은 종과 능력치를 바꾸고 기존 진행 상태를 유지한다", () => {
  const moves = [{ id: 98, name: "전광석화", pp: 29, maxPp: 30 }];
  const result = applyEvolutionStone({
    itemId: "thunderStone",
    pokemon: {
      speciesId: 25,
      name: "피카츄",
      level: 10,
      maxHp: 27,
      currentHp: 10,
      experience: 1_000,
      growthRate: 0,
      status: "normal",
      individualValues: {
        hp: 0,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
      },
      moves,
    },
    pokemonData,
  });

  assert.equal(result.evolved, true);
  assert.equal(result.pokemon.speciesId, 26);
  assert.equal(result.pokemon.name, "라이츄");
  assert.equal(result.pokemon.maxHp, 32);
  assert.equal(result.pokemon.currentHp, 15);
  assert.equal(result.pokemon.experience, 1_000);
  assert.equal(result.pokemon.status, "normal");
  assert.equal(result.pokemon.moves, moves);
  assert.deepEqual(result.messages, [
    "피카츄에게 천둥의돌을 사용했다!",
    "...오잉!?\n피카츄의 모습이...!",
    "축하합니다! 피카츄\n라이츄로 진화했습니다!",
  ]);
});

test("호환되지 않는 돌은 진화시키지 않고 전투불능 포켓몬은 진화 후에도 HP 0을 유지한다", () => {
  const pikachu = {
    speciesId: 25,
    name: "피카츄",
    level: 10,
    maxHp: 27,
    currentHp: 0,
    status: "fainted" as const,
    individualValues: {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    },
  };
  const incompatibleResult = applyEvolutionStone({
    itemId: "waterStone",
    pokemon: pikachu,
    pokemonData,
  });
  const compatibleResult = applyEvolutionStone({
    itemId: "thunderStone",
    pokemon: pikachu,
    pokemonData,
  });

  assert.equal(incompatibleResult.evolved, false);
  assert.equal(incompatibleResult.pokemon, pikachu);
  assert.deepEqual(incompatibleResult.messages, []);
  assert.equal(compatibleResult.evolved, true);
  assert.equal(compatibleResult.pokemon.speciesId, 26);
  assert.equal(compatibleResult.pokemon.currentHp, 0);
  assert.equal(compatibleResult.pokemon.status, "fainted");
});

function readPublicJson(publicPath: string): unknown {
  if (
    ![
      POKEMON_DATA_JSON_PATH,
      ITEM_DATA_JSON_PATH,
      LEVEL_UP_MOVE_TABLE_JSON_PATH,
      WILD_BATTLE_MOVE_SETS_JSON_PATH,
      BATTLE_POKEMON_ASSETS_JSON_PATH,
    ].includes(publicPath)
  ) {
    throw new Error(`Unexpected runtime data path: ${publicPath}`);
  }

  return JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")), "utf8"),
  );
}

function readRequestPath(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.pathname
      : new URL(input.url).pathname;
}

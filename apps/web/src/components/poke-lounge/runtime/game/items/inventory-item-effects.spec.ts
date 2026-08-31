import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getExperienceForLevel } from "../battle/experience";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import type { PlayerPokemon } from "../state/gameStateStore";
import { applyInventoryItemEffect } from "./inventoryItemEffects";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test("고급상처약은 ROM 이름과 회복량 200을 사용한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  await loadRuntimeGameDataJson(createGameDataFetcher(pokemonData, levelUpMoveTable));

  try {
    const result = applyInventoryItemEffect("hyperPotion", {
      name: "치코리타",
      currentHp: 10,
      maxHp: 300,
      status: "normal" as const,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.pokemon.currentHp, 210);
      assert.equal(result.messages[0], "치코리타에게 고급상처약을 사용했다!");
    }
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("이상한사탕 레벨업은 경험치를 보정하고 레벨 진화를 적용한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  await loadRuntimeGameDataJson(createGameDataFetcher(pokemonData, levelUpMoveTable));

  try {
    const level13Experience = getExperienceForLevel(13, 3) + 100;
    const pokemon: PlayerPokemon = {
      speciesId: 155,
      name: "브케인",
      level: 13,
      experience: level13Experience,
      currentHp: 30,
      maxHp: 30,
      status: "normal",
      individualValues: {
        hp: 0,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
      },
      moves: [
        { id: 33, name: "몸통박치기", pp: 35, maxPp: 35 },
        { id: 43, name: "째려보기", pp: 30, maxPp: 30 },
        { id: 108, name: "연막", pp: 20, maxPp: 20 },
        { id: 52, name: "불꽃세례", pp: 25, maxPp: 25 },
      ],
    };

    const result = applyInventoryItemEffect("rareCandy", pokemon);

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    const level14Experience = getExperienceForLevel(14, 3);

    assert.equal(result.pokemon.speciesId, 156);
    assert.equal(result.pokemon.name, "마그케인");
    assert.equal(result.pokemon.level, 14);
    assert.equal(result.pokemon.growthRate, 3);
    assert.equal(result.pokemon.experience, level14Experience);
    assert.equal(result.pokemon.currentHp, result.pokemon.maxHp);
    assert.ok((result.pokemon.maxHp ?? 0) > (pokemon.maxHp ?? 0));
    assert.ok(level14Experience > level13Experience);
    assert.ok(level14Experience < getExperienceForLevel(15, 3));
    assert.deepEqual(result.pokemon.moves, pokemon.moves);
    assert.deepEqual(result.pendingMoveReplacements, []);
    assert.ok(
      result.messages.some(
        message => message.includes("마그케인") && message.includes("진화했습니다"),
      ),
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("Lv.9 캐터피에게 이상한사탕을 쓰면 버터플까지 연쇄 진화하고 Lv.10 기술을 배운다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  await loadRuntimeGameDataJson(createGameDataFetcher(pokemonData, levelUpMoveTable));

  try {
    const pokemon: PlayerPokemon = {
      speciesId: 10,
      name: "캐터피",
      level: 9,
      currentHp: 20,
      maxHp: 20,
      status: "normal",
      individualValues: {
        hp: 0,
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
      },
      moves: [
        { id: 33, name: "몸통박치기", pp: 35, maxPp: 35 },
        { id: 81, name: "실뿜기", pp: 40, maxPp: 40 },
      ],
    };

    const result = applyInventoryItemEffect("rareCandy", pokemon);

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(result.pokemon.level, 10);
    assert.equal(result.pokemon.speciesId, 12);
    assert.equal(result.pokemon.name, "버터플");
    assert.deepEqual(
      result.pokemon.moves?.map(move => move.id),
      [33, 81, 93],
    );
    assert.deepEqual(result.pendingMoveReplacements, []);
    assert.deepEqual(result.messages, [
      "캐터피에게 이상한사탕을 사용했다!",
      "캐터피의 레벨이 올랐다!",
      "...오잉!?\n캐터피의 모습이...!",
      "축하합니다! 캐터피\n단데기로 진화했습니다!",
      "...오잉!?\n단데기의 모습이...!",
      "축하합니다! 단데기\n버터플로 진화했습니다!",
      "버터플은 염동력을 배웠다!",
    ]);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

function readPublicJson(publicPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")), "utf8"),
  );
}

const createGameDataFetcher =
  (pokemonData: unknown, levelUpMoveTable: unknown): typeof fetch =>
  async input => {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    const responseData =
      requestPath === POKEMON_DATA_JSON_PATH
        ? pokemonData
        : requestPath === LEVEL_UP_MOVE_TABLE_JSON_PATH
          ? levelUpMoveTable
          : requestPath === ITEM_DATA_JSON_PATH ||
              requestPath === WILD_BATTLE_MOVE_SETS_JSON_PATH ||
              requestPath === BATTLE_POKEMON_ASSETS_JSON_PATH
            ? readPublicJson(requestPath)
            : undefined;

    if (responseData === undefined) {
      return new Response(null, { status: 404 });
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

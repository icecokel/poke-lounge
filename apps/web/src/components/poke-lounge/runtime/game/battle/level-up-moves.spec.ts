import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  normalizeLevelUpMoveTable,
  POKEMON_DATA_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  type LevelUpMoveRow,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import { MAX_SUPPORTED_POKEMON_SPECIES_ID } from "./pokemon-species";
import { createSampleBattleState } from "./battle-sample-state";
import { planLevelUpBattleProgression } from "./level-up-progression";
import { createBattleMoveFromRom, planLevelUpBattleMoves } from "./level-up-moves";
import { normalizePokemonEvolutionTable } from "./pokemon-evolution";
import type { RomPersonalRecordCollection, RomRefinedMoveCollection } from "./wild-battle-factory";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test("ROM 한국어 기술명은 코드형 fallback 대신 상대 기술명에 사용한다", async function testCase() {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH) as PokemonDataJson;
  const moveRecords = pokemonData as unknown as RomRefinedMoveCollection;

  await loadRuntimeGameDataJson(
    createRuntimeGameDataFetcher(new Map([[POKEMON_DATA_JSON_PATH, pokemonData]])),
  );

  try {
    assert.equal(createBattleMoveFromRom(78, moveRecords).name, "저리가루");
    assert.equal(createBattleMoveFromRom(200, moveRecords).name, "역린");
    assert.deepEqual(createBattleMoveFromRom(111, moveRecords), {
      id: 111,
      name: "웅크리기",
      pp: 40,
      maxPp: 40,
      type: "노말",
      typeId: 0,
      category: "status",
      effectCode: 156,
      effectChance: 0,
      priority: 0,
      accuracy: 0,
      power: 0,
    });
    assert.equal(createBattleMoveFromRom(34, moveRecords).effectChance, 30);
    assert.equal(createBattleMoveFromRom(18, moveRecords).priority, -6);
    assert.equal(createBattleMoveFromRom(95, moveRecords).accuracy, 60);
    assert.equal(pokemonData.moves["111"]?.range, 16);
    assert.equal(
      createBattleMoveFromRom(97, moveRecords).competitiveEffectSupport,
      "unsupported-primary",
    );
    assert.equal(createBattleMoveFromRom(82, moveRecords).competitiveEffectSupport, undefined);
    assert.equal(
      createBattleMoveFromRom(69, moveRecords).competitiveEffectSupport,
      "unsupported-primary",
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("전국도감 1~493의 레벨업 기술표와 기술 참조가 완전하다", function testCase() {
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH) as LevelUpMoveTableJson;
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH) as PokemonDataJson;
  const moveRecords = pokemonData as unknown as RomRefinedMoveCollection;
  const romMoveIds = new Set(
    Array.isArray(moveRecords.moves)
      ? moveRecords.moves.map(function mapItem(move) {
          return "id" in move ? move.id : move.index;
        })
      : Object.keys(moveRecords.moves).map(Number),
  );
  const missingSpeciesIds: number[] = [];
  const emptyLearnsetSpeciesIds: number[] = [];
  const invalidRows: string[] = [];
  const missingMoveRecordIds = new Set<number>();
  const missingMoveNameIds = new Set<number>();
  const mismatchedPokemonDataSpeciesIds: number[] = [];

  for (let speciesId = 1; speciesId <= MAX_SUPPORTED_POKEMON_SPECIES_ID; speciesId += 1) {
    const rows = levelUpMoveTable.species[String(speciesId)];

    if (!rows) {
      missingSpeciesIds.push(speciesId);
      continue;
    }
    if (rows.length === 0) {
      emptyLearnsetSpeciesIds.push(speciesId);
    }

    rows.forEach(function visitItem(row, rowIndex) {
      if (
        !Number.isInteger(row.level) ||
        row.level < 1 ||
        row.level > 100 ||
        !Number.isInteger(row.moveId) ||
        row.moveId < 1
      ) {
        invalidRows.push(`${speciesId}:${rowIndex}`);
      }
      if (!romMoveIds.has(row.moveId)) {
        missingMoveRecordIds.add(row.moveId);
      }
      if (!pokemonData.moves[String(row.moveId)]?.name?.trim()) {
        missingMoveNameIds.add(row.moveId);
      }
    });

    if (
      JSON.stringify(pokemonData.species[String(speciesId)]?.levelUpMoves) !== JSON.stringify(rows)
    ) {
      mismatchedPokemonDataSpeciesIds.push(speciesId);
    }
  }

  assert.deepEqual(missingSpeciesIds, []);
  assert.deepEqual(emptyLearnsetSpeciesIds, []);
  assert.deepEqual(invalidRows, []);
  assert.deepEqual([...missingMoveRecordIds], []);
  assert.deepEqual([...missingMoveNameIds], []);
  assert.deepEqual(mismatchedPokemonDataSpeciesIds, []);
});

test("필수 ROM 게임 데이터를 불러오지 못하면 런타임 데이터 로딩을 완료하지 않는다", async function testCase() {
  for (const missingPath of [LEVEL_UP_MOVE_TABLE_JSON_PATH, ITEM_DATA_JSON_PATH]) {
    resetRuntimeGameDataJsonStateForTest();

    await assert.rejects(
      loadRuntimeGameDataJson(async function callback(input) {
        const requestPath =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.pathname
              : new URL(input.url).pathname;

        if (requestPath === missingPath) {
          return new Response(null, { status: 503 });
        }

        return new Response(JSON.stringify(readPublicJson(requestPath)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
      /Test ROM document .* failed: 503/,
    );
  }
});

test("레벨업 기술 정규화는 같은 레벨의 원본 기술 순서를 유지한다", function testCase() {
  const normalized = normalizeLevelUpMoveTable({
    version: 1,
    species: {
      "6": [
        { level: 10, moveId: 108 },
        { level: 1, moveId: 337 },
        { level: 1, moveId: 421 },
        { level: 1, moveId: 403 },
        { level: 1, moveId: 10 },
        { level: 7, moveId: 52 },
      ],
    },
  });

  assert.deepEqual(normalized?.[6], [
    { level: 1, moveId: 337 },
    { level: 1, moveId: 421 },
    { level: 1, moveId: 403 },
    { level: 1, moveId: 10 },
    { level: 7, moveId: 52 },
    { level: 10, moveId: 108 },
  ]);
});

test("여러 레벨에서 같은 기술을 만나도 교체 대기열에는 한 번만 추가한다", async function testCase() {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  const moveRecords = pokemonData as RomRefinedMoveCollection;

  await loadRuntimeGameDataJson(
    createRuntimeGameDataFetcher(
      new Map([
        [POKEMON_DATA_JSON_PATH, pokemonData],
        [LEVEL_UP_MOVE_TABLE_JSON_PATH, levelUpMoveTable],
      ]),
    ),
  );

  try {
    const basePokemon = createSampleBattleState().player.pokemon;
    const planned = planLevelUpBattleMoves({
      pokemon: {
        ...basePokemon,
        speciesId: 96,
        name: "슬리프",
        level: 32,
        moves: [33, 45, 52, 98].map(function mapItem(moveId) {
          return createBattleMoveFromRom(moveId, moveRecords);
        }),
      },
      previousLevel: 14,
      moveRecords,
    });
    const pendingMoveIds = planned.pendingMoves.map(function mapItem(move) {
      return move.id;
    });

    assert.deepEqual(pendingMoveIds, [29, 139, 96, 60, 244]);
    assert.equal(new Set(pendingMoveIds).size, pendingMoveIds.length);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("캐터피가 Lv.6에서 Lv.11이 되면 레벨별 기술 습득과 두 번의 진화를 순서대로 처리한다", async function testCase() {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const moveRecords = pokemonData as RomRefinedMoveCollection;
  const personalRecords = pokemonData as RomPersonalRecordCollection;

  await loadRuntimeGameDataJson(createRuntimeGameDataFetcher(new Map()));

  try {
    const basePokemon = createSampleBattleState().player.pokemon;
    const progression = planLevelUpBattleProgression({
      evolutionTable: normalizePokemonEvolutionTable(pokemonData),
      moveRecords,
      personalRecords,
      pokemon: {
        ...basePokemon,
        speciesId: 10,
        name: "캐터피",
        level: 11,
        currentHp: 0,
        status: "fainted",
        moves: [33, 81].map(function mapItem(moveId) {
          return createBattleMoveFromRom(moveId, moveRecords);
        }),
      },
      previousLevel: 6,
    });

    assert.equal(progression.evolved, true);
    assert.equal(progression.pokemon.speciesId, 12);
    assert.equal(progression.pokemon.name, "버터플");
    assert.equal(progression.pokemon.currentHp, 0);
    assert.equal(progression.pokemon.status, "fainted");
    assert.deepEqual(
      progression.pokemon.moves.map(function mapItem(move) {
        return move.id;
      }),
      [33, 81, 106, 93],
    );
    assert.deepEqual(progression.pendingMoveLearnings, []);
    assert.deepEqual(progression.messages, [
      "...오잉!?\n캐터피의 모습이...!",
      "축하합니다! 캐터피\n단데기로 진화했습니다!",
      "단데기는 단단해지기를 배웠다!",
      "...오잉!?\n단데기의 모습이...!",
      "축하합니다! 단데기\n버터플로 진화했습니다!",
      "버터플은 염동력을 배웠다!",
    ]);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("이상해씨가 Lv.15에서 Lv.20이 되면 진화 후 이상해풀 기술표를 사용한다", async function testCase() {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const moveRecords = pokemonData as RomRefinedMoveCollection;
  const personalRecords = pokemonData as RomPersonalRecordCollection;

  await loadRuntimeGameDataJson(createRuntimeGameDataFetcher(new Map()));

  try {
    const basePokemon = createSampleBattleState().player.pokemon;
    const progression = planLevelUpBattleProgression({
      evolutionTable: normalizePokemonEvolutionTable(pokemonData),
      moveRecords,
      personalRecords,
      pokemon: {
        ...basePokemon,
        speciesId: 1,
        name: "이상해씨",
        level: 20,
        moves: [33].map(function mapItem(moveId) {
          return createBattleMoveFromRom(moveId, moveRecords);
        }),
      },
      previousLevel: 15,
    });

    assert.equal(progression.evolved, true);
    assert.equal(progression.pokemon.speciesId, 2);
    assert.equal(progression.pokemon.name, "이상해풀");
    assert.deepEqual(
      progression.pokemon.moves.map(function mapItem(move) {
        return move.id;
      }),
      [33, 75],
    );
    assert.deepEqual(progression.pendingMoveLearnings, []);
    assert.deepEqual(progression.messages, [
      "...오잉!?\n이상해씨의 모습이...!",
      "축하합니다! 이상해씨\n이상해풀로 진화했습니다!",
      "이상해풀은 잎날가르기를 배웠다!",
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

interface LevelUpMoveTableJson {
  species: Record<string, LevelUpMoveRow[]>;
}

interface PokemonDataJson {
  species: Record<string, { levelUpMoves?: LevelUpMoveRow[] }>;
  moves: Record<
    string,
    { id: number; name?: string; effectChance?: number; priority?: number; range?: number }
  >;
}

const createRuntimeGameDataFetcher = (runtimeJsonByPath: Map<string, unknown>): typeof fetch =>
  async function callback(input) {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    const data =
      runtimeJsonByPath.get(requestPath) ??
      ([
        POKEMON_DATA_JSON_PATH,
        ITEM_DATA_JSON_PATH,
        LEVEL_UP_MOVE_TABLE_JSON_PATH,
        WILD_BATTLE_MOVE_SETS_JSON_PATH,
        BATTLE_POKEMON_ASSETS_JSON_PATH,
      ].includes(requestPath)
        ? readPublicJson(requestPath)
        : undefined);

    if (data === undefined) {
      return new Response(null, { status: 404 });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

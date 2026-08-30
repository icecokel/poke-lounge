import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  loadRuntimeGameDataJson,
  POKEMON_DATA_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
} from "../data/game-data-json";
import type { PlayerPokemon } from "../state/gameStateStore";
import {
  createWildBattleState,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "./wildBattleFactory";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const personalRecords = readPublicJson(
  "/assets/poke-lounge/extraction/personal-data.json",
) as RomPersonalRecordCollection;
const moveRecords = readPublicJson(
  "/assets/poke-lounge/extraction/refined-battle-records.json",
) as RomRefinedMoveCollection;

test("Lv.10 세 스타터는 레벨업표 기준 최근 기술 4개로 전투를 시작한다", async () => {
  await loadRuntimeGameData();

  try {
    const starterMoveIds = [
      [createPlayerPokemon(152, "치코리타"), [33, 45, 75, 77]],
      [createPlayerPokemon(155, "브케인"), [33, 43, 108, 52]],
      [createPlayerPokemon(158, "리아코"), [10, 43, 55, 99]],
    ] as const;

    for (const [starter, expectedMoveIds] of starterMoveIds) {
      const state = createBattleState(starter);

      assert.deepEqual(
        state.player.pokemon.moves.map(move => move.id),
        expectedMoveIds,
        `${starter.name}의 Lv.10 기술 구성이 올바르지 않습니다.`,
      );
    }
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("저장된 성별을 전투에 복원하고 신규 야생 포켓몬은 personal 성비로 성별을 만든다", async () => {
  await loadRuntimeGameData();

  try {
    const storedPokemonState = createBattleState({
      ...createPlayerPokemon(155, "브케인"),
      gender: "female",
    });
    const genderlessWildState = createWildBattleState({
      encounter: {
        mapKey: "test-map",
        step: {
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
        },
        speciesId: 132,
        name: "메타몽",
        level: 10,
      },
      personalRecords,
      moveRecords,
      playerParty: [{ slotIndex: 0, pokemon: createPlayerPokemon(155, "브케인") }],
      activePartySlotIndex: 0,
    });

    assert.equal(storedPokemonState.player.pokemon.gender, "female");
    assert.equal(genderlessWildState.opponent.pokemon.gender, "genderless");
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("저장된 기술 구성과 소모 PP를 다음 전투에서도 복원한다", async () => {
  await loadRuntimeGameData();

  try {
    const state = createBattleState({
      ...createPlayerPokemon(155, "브케인"),
      moves: [
        { id: 33, name: "몸통박치기", pp: 1, maxPp: 35 },
        { id: 43, name: "째려보기", pp: 2, maxPp: 30 },
        { id: 108, name: "연막", pp: 3, maxPp: 20 },
        { id: 52, name: "불꽃세례", pp: 4, maxPp: 25 },
      ],
    });

    assert.deepEqual(
      state.player.pokemon.moves.map(move => ({
        id: move.id,
        pp: move.pp,
        maxPp: move.maxPp,
      })),
      [
        { id: 33, pp: 1, maxPp: 35 },
        { id: 43, pp: 2, maxPp: 30 },
        { id: 108, pp: 3, maxPp: 20 },
        { id: 52, pp: 4, maxPp: 25 },
      ],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("구형 2기술 스타터 저장은 정규 4기술로 보정하면서 기존 PP를 유지한다", async () => {
  await loadRuntimeGameData();

  try {
    const state = createBattleState({
      ...createPlayerPokemon(155, "브케인"),
      moves: [
        { id: 52, name: "불꽃세례", pp: 7, maxPp: 25 },
        { id: 43, name: "째려보기", pp: 8, maxPp: 30 },
      ],
    });

    assert.deepEqual(
      state.player.pokemon.moves.map(move => ({
        id: move.id,
        pp: move.pp,
        maxPp: move.maxPp,
      })),
      [
        { id: 33, pp: 35, maxPp: 35 },
        { id: 43, pp: 8, maxPp: 30 },
        { id: 108, pp: 20, maxPp: 20 },
        { id: 52, pp: 7, maxPp: 25 },
      ],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("직접 구성한 3개 기술은 정규 기술표로 덮어쓰지 않는다", async () => {
  await loadRuntimeGameData();

  try {
    const state = createBattleState({
      ...createPlayerPokemon(155, "브케인"),
      moves: [
        { id: 33, name: "몸통박치기", pp: 12, maxPp: 35 },
        { id: 108, name: "연막", pp: 5, maxPp: 20 },
        { id: 52, name: "불꽃세례", pp: 3, maxPp: 25 },
      ],
    });

    assert.deepEqual(
      state.player.pokemon.moves.map(move => ({ id: move.id, pp: move.pp })),
      [
        { id: 33, pp: 12 },
        { id: 108, pp: 5 },
        { id: 52, pp: 3 },
      ],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("화상·마비와 학습 기술을 보존하고 미지원 상태기술은 롬 데이터대로 비활성화한다", async () => {
  await loadRuntimeGameData();

  try {
    for (const status of ["burned", "paralyzed"] as const) {
      assert.equal(
        createBattleState({ ...createPlayerPokemon(155, "브케인"), status }).player.pokemon.status,
        status,
      );
    }

    const dittoState = createBattleState({
      ...createPlayerPokemon(132, "메타몽"),
      moves: [{ id: 144, name: "변신", pp: 10, maxPp: 10 }],
    });

    assert.deepEqual(
      dittoState.player.pokemon.moves.map(move => move.id),
      [144],
    );
    assert.equal(dittoState.player.pokemon.moves[0]?.category, "status");
    assert.equal(dittoState.player.pokemon.moves[0]?.power, 0);
    assert.equal(
      dittoState.player.pokemon.moves[0]?.competitiveEffectSupport,
      "unsupported-primary",
    );

    const mixedMoveState = createBattleState({
      ...createPlayerPokemon(152, "치코리타"),
      moves: [
        { id: 33, name: "몸통박치기", pp: 35, maxPp: 35 },
        { id: 235, name: "광합성", pp: 5, maxPp: 5 },
      ],
    });

    assert.deepEqual(
      mixedMoveState.player.pokemon.moves.map(move => move.id),
      [33, 235],
    );
    assert.equal(
      mixedMoveState.player.pokemon.moves[1]?.competitiveEffectSupport,
      "unsupported-primary",
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

function createPlayerPokemon(speciesId: number, name: string): PlayerPokemon {
  return {
    speciesId,
    name,
    level: 10,
  };
}

function createBattleState(playerPokemon: PlayerPokemon) {
  return createWildBattleState({
    encounter: {
      mapKey: "test-map",
      step: {
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      },
      speciesId: 1,
      name: "이상해씨",
      level: 10,
    },
    personalRecords,
    moveRecords,
    playerParty: [{ slotIndex: 0, pokemon: playerPokemon }],
    activePartySlotIndex: 0,
  });
}

async function loadRuntimeGameData(): Promise<void> {
  const runtimeJsonByPath = new Map<string, unknown>([
    [POKEMON_DATA_JSON_PATH, readPublicJson(POKEMON_DATA_JSON_PATH)],
    [LEVEL_UP_MOVE_TABLE_JSON_PATH, readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH)],
    [WILD_BATTLE_MOVE_SETS_JSON_PATH, readPublicJson(WILD_BATTLE_MOVE_SETS_JSON_PATH)],
    [BATTLE_POKEMON_ASSETS_JSON_PATH, readPublicJson(BATTLE_POKEMON_ASSETS_JSON_PATH)],
  ]);

  await loadRuntimeGameDataJson(createRuntimeGameDataFetcher(runtimeJsonByPath));
}

function readPublicJson(publicPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")), "utf8"),
  );
}

const createRuntimeGameDataFetcher =
  (runtimeJsonByPath: Map<string, unknown>): typeof fetch =>
  async input => {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    const data = runtimeJsonByPath.get(requestPath);

    if (data === undefined) {
      return new Response(null, { status: 404 });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

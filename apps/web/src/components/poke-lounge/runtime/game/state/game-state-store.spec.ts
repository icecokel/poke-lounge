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
  registerRuntimeShopItemRomIds,
  resetRuntimeGameDataJsonStateForTest,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import {
  createDefaultGameState,
  createDefaultLocalPlayer,
  createGameStateStore,
  getShopItemById,
  type PlayerPokemon,
} from "./gameStateStore";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

const createPokemon = (
  speciesId: number,
  name: string,
  overrides: Partial<PlayerPokemon> = {},
): PlayerPokemon => ({
  speciesId,
  name,
  level: 10,
  currentHp: 30,
  maxHp: 30,
  status: "normal",
  ...overrides,
});

test("새 플레이어는 몬스터볼 10개를 기본 지급받는다", () => {
  const localPlayer = createDefaultLocalPlayer();

  assert.deepEqual(localPlayer.inventory, {
    pokeball: 10,
  });
});

test("상점은 랭크와 무관하게 ROM의 일반·희귀 품목을 판매한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  await loadRuntimeGameDataJson(createPokemonDataFetcher(pokemonData));
  registerPublicShopCatalogs();

  try {
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.wallet.pokeDollars = 15_000;
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    assert.equal(getShopItemById("potion")?.displayName, "상처약");
    assert.deepEqual(store.buyPremiumShopItem("dawnStone", 1), { ok: true });
    assert.deepEqual(store.buyPremiumShopItem("thunderStone", 1), { ok: true });
    assert.deepEqual(store.buyShopItem("antidote", 1), { ok: true });
    assert.deepEqual(store.buyPremiumShopItem("rareCandy", 1), { ok: true });
    assert.equal(store.getCurrentLocalPlayer().wallet.pokeDollars, 5_900);
    assert.equal(store.getCurrentLocalPlayer().inventory.dawnStone, 1);
    assert.equal(store.getCurrentLocalPlayer().inventory.thunderStone, 1);
    assert.equal(store.getCurrentLocalPlayer().inventory.antidote, 1);
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, 1);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("상점별 API 카탈로그가 판매 허용 목록을 결정한다", async () => {
  await loadRuntimeGameDataJson(createPokemonDataFetcher(readPublicJson(POKEMON_DATA_JSON_PATH)));

  try {
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.wallet.pokeDollars = 10_000;
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    assert.deepEqual(store.buyShopItem("rareCandy", 1), {
      ok: false,
      reason: "unknown-item",
    });
    registerRuntimeShopItemRomIds("basic", [50]);
    registerRuntimeShopItemRomIds("premium", [17]);
    assert.deepEqual(store.buyShopItem("rareCandy", 1), { ok: true });
    assert.deepEqual(store.buyShopItem("potion", 1), { ok: false, reason: "unknown-item" });
    assert.deepEqual(store.buyPremiumShopItem("potion", 1), { ok: true });
    assert.deepEqual(store.buyPremiumShopItem("rareCandy", 1), {
      ok: false,
      reason: "unknown-item",
    });
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

function registerPublicShopCatalogs(): void {
  const itemData = readPublicJson(ITEM_DATA_JSON_PATH) as {
    shopCatalogs: { basic: number[]; premium: number[] };
  };
  registerRuntimeShopItemRomIds("basic", itemData.shopCatalogs.basic);
  registerRuntimeShopItemRomIds("premium", itemData.shopCatalogs.premium);
}

test("솔로 챌린지 완료는 공개 경쟁 점수와 분리된 일반 결과를 만든다", () => {
  const store = createGameStateStore();
  const playerId = store.getState().currentPlayerId;

  store.completeSoloChallenge(true, 1_234);

  assert.equal(store.getState().round.phase, "game-result");
  assert.equal(store.getState().round.phaseStartedAtMs, 1_234);
  assert.equal(store.getState().tournament.scoresByPlayerId[playerId], 100);
  assert.deepEqual(store.getCurrentLocalPlayer().competitive, { rank: null, score: 0 });

  store.completeSoloChallenge(false, 2_345);

  assert.equal(store.getState().tournament.scoresByPlayerId[playerId], 0);
  assert.deepEqual(store.getCurrentLocalPlayer().competitive, { rank: null, score: 0 });
});

test("진화의 돌은 호환될 때만 적용하고 성공한 경우에만 한 개를 소비한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  await loadRuntimeGameDataJson(createPokemonDataFetcher(pokemonData));

  try {
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.party = [
      {
        slotIndex: 0,
        pokemon: createPokemon(25, "피카츄", {
          currentHp: 10,
          maxHp: 27,
          individualValues: {
            hp: 0,
            attack: 0,
            defense: 0,
            specialAttack: 0,
            specialDefense: 0,
            speed: 0,
          },
        }),
      },
    ];
    localPlayer.inventory = {
      thunderStone: 2,
      waterStone: 1,
    };
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    assert.deepEqual(store.useInventoryItemOnPartySlot("waterStone", 0), {
      ok: false,
      itemId: "waterStone",
      reason: "no-effect",
      message: "효과가 없다.",
    });
    assert.equal(store.getCurrentLocalPlayer().inventory.waterStone, 1);

    const result = store.useInventoryItemOnPartySlot("thunderStone", 0);
    assert.equal(result.ok, true);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.speciesId, 26);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.name, "라이츄");
    assert.equal(store.getCurrentLocalPlayer().inventory.thunderStone, 1);
    assert.equal(store.getCurrentLocalPlayer().inventory.waterStone, 1);
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("각성의돌은 성별 조건이 맞을 때만 소비한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  await loadRuntimeGameDataJson(createPokemonDataFetcher(pokemonData));

  try {
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.party = [
      {
        slotIndex: 0,
        pokemon: createPokemon(281, "킬리아", { gender: "female", level: 30 }),
      },
      {
        slotIndex: 1,
        pokemon: createPokemon(281, "킬리아", { gender: "male", level: 30 }),
      },
    ];
    localPlayer.inventory = { dawnStone: 1 };
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    assert.deepEqual(store.useInventoryItemOnPartySlot("dawnStone", 0), {
      ok: false,
      itemId: "dawnStone",
      reason: "no-effect",
      message: "효과가 없다.",
    });
    assert.equal(store.getCurrentLocalPlayer().inventory.dawnStone, 1);

    const result = store.useInventoryItemOnPartySlot("dawnStone", 1);

    assert.equal(result.ok, true);
    assert.equal(store.getCurrentLocalPlayer().inventory.dawnStone, undefined);
    assert.equal(store.getCurrentLocalPlayer().party[1]?.pokemon?.speciesId, 475);
    assert.equal(store.getCurrentLocalPlayer().party[1]?.pokemon?.gender, "male");
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("이상한사탕은 같은 레벨의 모든 기술을 습득하거나 교체 대기로 반환한다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  await loadRuntimeGameDataJson(createPokemonDataFetcher(pokemonData, levelUpMoveTable));

  try {
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.party = [
      {
        slotIndex: 0,
        pokemon: createPokemon(1, "이상해씨", {
          level: 12,
          moves: [
            { id: 33, name: "몸통박치기", pp: 35, maxPp: 35 },
            { id: 45, name: "울음소리", pp: 40, maxPp: 40 },
            { id: 73, name: "씨뿌리기", pp: 10, maxPp: 10 },
          ],
        }),
      },
    ];
    localPlayer.inventory = { rareCandy: 1 };
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    const result = store.useInventoryItemOnPartySlot("rareCandy", 0);

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(result.pokemon.level, 13);
    assert.deepEqual(
      result.pokemon.moves?.map(move => move.id),
      [33, 45, 73, 77],
    );
    assert.deepEqual(result.pendingMoveReplacements, [
      {
        id: 79,
        name: "수면가루",
        pp: 15,
        maxPp: 15,
      },
    ]);
    assert.ok(result.messages.includes("이상해씨는 독가루를 배웠다!"));
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, 1);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.level, 12);

    const invalidResolution = store.resolveInventoryItemMoveReplacements("rareCandy", 0, []);
    assert.deepEqual(invalidResolution, {
      ok: false,
      itemId: "rareCandy",
      reason: "invalid-move-replacements",
      message: "기술 교체 선택을 완료할 수 없다.",
    });
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, 1);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.level, 12);

    const resolution = store.resolveInventoryItemMoveReplacements("rareCandy", 0, [1]);
    assert.equal(resolution.ok, true);
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, undefined);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.level, 13);
    assert.deepEqual(
      store.getCurrentLocalPlayer().party[0]?.pokemon?.moves?.map(move => move.id),
      [33, 79, 73, 77],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("이상한사탕은 기술이 이미 4개라면 기존 기술을 자동 삭제하지 않는다", async () => {
  const pokemonData = readPublicJson(POKEMON_DATA_JSON_PATH);
  const levelUpMoveTable = readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH);
  await loadRuntimeGameDataJson(createPokemonDataFetcher(pokemonData, levelUpMoveTable));

  try {
    const existingMoves = [
      { id: 33, name: "몸통박치기", pp: 35, maxPp: 35 },
      { id: 43, name: "째려보기", pp: 30, maxPp: 30 },
      { id: 108, name: "연막", pp: 20, maxPp: 20 },
      { id: 52, name: "불꽃세례", pp: 25, maxPp: 25 },
    ];
    const localPlayer = createDefaultLocalPlayer();
    localPlayer.party = [
      {
        slotIndex: 0,
        pokemon: createPokemon(155, "브케인", {
          level: 18,
          moves: existingMoves,
        }),
      },
    ];
    localPlayer.inventory = { rareCandy: 1 };
    const defaultState = createDefaultGameState();
    const store = createGameStateStore({
      initialState: {
        ...defaultState,
        currentPlayerId: localPlayer.playerId,
        playersById: { [localPlayer.playerId]: localPlayer },
      },
    });

    const result = store.useInventoryItemOnPartySlot("rareCandy", 0);

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(result.pokemon.level, 19);
    assert.deepEqual(result.pokemon.moves, existingMoves);
    assert.deepEqual(result.pendingMoveReplacements, [
      {
        id: 172,
        name: "화염자동차",
        pp: 25,
        maxPp: 25,
      },
    ]);
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, 1);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.level, 18);
    assert.deepEqual(store.getCurrentLocalPlayer().party[0]?.pokemon?.moves, existingMoves);

    const resolution = store.resolveInventoryItemMoveReplacements("rareCandy", 0, [1]);
    assert.equal(resolution.ok, true);
    assert.equal(store.getCurrentLocalPlayer().inventory.rareCandy, undefined);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.level, 19);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.speciesId, 156);
    assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.name, "마그케인");
    assert.deepEqual(
      store.getCurrentLocalPlayer().party[0]?.pokemon?.moves?.map(move => move.id),
      [33, 172, 108, 52],
    );
  } finally {
    resetRuntimeGameDataJsonStateForTest();
  }
});

test("활성 슬롯은 기절한 박스 포켓몬과 교체하지 않는다", () => {
  const localPlayer = createDefaultLocalPlayer();
  localPlayer.party = [{ slotIndex: 0, pokemon: createPokemon(1, "이상해씨") }];
  localPlayer.pokemonBox = [createPokemon(2, "이상해풀", { currentHp: 0, status: "fainted" })];
  const defaultState = createDefaultGameState();
  const store = createGameStateStore({
    initialState: {
      ...defaultState,
      currentPlayerId: localPlayer.playerId,
      playersById: { [localPlayer.playerId]: localPlayer },
    },
  });

  assert.deepEqual(store.swapPartyPokemonWithBox(0, 0), {
    ok: false,
    reason: "fainted-active-replacement",
  });
  assert.equal(store.getCurrentLocalPlayer().party[0]?.pokemon?.name, "이상해씨");
  assert.equal(store.getCurrentLocalPlayer().pokemonBox[0]?.name, "이상해풀");
});

test("기절한 포켓몬도 비활성 파티 슬롯에는 교체할 수 있다", () => {
  const localPlayer = createDefaultLocalPlayer();
  localPlayer.party = [
    { slotIndex: 0, pokemon: createPokemon(1, "이상해씨") },
    { slotIndex: 1, pokemon: createPokemon(4, "파이리") },
  ];
  localPlayer.pokemonBox = [createPokemon(2, "이상해풀", { currentHp: 0, status: "fainted" })];
  const defaultState = createDefaultGameState();
  const store = createGameStateStore({
    initialState: {
      ...defaultState,
      currentPlayerId: localPlayer.playerId,
      playersById: { [localPlayer.playerId]: localPlayer },
    },
  });

  assert.deepEqual(store.swapPartyPokemonWithBox(1, 0), { ok: true });
  assert.equal(store.getCurrentLocalPlayer().party[1]?.pokemon?.name, "이상해풀");
  assert.equal(store.getCurrentLocalPlayer().activePartySlotIndex, 0);
});

test("파티 정규화는 빈 physical slot과 활성 slot 번호를 보존한다", () => {
  const localPlayer = createDefaultLocalPlayer();
  localPlayer.party = [
    { slotIndex: 0, pokemon: createPokemon(1, "이상해씨") },
    { slotIndex: 3, pokemon: createPokemon(4, "파이리") },
  ];
  localPlayer.activePartySlotIndex = 3;
  const defaultState = createDefaultGameState();
  const store = createGameStateStore({
    initialState: {
      ...defaultState,
      currentPlayerId: localPlayer.playerId,
      playersById: { [localPlayer.playerId]: localPlayer },
    },
  });

  assert.deepEqual(
    store.getCurrentLocalPlayer().party.map(slot => slot.slotIndex),
    [0, 3],
  );
  assert.equal(store.getCurrentLocalPlayer().activePartySlotIndex, 3);

  assert.deepEqual(store.addPokemonToParty(createPokemon(7, "꼬부기")), {
    ok: true,
    destination: "party",
    slotIndex: 1,
  });
  assert.deepEqual(
    store.getCurrentLocalPlayer().party.map(slot => slot.slotIndex),
    [0, 1, 3],
  );
});

test("지원 범위를 벗어난 포켓몬은 초기 파티와 PC에서 제거한다", () => {
  const localPlayer = createDefaultLocalPlayer();
  localPlayer.party = [
    { slotIndex: 0, pokemon: createPokemon(494, "알") },
    { slotIndex: 1, pokemon: createPokemon(493, "아르세우스") },
  ];
  localPlayer.activePartySlotIndex = 1;
  localPlayer.pokemonBox = [createPokemon(494, "알"), createPokemon(493, "아르세우스")];
  const defaultState = createDefaultGameState();
  const store = createGameStateStore({
    initialState: {
      ...defaultState,
      currentPlayerId: localPlayer.playerId,
      playersById: { [localPlayer.playerId]: localPlayer },
    },
  });

  assert.deepEqual(
    store.getCurrentLocalPlayer().party.map(slot => ({
      slotIndex: slot.slotIndex,
      speciesId: slot.pokemon?.speciesId,
    })),
    [{ slotIndex: 1, speciesId: 493 }],
  );
  assert.equal(store.getCurrentLocalPlayer().activePartySlotIndex, 1);
  assert.deepEqual(
    store.getCurrentLocalPlayer().pokemonBox.map(pokemon => pokemon.speciesId),
    [493],
  );
});

function readPublicJson(publicPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")), "utf8"),
  );
}

const createPokemonDataFetcher =
  (pokemonData: unknown, levelUpMoveTable?: unknown, itemData?: unknown): typeof fetch =>
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
          ? (levelUpMoveTable ?? readPublicJson(LEVEL_UP_MOVE_TABLE_JSON_PATH))
          : requestPath === ITEM_DATA_JSON_PATH
            ? (itemData ?? readPublicJson(requestPath))
            : requestPath === WILD_BATTLE_MOVE_SETS_JSON_PATH ||
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

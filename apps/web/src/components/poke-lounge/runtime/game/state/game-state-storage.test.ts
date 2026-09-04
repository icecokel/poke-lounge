import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMOUS_GAME_STATE_STORAGE_SCOPE,
  createWebStorageGameStateStorage,
  DEFAULT_GAME_STATE_STORAGE_KEY,
  migrateGameStateStorageToLocalStorage,
} from "./game-state-storage";
import { createAuthenticatedGameStateStorageScope } from "./default-game-state-store";
import { createDefaultLocalPlayer } from "./game-state-store";

test("browser storage save는 anonymous와 authenticated scope 사이에서 노출되지 않는다", function testCase() {
  const storage = createMemoryStorage();
  let scope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
  const adapter = createWebStorageGameStateStorage({
    storage,
    getScope: () => scope,
  });
  const anonymousPlayer = createDefaultLocalPlayer("anonymous-player");
  adapter.saveLocalPlayers({
    currentPlayerId: anonymousPlayer.playerId,
    playersById: { [anonymousPlayer.playerId]: anonymousPlayer },
  });

  const accountAScope = createAuthenticatedGameStateStorageScope("account-a");
  const accountBScope = createAuthenticatedGameStateStorageScope("account-b");
  scope = accountAScope;
  assert.equal(adapter.loadLocalPlayers(), null);

  const accountPlayer = createDefaultLocalPlayer("account-player");
  adapter.saveLocalPlayers({
    currentPlayerId: accountPlayer.playerId,
    playersById: { [accountPlayer.playerId]: accountPlayer },
  });
  assert.equal(adapter.loadLocalPlayers()?.currentPlayerId, "account-player");

  scope = accountBScope;
  assert.equal(adapter.loadLocalPlayers(), null);

  const accountBPlayer = createDefaultLocalPlayer("account-b-player");
  adapter.saveLocalPlayers({
    currentPlayerId: accountBPlayer.playerId,
    playersById: { [accountBPlayer.playerId]: accountBPlayer },
  });

  scope = accountAScope;
  assert.equal(adapter.loadLocalPlayers()?.currentPlayerId, "account-player");

  scope = ANONYMOUS_GAME_STATE_STORAGE_SCOPE;
  assert.equal(adapter.loadLocalPlayers()?.currentPlayerId, "anonymous-player");

  scope = accountBScope;
  assert.equal(adapter.loadLocalPlayers()?.currentPlayerId, "account-b-player");
});

test("기존 sessionStorage 진행은 localStorage로 한 번 이전한다", function testCase() {
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  const player = createDefaultLocalPlayer("saved-player");
  createWebStorageGameStateStorage({ storage: sessionStorage }).saveLocalPlayers({
    currentPlayerId: player.playerId,
    playersById: { [player.playerId]: player },
  });

  migrateGameStateStorageToLocalStorage(sessionStorage, localStorage);

  assert.equal(sessionStorage.length, 0);
  assert.ok(localStorage.getItem(`${DEFAULT_GAME_STATE_STORAGE_KEY}:anonymous`));
  assert.equal(
    createWebStorageGameStateStorage({ storage: localStorage }).loadLocalPlayers()?.currentPlayerId,
    "saved-player",
  );
});

test("포켓몬 성별은 저장하고 구버전의 성별 없는 포켓몬도 그대로 복원한다", function testCase() {
  const storage = createMemoryStorage();
  const adapter = createWebStorageGameStateStorage({ storage });
  const player = createDefaultLocalPlayer();
  player.party = [
    {
      slotIndex: 0,
      pokemon: {
        speciesId: 281,
        name: "킬리아",
        level: 30,
        gender: "male",
      },
    },
    {
      slotIndex: 1,
      pokemon: {
        speciesId: 361,
        name: "눈꼬마",
        level: 30,
      },
    },
  ];

  adapter.saveLocalPlayers({
    currentPlayerId: player.playerId,
    playersById: { [player.playerId]: player },
  });

  const loadedParty = adapter.loadLocalPlayers()?.playersById[player.playerId]?.party;

  assert.equal(loadedParty?.[0]?.pokemon?.gender, "male");
  assert.equal(loadedParty?.[1]?.pokemon?.gender, undefined);
});

test("localStorage 복원은 잘못된 기술 PP와 플레이어 필드를 거부한다", function testCase() {
  for (const corrupt of [
    function corruptMove(payload: StoredPayloadForTest) {
      payload.playersById["player-1"].party[0].pokemon.moves[0].pp = "1";
    },
    function corruptWallet(payload: StoredPayloadForTest) {
      payload.playersById["player-1"].wallet.pokeDollars = -1;
    },
  ]) {
    const storage = createMemoryStorage();
    const adapter = createWebStorageGameStateStorage({ storage });
    const player = createDefaultLocalPlayer();
    player.party = [
      {
        slotIndex: 0,
        pokemon: {
          speciesId: 155,
          name: "브케인",
          level: 10,
          moves: [{ id: 33, name: "몸통박치기", pp: 7, maxPp: 35 }],
        },
      },
    ];
    adapter.saveLocalPlayers({
      currentPlayerId: player.playerId,
      playersById: { [player.playerId]: player },
    });

    const key = `${DEFAULT_GAME_STATE_STORAGE_KEY}:anonymous`;
    const payload = JSON.parse(storage.getItem(key)!) as StoredPayloadForTest;
    corrupt(payload);
    storage.setItem(key, JSON.stringify(payload));

    assert.equal(adapter.loadLocalPlayers(), null);
  }
});

test("localStorage 복원은 중복 기술 ID를 첫 슬롯 하나로 정규화한다", function testCase() {
  const storage = createMemoryStorage();
  const adapter = createWebStorageGameStateStorage({ storage });
  const player = createDefaultLocalPlayer();
  player.party = [
    {
      slotIndex: 0,
      pokemon: {
        speciesId: 155,
        name: "브케인",
        level: 10,
        moves: [
          { id: 33, name: "몸통박치기", pp: 7, maxPp: 35 },
          { id: 33, name: "몸통박치기", pp: 1, maxPp: 35 },
        ],
      },
    },
  ];
  adapter.saveLocalPlayers({
    currentPlayerId: player.playerId,
    playersById: { [player.playerId]: player },
  });

  assert.deepEqual(
    adapter.loadLocalPlayers()?.playersById[player.playerId]?.party[0]?.pokemon?.moves,
    [{ id: 33, name: "몸통박치기", pp: 7, maxPp: 35 }],
  );
});

test("기존 unscoped v2 저장은 검증 후 현재 scope로 이전한다", function testCase() {
  const storage = createMemoryStorage();
  const adapter = createWebStorageGameStateStorage({ storage });
  const player = createDefaultLocalPlayer("legacy-player");
  adapter.saveLocalPlayers({
    currentPlayerId: player.playerId,
    playersById: { [player.playerId]: player },
  });

  const scopedKey = `${DEFAULT_GAME_STATE_STORAGE_KEY}:anonymous`;
  storage.setItem(DEFAULT_GAME_STATE_STORAGE_KEY, storage.getItem(scopedKey)!);
  storage.removeItem(scopedKey);

  assert.equal(adapter.loadLocalPlayers()?.currentPlayerId, player.playerId);
  assert.equal(storage.getItem(DEFAULT_GAME_STATE_STORAGE_KEY), null);
  assert.ok(storage.getItem(scopedKey));
});

interface StoredPayloadForTest {
  playersById: Record<
    string,
    {
      party: Array<{
        pokemon: { moves: Array<{ pp: unknown }> };
      }>;
      wallet: { pokeDollars: unknown };
    }
  >;
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

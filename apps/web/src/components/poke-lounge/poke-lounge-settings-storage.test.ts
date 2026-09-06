import assert from "node:assert/strict";
import test from "node:test";
import {
  POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY,
  POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY,
  POKE_LOUNGE_SETTINGS_STORAGE_KEY,
  POKE_LOUNGE_SETTINGS_VERSION,
  createDefaultPokeLoungeSettings,
  getPokeLoungeVolumeLevelIndex,
  parsePokeLoungeSettings,
  readPokeLoungeSettings,
  type PokeLoungeSettingsStorage,
} from "./poke-lounge-settings-storage";

test("버전된 설정은 기본 음량 20%와 기본 UI 크기를 가진다", function testCase() {
  assert.deepEqual(createDefaultPokeLoungeSettings(), {
    version: POKE_LOUNGE_SETTINGS_VERSION,
    audio: { masterVolume: 0.2 },
    display: { uiSize: "large" },
  });
});

test("현재 버전 설정은 사용자 음량을 그대로 읽는다", function testCase() {
  const storage = createStorageFixture();
  storage.localStorage.setItem(
    POKE_LOUNGE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      version: POKE_LOUNGE_SETTINGS_VERSION,
      audio: { masterVolume: 0.8 },
      display: { uiSize: "normal" },
    }),
  );

  assert.deepEqual(readPokeLoungeSettings(storage), {
    version: POKE_LOUNGE_SETTINGS_VERSION,
    audio: { masterVolume: 0.8 },
    display: { uiSize: "normal" },
  });
});

test("버전 없는 기존 값보다 현재 기본값을 적용하고 구 키를 제거한다", function testCase() {
  const storage = createStorageFixture();
  storage.localStorage.setItem(POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY, "4");
  storage.sessionStorage.setItem(POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY, "normal");

  const settings = readPokeLoungeSettings(storage);

  assert.deepEqual(settings, createDefaultPokeLoungeSettings());
  assert.equal(storage.localStorage.getItem(POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY), null);
  assert.equal(storage.sessionStorage.getItem(POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY), null);
  assert.deepEqual(
    parsePokeLoungeSettings(storage.localStorage.getItem(POKE_LOUNGE_SETTINGS_STORAGE_KEY)),
    settings,
  );
});

test("깨진 설정은 기본값으로 복구해 다시 저장한다", function testCase() {
  const storage = createStorageFixture();
  storage.localStorage.setItem(POKE_LOUNGE_SETTINGS_STORAGE_KEY, "{broken");

  const settings = readPokeLoungeSettings(storage);

  assert.deepEqual(settings, createDefaultPokeLoungeSettings());
  assert.deepEqual(
    parsePokeLoungeSettings(storage.localStorage.getItem(POKE_LOUNGE_SETTINGS_STORAGE_KEY)),
    settings,
  );
});

test("저장된 실제 음량에 가장 가까운 UI 단계 인덱스를 계산한다", function testCase() {
  assert.equal(getPokeLoungeVolumeLevelIndex(0), 0);
  assert.equal(getPokeLoungeVolumeLevelIndex(0.2), 1);
  assert.equal(getPokeLoungeVolumeLevelIndex(0.39), 2);
  assert.equal(getPokeLoungeVolumeLevelIndex(1), 5);
});

function createStorageFixture(): PokeLoungeSettingsStorage {
  return {
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test("다른 버전의 저장값은 20%로 초기화하고 동일 버전의 음소거는 유지한다", () => {
  const storage = createStorageFixture();
  for (const version of [1, 999]) {
    storage.localStorage.setItem(
      POKE_LOUNGE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version, audio: { masterVolume: 1 }, display: { uiSize: "normal" } }),
    );
    assert.deepEqual(readPokeLoungeSettings(storage), createDefaultPokeLoungeSettings());
  }
  storage.localStorage.setItem(
    POKE_LOUNGE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      version: POKE_LOUNGE_SETTINGS_VERSION,
      audio: { masterVolume: 0 },
      display: { uiSize: "large" },
    }),
  );
  assert.equal(readPokeLoungeSettings(storage).audio.masterVolume, 0);
});

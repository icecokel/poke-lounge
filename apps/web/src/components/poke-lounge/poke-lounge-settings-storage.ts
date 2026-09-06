import {
  DEFAULT_GAME_VIEWPORT_SIZE_PRESET,
  type GameViewportSizePreset,
} from "./runtime/game/game-viewport";

export const POKE_LOUNGE_SETTINGS_VERSION = 1 as const;
export const POKE_LOUNGE_SETTINGS_STORAGE_KEY = "poke-lounge:settings";
export const POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY = "poke-lounge:volume-level";
export const POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY = "poke-lounge:ui-size";
export const POKE_LOUNGE_DEFAULT_MASTER_VOLUME = 0.2;
export const POKE_LOUNGE_VOLUME_STEPS = [
  0,
  POKE_LOUNGE_DEFAULT_MASTER_VOLUME,
  0.4,
  0.6,
  0.8,
  1,
] as const;

export interface PokeLoungeSettingsV1 {
  version: typeof POKE_LOUNGE_SETTINGS_VERSION;
  audio: {
    masterVolume: number;
  };
  display: {
    uiSize: GameViewportSizePreset;
  };
}

export type PokeLoungeSettings = PokeLoungeSettingsV1;

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PokeLoungeSettingsStorage {
  localStorage: StorageWriter;
  sessionStorage: StorageWriter;
}

export function createDefaultPokeLoungeSettings(): PokeLoungeSettings {
  return {
    version: POKE_LOUNGE_SETTINGS_VERSION,
    audio: {
      masterVolume: POKE_LOUNGE_DEFAULT_MASTER_VOLUME,
    },
    display: {
      uiSize: DEFAULT_GAME_VIEWPORT_SIZE_PRESET,
    },
  };
}

export function readPokeLoungeSettings(storage: PokeLoungeSettingsStorage): PokeLoungeSettings {
  const versioned = parsePokeLoungeSettings(
    storage.localStorage.getItem(POKE_LOUNGE_SETTINGS_STORAGE_KEY),
  );

  if (versioned) {
    removeLegacySettings(storage);
    return versioned;
  }

  const migrated = migrateLegacyPokeLoungeSettings(storage);
  writePokeLoungeSettings(storage.localStorage, migrated);
  removeLegacySettings(storage);
  return migrated;
}

export function writePokeLoungeSettings(
  storage: Pick<StorageWriter, "setItem">,
  settings: PokeLoungeSettings,
): void {
  storage.setItem(POKE_LOUNGE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function parsePokeLoungeSettings(raw: string | null): PokeLoungeSettingsV1 | null {
  if (!raw) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== POKE_LOUNGE_SETTINGS_VERSION) {
      return null;
    }

    const audio = value.audio;
    const display = value.display;
    if (
      !isRecord(audio) ||
      !isMasterVolume(audio.masterVolume) ||
      !isRecord(display) ||
      !isGameViewportSizePreset(display.uiSize)
    ) {
      return null;
    }

    return {
      version: POKE_LOUNGE_SETTINGS_VERSION,
      audio: {
        masterVolume: audio.masterVolume,
      },
      display: {
        uiSize: display.uiSize,
      },
    };
  } catch {
    return null;
  }
}

export function getPokeLoungeVolumeLevelIndex(masterVolume: number): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  POKE_LOUNGE_VOLUME_STEPS.forEach(function visitStep(step, index) {
    const distance = Math.abs(step - masterVolume);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  });

  return closestIndex;
}

function migrateLegacyPokeLoungeSettings(storage: PokeLoungeSettingsStorage): PokeLoungeSettingsV1 {
  const settings = createDefaultPokeLoungeSettings();
  const legacyVolumeLevel = Number.parseInt(
    storage.localStorage.getItem(POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY) ?? "",
    10,
  );
  const legacyUiSize = storage.sessionStorage.getItem(POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY);

  if (
    Number.isInteger(legacyVolumeLevel) &&
    legacyVolumeLevel >= 0 &&
    legacyVolumeLevel < POKE_LOUNGE_VOLUME_STEPS.length
  ) {
    settings.audio.masterVolume = POKE_LOUNGE_VOLUME_STEPS[legacyVolumeLevel];
  }

  if (isGameViewportSizePreset(legacyUiSize)) {
    settings.display.uiSize = legacyUiSize;
  }

  return settings;
}

function removeLegacySettings(storage: PokeLoungeSettingsStorage): void {
  storage.localStorage.removeItem(POKE_LOUNGE_LEGACY_VOLUME_STORAGE_KEY);
  storage.sessionStorage.removeItem(POKE_LOUNGE_LEGACY_UI_SIZE_STORAGE_KEY);
}

function isMasterVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isGameViewportSizePreset(value: unknown): value is GameViewportSizePreset {
  return value === "normal" || value === "large";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

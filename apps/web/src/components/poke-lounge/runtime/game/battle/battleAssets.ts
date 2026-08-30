import type { BattleAssetManifest, BattleAssetManifestEntry } from "./battleTypes";

export const BATTLE_ASSET_MANIFEST_PATH = "/game-data/battle-screen-assets.json";

export interface LoadedBattleAssetManifest extends BattleAssetManifest {
  byKey: Map<string, BattleAssetManifestEntry>;
}

export async function loadBattleAssetManifest(
  fetcher: typeof fetch = fetch,
): Promise<LoadedBattleAssetManifest> {
  const response = await fetcher(BATTLE_ASSET_MANIFEST_PATH);

  if (!response.ok) {
    throw new Error(`Unable to load battle asset manifest: ${response.status}`);
  }

  const manifest = normalizeBattleAssetManifest(await response.json());

  if (manifest.logicalSize.width !== 256 || manifest.logicalSize.height !== 192) {
    throw new Error("Battle asset manifest must use a 256x192 logical size.");
  }

  return {
    ...manifest,
    byKey: new Map(manifest.assets.map(asset => [asset.key, asset])),
  };
}

export function normalizeBattleAssetManifest(value: unknown): BattleAssetManifest {
  if (!isRecord(value)) {
    return { version: 1, logicalSize: { width: 256, height: 192 }, assets: [] };
  }

  const logicalSize = isRecord(value.logicalSize)
    ? {
        width: readNumber(value.logicalSize, "width") ?? 256,
        height: readNumber(value.logicalSize, "height") ?? 192,
      }
    : { width: 256, height: 192 };

  const assets = Array.isArray(value.assets)
    ? value.assets.map(normalizeBattleAsset).filter(isPresent)
    : [];

  return {
    version: readNumber(value, "version") ?? 1,
    logicalSize,
    assets,
  };
}

function normalizeBattleAsset(value: unknown): BattleAssetManifestEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = readString(value, "key");
  const path = readString(value, "path");
  const role = readString(value, "role");
  const sourceArchivePath = readString(value, "sourceArchivePath");

  if (!key || !path || !path.startsWith("/assets/") || !role || !sourceArchivePath) {
    return null;
  }

  return {
    key,
    path,
    role,
    sourceArchivePath,
    candidate: readBoolean(value, "candidate") ?? true,
    notes: Array.isArray(value.notes)
      ? value.notes.filter((note): note is string => typeof note === "string")
      : [],
  };
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function readNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function readBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const candidate = value[key];
  return typeof candidate === "boolean" ? candidate : undefined;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

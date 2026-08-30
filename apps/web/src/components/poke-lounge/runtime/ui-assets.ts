import type { UiAsset, UiAssetArchive, UiAssetManifest } from "./types";

const ROM_DUMP_MANIFEST_PATH = "/assets/poke-lounge/dump/manifest.json";
const UI_ASSET_MANIFEST_PATH = "/assets/ui/manifest.json";
const UI_ASSET_MANIFEST_PATHS = [ROM_DUMP_MANIFEST_PATH, UI_ASSET_MANIFEST_PATH];
const SUITABLE_UI_ASSET_TERMS = ["panel", "background", "frame", "menu", "button"];

export interface UiAssetManifestLoadResult {
  loaded: boolean;
  sourcePath?: string;
  manifest: UiAssetManifest | null;
}

export async function loadUiAssetManifest(
  fetcher: typeof fetch = fetch,
): Promise<UiAssetManifestLoadResult> {
  for (const path of UI_ASSET_MANIFEST_PATHS) {
    try {
      const response = await fetcher(path);

      if (!response.ok) {
        continue;
      }

      return {
        loaded: true,
        sourcePath: path,
        manifest: normalizeUiAssetManifest(await response.json(), path),
      };
    } catch {
      continue;
    }
  }

  return { loaded: false, manifest: null };
}

export function findFirstSuitableUiAsset(
  manifest: UiAssetManifest | null | undefined,
): UiAsset | null {
  if (!manifest) {
    return null;
  }

  return manifest.assets.find(isSuitableUiAsset) ?? null;
}

export function findItemIconAssets(
  manifest: UiAssetManifest | null | undefined,
  limit = 8,
): UiAsset[] {
  if (!manifest) {
    return [];
  }

  return manifest.assets
    .filter(asset => asset.role === "item-icon" && asset.path.startsWith("/assets/"))
    .slice(0, limit);
}

export function normalizeUiAssetManifest(value: unknown, sourcePath?: string): UiAssetManifest {
  if (!isRecord(value)) {
    return { version: 1, sourcePath, assets: [], archives: [] };
  }

  const version = typeof value.version === "number" ? value.version : 1;
  const manifestAssets = Array.isArray(value.assets) ? value.assets : [];
  const manifestScreens = Array.isArray(value.screens) ? value.screens : [];
  const manifestPreviews = Array.isArray(value.previews) ? value.previews : [];
  const flatAssets = [...manifestAssets, ...manifestScreens, ...manifestPreviews]
    .map((asset, index) => normalizeAsset(asset, `asset-${index}`))
    .filter(isPresent);

  const archives = Array.isArray(value.archives)
    ? value.archives.map((archive, index) => normalizeArchive(archive, index)).filter(isPresent)
    : [];

  const archiveAssets = archives.flatMap(archive => [
    ...(archive.contactSheet ? [archive.contactSheet] : []),
    ...archive.assets,
  ]);

  return {
    version,
    sourcePath,
    assets: [...flatAssets, ...archiveAssets],
    archives,
  };
}

function normalizeArchive(value: unknown, index: number): UiAssetArchive | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceArchivePath = readString(
    value,
    "source_archive_path",
    "sourceArchivePath",
    "archive_path",
    "archivePath",
  );
  const sourceArchiveFileId = readNumber(
    value,
    "source_archive_file_id",
    "sourceArchiveFileId",
    "file_id",
    "fileId",
  );
  const baseId = readString(value, "id", "slug") ?? sourceArchivePath ?? `archive-${index}`;
  const id = toDomId(baseId);
  const label =
    readString(value, "label", "name") ??
    sourceArchivePath ??
    (sourceArchiveFileId === undefined ? `Archive ${index + 1}` : `Archive ${sourceArchiveFileId}`);

  const contactSheetPath = readContactSheetPath(value);
  const contactSheetData = isRecord(value.contact_sheet) ? value.contact_sheet : value;
  const contactSheet: UiAsset | undefined = contactSheetPath
    ? {
        id: `${id}-contact-sheet`,
        archiveId: id,
        path: contactSheetPath,
        role: "contact-sheet",
        category: "contact-sheet",
        width:
          readNumber(value, "contact_sheet_width", "contactSheetWidth") ??
          readNumber(contactSheetData, "width"),
        height:
          readNumber(value, "contact_sheet_height", "contactSheetHeight") ??
          readNumber(contactSheetData, "height"),
        sourceArchivePath,
      }
    : undefined;

  const assets = Array.isArray(value.assets)
    ? value.assets
        .map((asset, assetIndex) =>
          normalizeAsset(asset, `${id}-asset-${assetIndex}`, id, sourceArchivePath),
        )
        .filter(isPresent)
    : [];

  return {
    id,
    label,
    sourceArchivePath,
    fileCount: readNumber(value, "file_count", "fileCount"),
    notes: readStringArray(value.notes),
    contactSheet,
    assets,
  };
}

function normalizeAsset(
  value: unknown,
  fallbackId: string,
  archiveId?: string,
  sourceArchivePath?: string,
): UiAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  const path = normalizePublicAssetPath(
    readString(
      value,
      "web_path",
      "webPath",
      "path",
      "public_output_file",
      "publicOutputFile",
      "public_path",
    ),
  );

  if (!path) {
    return null;
  }

  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  const role = readString(value, "role") ?? inferAssetRole(value, path, sourceArchivePath);

  return {
    id: toDomId(readString(value, "id") ?? fallbackId),
    path,
    archiveId,
    kind: readString(value, "kind"),
    role,
    category: readString(value, "category") ?? role,
    type: readString(value, "type"),
    name: readString(value, "name"),
    width,
    height,
    sourceArchivePath: sourceArchivePath ?? readString(value, "archive_path", "archivePath"),
  };
}

function isSuitableUiAsset(asset: UiAsset): boolean {
  if (!asset.path.startsWith("/assets/")) {
    return false;
  }

  const descriptor = [
    asset.kind,
    asset.role,
    asset.category,
    asset.type,
    asset.name,
    asset.id,
    asset.path,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return SUITABLE_UI_ASSET_TERMS.some(term => descriptor.includes(term));
}

function inferAssetRole(
  value: Record<string, unknown>,
  path: string,
  sourceArchivePath: string | undefined,
): string {
  const descriptor = [
    readString(value, "category"),
    readString(value, "kind"),
    readString(value, "type"),
    readString(value, "name"),
    path,
  ]
    .filter(isPresent)
    .join(" ")
    .toLowerCase();

  if (descriptor.includes("contact-sheet")) {
    return "contact-sheet";
  }

  const width = readNumber(value, "width") ?? 0;
  const height = readNumber(value, "height") ?? 0;

  if (
    descriptor.includes("item") ||
    (sourceArchivePath === "a/0/1/8" && width <= 32 && height <= 32)
  ) {
    return "item-icon";
  }

  if (
    descriptor.includes("menu") ||
    descriptor.includes("background") ||
    width >= 128 ||
    height >= 128
  ) {
    return "menu-background";
  }

  if (descriptor.includes("button") || descriptor.includes("frame")) {
    return "button-frame";
  }

  return "ui-fragment";
}

function normalizePublicAssetPath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  const normalized = path.trim();

  if (normalized.startsWith("/assets/")) {
    return normalized;
  }

  if (normalized.startsWith("/public/assets/")) {
    return normalized.replace("/public/assets/", "/assets/");
  }

  const absolutePublicIndex = normalized.indexOf("/public/assets/");
  if (absolutePublicIndex >= 0) {
    return normalized.slice(absolutePublicIndex).replace("/public/assets/", "/assets/");
  }

  if (normalized.startsWith("public/assets/")) {
    return `/${normalized.replace(/^public\//, "")}`;
  }

  if (normalized.startsWith("assets/")) {
    return `/${normalized}`;
  }

  return null;
}

function readContactSheetPath(value: Record<string, unknown>): string | null {
  const directPath = normalizePublicAssetPath(
    readString(value, "public_contact_sheet_file", "publicContactSheetFile"),
  );

  if (directPath) {
    return directPath;
  }

  if (typeof value.contact_sheet === "string") {
    return normalizePublicAssetPath(value.contact_sheet);
  }

  if (isRecord(value.contact_sheet)) {
    return normalizePublicAssetPath(
      readString(
        value.contact_sheet,
        "web_path",
        "webPath",
        "path",
        "public_output_file",
        "publicOutputFile",
        "public_path",
      ),
    );
  }

  return null;
}

function readString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function readNumber(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toDomId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

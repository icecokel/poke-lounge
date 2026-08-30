import type { UiAsset, UiAssetManifest } from "./types";
import { renderSampleMap } from "./map-sample";
import { renderRomAssetBrowser } from "./rom-asset-browser";
import { normalizeUiAssetManifest } from "./ui-assets";

const ROM_CELL_PREVIEW_MANIFEST_PATH = "/assets/poke-lounge/extraction/cell-preview-manifest.json";
const ROM_SCREENS_MANIFEST_PATH = "/assets/poke-lounge/screens/manifest.json";
const ROM_DUMP_MANIFEST_PATH = "/assets/poke-lounge/dump/manifest.json";
const UI_ASSET_MANIFEST_PATH = "/assets/ui/manifest.json";
const ROM_EXTRACTION_ASSET_INDEX_PATH = "/assets/poke-lounge/extraction/asset-index.json";
const ROM_EXTRACTION_CATALOGS = [
  {
    id: "pokemon-sprites",
    title: "Pokemon sprites",
    path: "/assets/poke-lounge/extraction/pokemon-sprite-catalog.json",
    countKeys: ["assets", "decoded_candidate_assets", "starter_front_assets"],
    sampleKeys: ["assets", "previews", "textures"],
    countLabel: "assets",
  },
  {
    id: "walking-animations",
    title: "Walking animations",
    path: "/assets/poke-lounge/extraction/walking-animation-catalog.json",
    countKeys: ["candidate_sets", "preview_links", "input_renderable_sets"],
    sampleKeys: ["previews", "candidates"],
    countLabel: "sets",
  },
  {
    id: "textures",
    title: "Textures",
    path: "/assets/poke-lounge/extraction/texture-manifest.json",
    countKeys: ["texture_entries", "decoded_pngs", "parsed_files"],
    sampleKeys: ["textures", "candidates"],
    countLabel: "textures",
  },
  {
    id: "personal-data",
    title: "Personal data",
    path: "/assets/poke-lounge/extraction/personal-data.json",
    countKeys: ["records", "personal_records"],
    sampleKeys: ["records"],
    countLabel: "records",
  },
  {
    id: "battle-data",
    title: "Battle data",
    path: "/assets/poke-lounge/extraction/battle-data.json",
    countKeys: ["items", "moves", "evolution_candidates"],
    sampleKeys: ["items", "moves"],
    countLabel: "entries",
  },
  {
    id: "evolution-data",
    title: "Evolution data",
    path: "/assets/poke-lounge/extraction/evolution-data.json",
    countKeys: ["records", "candidates", "candidate_entries"],
    sampleKeys: ["records", "candidate_analyses"],
    countLabel: "records",
  },
  {
    id: "sdat",
    title: "SDAT catalog",
    path: "/assets/poke-lounge/extraction/sdat-catalog.json",
    countKeys: ["sdat_candidates", "archives_parsed", "media_catalog_sdat_candidates"],
    sampleKeys: ["archives"],
    countLabel: "archives",
  },
] as const;
const ASSET_INDEX_CATEGORY_PRESENTATION: Record<
  string,
  { title: string; sourcePath: string; countLabel: string }
> = {
  screen: {
    title: "Screens",
    sourcePath: ROM_SCREENS_MANIFEST_PATH,
    countLabel: "screens",
  },
  cell: {
    title: "Cell previews",
    sourcePath: ROM_CELL_PREVIEW_MANIFEST_PATH,
    countLabel: "previews",
  },
  texture: {
    title: "Textures",
    sourcePath: "/assets/poke-lounge/extraction/texture-manifest.json",
    countLabel: "textures",
  },
  pokemon: {
    title: "Pokemon sprites",
    sourcePath: "/assets/poke-lounge/extraction/pokemon-sprite-catalog.json",
    countLabel: "assets",
  },
  walking: {
    title: "Walking animations",
    sourcePath: "/assets/poke-lounge/extraction/walking-animation-catalog.json",
    countLabel: "sets",
  },
  data: {
    title: "Game data",
    sourcePath: "/assets/poke-lounge/extraction/asset-index.json",
    countLabel: "catalogs",
  },
  battle: {
    title: "Battle records",
    sourcePath: "/assets/poke-lounge/extraction/refined-battle-records.json",
    countLabel: "records",
  },
  "battle-ui": {
    title: "Battle UI",
    sourcePath: "/assets/poke-lounge/extraction/battle-ui-catalog.json",
    countLabel: "archives",
  },
  sound: {
    title: "Sound subfiles",
    sourcePath: "/assets/poke-lounge/extraction/sdat-subfiles.json",
    countLabel: "subfiles",
  },
  text: {
    title: "Text candidates",
    sourcePath: "/assets/poke-lounge/extraction/text-decode-candidates.json",
    countLabel: "candidates",
  },
  message: {
    title: "Message samples",
    sourcePath: "/assets/poke-lounge/extraction/scr-msg-decoded.json",
    countLabel: "samples",
  },
  field: {
    title: "Field archives",
    sourcePath: "/assets/poke-lounge/extraction/field-archive-catalog.json",
    countLabel: "archives",
  },
};
const MAX_CANDIDATES_PER_SECTION = 8;

export type RomWebConversionMode = "screen-manifest" | "fallback-manifests";

export interface RomWebConversionData {
  mode: RomWebConversionMode;
  cellPreviewManifest?: UiAssetManifest | null;
  screenManifest: UiAssetManifest | null;
  dumpManifest: UiAssetManifest | null;
  uiManifest: UiAssetManifest | null;
  catalogSummary?: RomCatalogSummary;
  loadedPaths: string[];
  missingPaths: string[];
}

export type RomCatalogSummaryMode = "asset-index" | "fallback-catalogs" | "unavailable";

export interface RomCatalogSummary {
  mode: RomCatalogSummaryMode;
  sourcePath?: string;
  categories: RomCatalogSummaryCategory[];
  loadedPaths: string[];
  missingPaths: string[];
}

export interface RomCatalogSummaryCategory {
  id: string;
  title: string;
  sourcePath: string;
  count: number;
  countLabel: string;
  sampleAsset: RomCatalogSampleAsset | null;
}

export interface RomCatalogSampleAsset {
  path: string;
  role?: string;
  width?: number;
  height?: number;
}

export interface RomConversionCandidateSection {
  id: string;
  title: string;
  sourcePath: string;
  assets: UiAsset[];
}

export async function loadRomWebConversionData(
  fetcher: typeof fetch = fetch,
): Promise<RomWebConversionData> {
  const cellPreviewManifest = await loadOptionalManifest(fetcher, ROM_CELL_PREVIEW_MANIFEST_PATH);
  const screenManifest = await loadOptionalManifest(fetcher, ROM_SCREENS_MANIFEST_PATH);

  if (screenManifest) {
    const catalogSummary = await loadRomCatalogSummary(fetcher);

    return {
      mode: "screen-manifest",
      cellPreviewManifest,
      screenManifest,
      dumpManifest: null,
      uiManifest: null,
      catalogSummary,
      loadedPaths: [
        cellPreviewManifest ? ROM_CELL_PREVIEW_MANIFEST_PATH : null,
        ROM_SCREENS_MANIFEST_PATH,
      ].filter(isPresent),
      missingPaths: [cellPreviewManifest ? null : ROM_CELL_PREVIEW_MANIFEST_PATH].filter(isPresent),
    };
  }

  const dumpManifest = await loadOptionalManifest(fetcher, ROM_DUMP_MANIFEST_PATH);
  const uiManifest = await loadOptionalManifest(fetcher, UI_ASSET_MANIFEST_PATH);
  const catalogSummary = await loadRomCatalogSummary(fetcher);

  return {
    mode: "fallback-manifests",
    cellPreviewManifest,
    screenManifest: null,
    dumpManifest,
    uiManifest,
    catalogSummary,
    loadedPaths: [
      cellPreviewManifest ? ROM_CELL_PREVIEW_MANIFEST_PATH : null,
      dumpManifest ? ROM_DUMP_MANIFEST_PATH : null,
      uiManifest ? UI_ASSET_MANIFEST_PATH : null,
    ].filter(isPresent),
    missingPaths: [
      cellPreviewManifest ? null : ROM_CELL_PREVIEW_MANIFEST_PATH,
      ROM_SCREENS_MANIFEST_PATH,
      dumpManifest ? null : ROM_DUMP_MANIFEST_PATH,
      uiManifest ? null : UI_ASSET_MANIFEST_PATH,
    ].filter(isPresent),
  };
}

export function getUiManifestForStarterSurface(
  data: RomWebConversionData | UiAssetManifest | null | undefined,
): UiAssetManifest | null {
  if (!data) {
    return null;
  }

  if (isRomWebConversionData(data)) {
    return data.uiManifest ?? data.screenManifest ?? data.dumpManifest;
  }

  return data;
}

export function isRomWebConversionData(
  value: RomWebConversionData | UiAssetManifest,
): value is RomWebConversionData {
  return "mode" in value && "loadedPaths" in value && "missingPaths" in value;
}

export function selectRomConversionCandidateSections(
  data: RomWebConversionData,
): RomConversionCandidateSection[] {
  const cellPreviewSections = createSection(
    "rom-cell-previews",
    "ROM cell previews",
    data.cellPreviewManifest,
    getCellPreviewCandidates(data.cellPreviewManifest?.assets ?? []),
  );

  if (data.screenManifest) {
    return [
      ...cellPreviewSections,
      ...createSection(
        "source-screens",
        "ROM screen captures",
        data.screenManifest,
        getScreenCandidates(data.screenManifest.assets),
      ),
    ];
  }

  return [
    ...cellPreviewSections,
    ...createSection(
      "source-dump-candidates",
      "ROM dump screen candidates",
      data.dumpManifest,
      getScreenCandidates(data.dumpManifest?.assets ?? []),
    ),
    ...createSection(
      "rom-ui-candidates",
      "ROM UI candidates",
      data.uiManifest,
      getUiCandidates(data.uiManifest?.assets ?? []),
    ),
  ];
}

export function renderRomWebConversionPanel(data: RomWebConversionData): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "rom-conversion-panel";
  panel.dataset.romConversionPanel = data.mode;

  const header = document.createElement("header");
  header.className = "rom-conversion-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "rom-conversion-title";

  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "ROM-only layer";

  const title = document.createElement("h2");
  title.textContent = "ROM Web Conversion";

  const summary = document.createElement("p");
  summary.className = "rom-conversion-summary";
  summary.textContent =
    data.mode === "screen-manifest"
      ? "Extracted screen assets are driving this conversion layer."
      : "Fallback ROM extraction layer using decoded dump and UI manifests.";

  titleBlock.append(kicker, title, summary);
  header.append(titleBlock, createManifestStatusList(data));
  panel.append(header);
  panel.append(renderSampleMap());
  panel.append(createRomCatalogSummarySection(data.catalogSummary));

  const sections = selectRomConversionCandidateSections(data);

  if (sections.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rom-conversion-empty";
    empty.textContent = "No ROM-derived screen or UI candidates found in loaded manifests.";
    panel.append(empty);
    return panel;
  }

  const grid = document.createElement("div");
  grid.className = "rom-conversion-section-grid";

  for (const section of sections) {
    grid.append(createCandidateSection(section));
  }

  panel.append(grid);
  return panel;
}

export function renderRomWebConversionWorkspace(
  mount: HTMLElement,
  data: RomWebConversionData,
): void {
  mount.innerHTML = "";

  const screen = document.createElement("section");
  screen.className = "game-screen game-screen--rom-only";
  screen.dataset.screen = "rom-web-conversion";

  const manifest = data.screenManifest ?? data.dumpManifest ?? data.uiManifest;
  screen.append(renderRomAssetBrowser(manifest), renderRomWebConversionPanel(data));
  mount.append(screen);
}

async function loadOptionalManifest(
  fetcher: typeof fetch,
  path: string,
): Promise<UiAssetManifest | null> {
  try {
    const response = await fetcher(path);

    if (!response.ok) {
      return null;
    }

    return normalizeUiAssetManifest(await response.json(), path);
  } catch {
    return null;
  }
}

async function loadRomCatalogSummary(fetcher: typeof fetch): Promise<RomCatalogSummary> {
  const index = await loadOptionalJson(fetcher, ROM_EXTRACTION_ASSET_INDEX_PATH);

  if (index) {
    return {
      mode: "asset-index",
      sourcePath: ROM_EXTRACTION_ASSET_INDEX_PATH,
      categories: normalizeAssetIndexCatalogs(index),
      loadedPaths: [ROM_EXTRACTION_ASSET_INDEX_PATH],
      missingPaths: [],
    };
  }

  const categories: RomCatalogSummaryCategory[] = [];
  const loadedPaths: string[] = [];

  for (const catalog of ROM_EXTRACTION_CATALOGS) {
    const value = await loadOptionalJson(fetcher, catalog.path);

    if (!value) {
      continue;
    }

    loadedPaths.push(catalog.path);
    categories.push(normalizeFallbackCatalog(catalog, value));
  }

  return {
    mode: loadedPaths.length > 0 ? "fallback-catalogs" : "unavailable",
    categories,
    loadedPaths,
    missingPaths: [
      ROM_EXTRACTION_ASSET_INDEX_PATH,
      ...ROM_EXTRACTION_CATALOGS.map(catalog => catalog.path).filter(
        path => !loadedPaths.includes(path),
      ),
    ],
  };
}

async function loadOptionalJson(fetcher: typeof fetch, path: string): Promise<unknown | null> {
  try {
    const response = await fetcher(path);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function normalizeAssetIndexCatalogs(value: unknown): RomCatalogSummaryCategory[] {
  const entries = readCatalogIndexEntries(value);

  return entries.map((entry, index) => normalizeAssetIndexCatalog(entry, index)).filter(isPresent);
}

function readCatalogIndexEntries(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const directEntries = [value.catalogs, value.categories, value.entries, value.manifests].find(
    Array.isArray,
  );

  if (directEntries) {
    return directEntries;
  }

  for (const key of ["catalogs", "categories", "entries", "manifests"]) {
    const record = value[key];

    if (isRecord(record)) {
      return Object.entries(record).map(([id, entry]) =>
        isRecord(entry) ? { id, ...entry } : { id, value: entry },
      );
    }
  }

  return [];
}

function normalizeAssetIndexCatalog(
  value: unknown,
  index: number,
): RomCatalogSummaryCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawId = toDomId(readString(value, "id", "key", "category") ?? `catalog-${index + 1}`);
  const presentation = ASSET_INDEX_CATEGORY_PRESENTATION[rawId];
  const sourcePath =
    readString(value, "path", "sourcePath", "source_path", "manifest", "href") ??
    presentation?.sourcePath ??
    ROM_EXTRACTION_CATALOGS[index]?.path;

  if (!sourcePath) {
    return null;
  }

  const id = rawId;
  const fallbackCatalog = ROM_EXTRACTION_CATALOGS.find(
    catalog => catalog.id === id || catalog.path === sourcePath,
  );
  const count =
    readNumber(value, "count", "total", "asset_count", "assetCount") ??
    readStatsCount(value.stats, fallbackCatalog?.countKeys ?? ["count", "total"]) ??
    0;

  return {
    id,
    title:
      readString(value, "title", "label", "name") ??
      presentation?.title ??
      fallbackCatalog?.title ??
      formatCatalogTitle(id),
    sourcePath,
    count,
    countLabel:
      readString(value, "countLabel", "count_label", "unit") ??
      presentation?.countLabel ??
      fallbackCatalog?.countLabel ??
      "items",
    sampleAsset: normalizeSampleAsset(
      value.sampleAsset ??
        value.sample_asset ??
        value.sample ??
        firstArrayItem(value.samples) ??
        firstArrayItem(value.assets),
    ),
  };
}

function normalizeFallbackCatalog(
  catalog: (typeof ROM_EXTRACTION_CATALOGS)[number],
  value: unknown,
): RomCatalogSummaryCategory {
  return {
    id: catalog.id,
    title: catalog.title,
    sourcePath: catalog.path,
    count: readStatsCount(isRecord(value) ? value.stats : undefined, catalog.countKeys) ?? 0,
    countLabel: catalog.countLabel,
    sampleAsset: findCatalogSampleAsset(value, catalog.sampleKeys),
  };
}

function readStatsCount(stats: unknown, keys: readonly string[]): number | undefined {
  if (!isRecord(stats)) {
    return undefined;
  }

  for (const key of keys) {
    const value = stats[key];

    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

function findCatalogSampleAsset(
  value: unknown,
  sampleKeys: readonly string[],
): RomCatalogSampleAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of sampleKeys) {
    const sample = firstArrayItem(value[key]);
    const asset = normalizeSampleAsset(sample);

    if (asset) {
      return asset;
    }
  }

  return null;
}

function normalizeSampleAsset(value: unknown): RomCatalogSampleAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  const path = normalizePublicPath(
    readString(
      value,
      "web_path",
      "webPath",
      "path",
      "cataloged_web_path",
      "catalogedWebPath",
      "public_path",
      "publicPath",
    ),
  );

  if (!path) {
    return null;
  }

  return {
    path,
    role: readString(value, "role", "kind", "category", "texture_name", "textureName") ?? undefined,
    width: readNumber(value, "width"),
    height: readNumber(value, "height"),
  };
}

function normalizePublicPath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  if (path.startsWith("/assets/")) {
    return path;
  }

  if (path.startsWith("public/assets/")) {
    return `/${path.slice("public/".length)}`;
  }

  if (path.startsWith("assets/")) {
    return `/${path}`;
  }

  return null;
}

function createSection(
  id: string,
  title: string,
  manifest: UiAssetManifest | null | undefined,
  assets: UiAsset[],
): RomConversionCandidateSection[] {
  if (!manifest || assets.length === 0) {
    return [];
  }

  return [
    {
      id,
      title,
      sourcePath: manifest.sourcePath ?? "manifest source unavailable",
      assets: assets.slice(0, MAX_CANDIDATES_PER_SECTION),
    },
  ];
}

function getCellPreviewCandidates(assets: UiAsset[]): UiAsset[] {
  return assets.filter(asset => isCellPreviewCandidate(asset) && isPublicRomAsset(asset));
}

function getScreenCandidates(assets: UiAsset[]): UiAsset[] {
  return assets
    .filter(asset => isScreenCandidate(asset) && isPublicRomAsset(asset))
    .sort((left, right) => getCandidatePriority(left) - getCandidatePriority(right));
}

function getUiCandidates(assets: UiAsset[]): UiAsset[] {
  return assets
    .filter(asset => isUiCandidate(asset) && isPublicRomAsset(asset))
    .sort((left, right) => getCandidatePriority(left) - getCandidatePriority(right));
}

function isScreenCandidate(asset: UiAsset): boolean {
  const descriptor = getAssetDescriptor(asset);

  return (
    descriptor.includes("screen") ||
    descriptor.includes("capture") ||
    descriptor.includes("menu") ||
    descriptor.includes("background") ||
    descriptor.includes("contact-sheet") ||
    (asset.width !== undefined && asset.width >= 128) ||
    (asset.height !== undefined && asset.height >= 128)
  );
}

function isCellPreviewCandidate(asset: UiAsset): boolean {
  return getAssetDescriptor(asset).includes("cell-preview");
}

function isUiCandidate(asset: UiAsset): boolean {
  const descriptor = getAssetDescriptor(asset);

  return (
    descriptor.includes("button") ||
    descriptor.includes("frame") ||
    descriptor.includes("menu") ||
    descriptor.includes("background") ||
    descriptor.includes("item-icon") ||
    descriptor.includes("ui-fragment")
  );
}

function getCandidatePriority(asset: UiAsset): number {
  const descriptor = getAssetDescriptor(asset);

  if (descriptor.includes("screen") || descriptor.includes("capture")) {
    return 0;
  }

  if (descriptor.includes("menu") || descriptor.includes("background")) {
    return 1;
  }

  if (descriptor.includes("button") || descriptor.includes("frame")) {
    return 2;
  }

  if (descriptor.includes("item-icon")) {
    return 3;
  }

  if (descriptor.includes("contact-sheet")) {
    return 4;
  }

  return 5;
}

function createManifestStatusList(data: RomWebConversionData): HTMLElement {
  const list = document.createElement("ul");
  list.className = "rom-conversion-manifests";
  list.setAttribute("aria-label", "ROM conversion manifest status");

  for (const path of data.loadedPaths) {
    const item = document.createElement("li");
    item.className = "is-loaded";
    item.textContent = `${path} loaded`;
    list.append(item);
  }

  for (const path of data.missingPaths) {
    const item = document.createElement("li");
    item.className = "is-missing";
    item.textContent = `${path} missing`;
    list.append(item);
  }

  return list;
}

function createRomCatalogSummarySection(
  summary: RomCatalogSummary | null | undefined,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "rom-catalog-summary";
  section.dataset.romCatalogSummary = summary?.mode ?? "unavailable";

  const header = document.createElement("header");
  header.className = "rom-catalog-summary-header";

  const title = document.createElement("h3");
  title.textContent = "ROM catalog summary";

  const source = document.createElement("p");
  source.textContent =
    summary?.mode === "asset-index"
      ? `${summary.sourcePath} loaded`
      : summary?.mode === "fallback-catalogs"
        ? "asset-index missing; using individual extraction catalogs"
        : "No ROM extraction catalogs found";

  header.append(title, source);
  section.append(header);

  if (!summary || summary.categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rom-catalog-summary-empty";
    empty.textContent = "Catalog counts unavailable.";
    section.append(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "rom-catalog-summary-grid";

  for (const category of summary.categories) {
    grid.append(createRomCatalogSummaryCard(category));
  }

  section.append(grid);
  return section;
}

function createRomCatalogSummaryCard(category: RomCatalogSummaryCategory): HTMLElement {
  const card = document.createElement("article");
  card.className = "rom-catalog-summary-card";
  card.dataset.romCatalogCategory = category.id;

  const title = document.createElement("h4");
  title.textContent = category.title;

  const count = document.createElement("p");
  count.className = "rom-catalog-summary-count";
  count.textContent = `${formatCount(category.count)} ${category.countLabel}`;

  const source = document.createElement("p");
  source.className = "rom-catalog-summary-source";
  source.textContent = category.sourcePath;

  card.append(title, count, source);

  if (category.sampleAsset && isImageAssetPath(category.sampleAsset.path)) {
    const figure = document.createElement("figure");
    figure.className = "rom-catalog-summary-sample";

    const image = document.createElement("img");
    image.src = category.sampleAsset.path;
    image.alt = category.sampleAsset.role ?? `${category.title} sample`;
    image.loading = "lazy";

    const caption = document.createElement("figcaption");
    caption.textContent = category.sampleAsset.role ?? "sample asset";

    figure.append(image, caption);
    card.append(figure);
  }

  return card;
}

function createCandidateSection(section: RomConversionCandidateSection): HTMLElement {
  const group = document.createElement("article");
  group.className = "rom-conversion-section";
  group.dataset.romConversionSection = section.id;

  const header = document.createElement("header");
  header.className = "rom-conversion-section-header";

  const title = document.createElement("h3");
  title.textContent = section.title;

  const source = document.createElement("p");
  source.textContent = section.sourcePath;

  header.append(title, source);

  const assets = document.createElement("div");
  assets.className = "rom-conversion-assets";

  for (const asset of section.assets) {
    assets.append(createCandidateAsset(asset));
  }

  group.append(header, assets);
  return group;
}

function createCandidateAsset(asset: UiAsset): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "rom-conversion-asset";
  figure.dataset.romConversionAssetRole = asset.role ?? asset.category ?? "unknown";

  const image = document.createElement("img");
  image.src = asset.path;
  image.alt = asset.role ?? asset.name ?? asset.id;
  image.loading = "lazy";

  const caption = document.createElement("figcaption");

  const role = document.createElement("span");
  role.className = "rom-conversion-role";
  role.textContent = asset.role ?? asset.category ?? "unknown";

  const path = document.createElement("span");
  path.className = "rom-conversion-path";
  path.textContent = asset.path;

  caption.append(role, path);
  figure.append(image, caption);
  return figure;
}

function getAssetDescriptor(asset: UiAsset): string {
  return [asset.role, asset.category, asset.kind, asset.type, asset.name, asset.id, asset.path]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function isPublicRomAsset(asset: UiAsset): boolean {
  return asset.path.startsWith("/assets/");
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

function firstArrayItem(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function toDomId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCatalogTitle(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function isImageAssetPath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

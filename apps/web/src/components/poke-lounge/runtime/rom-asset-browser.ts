import type { UiAsset, UiAssetArchive, UiAssetManifest } from "./types";

const PRIORITY_ROLES = [
  "contact-sheet",
  "item-icon",
  "menu-background",
  "button-frame",
  "ui-fragment",
];
const PRIORITY_ARCHIVE_PATHS = ["a/0/1/8", "a/0/6/0", "a/0/4/6", "a/0/9/3"];
const MAX_ASSETS_PER_ARCHIVE = 12;

export function renderRomAssetBrowser(manifest: UiAssetManifest | null | undefined): HTMLElement {
  const browser = document.createElement("section");
  browser.className = "rom-asset-browser";
  browser.dataset.romAssetBrowser = manifest ? "loaded" : "empty";

  const header = document.createElement("header");
  header.className = "rom-browser-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "rom-browser-title";

  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "HGSS Graphics";

  const title = document.createElement("h2");
  title.textContent = "ROM Asset Browser";
  titleBlock.append(kicker, title);

  const source = document.createElement("p");
  source.className = "rom-browser-source";
  source.textContent = manifest?.sourcePath ?? "ROM asset manifest unavailable";

  header.append(titleBlock, source);
  browser.append(header);

  const archives = manifest ? getRenderableArchives(manifest) : [];

  if (!manifest || (manifest.assets.length === 0 && archives.length === 0)) {
    const empty = document.createElement("p");
    empty.className = "rom-browser-empty";
    empty.textContent = "ROM asset manifest unavailable";
    browser.append(empty);
    return browser;
  }

  const archiveGrid = document.createElement("div");
  archiveGrid.className = "rom-archive-grid";

  for (const archive of archives) {
    archiveGrid.append(createArchiveGroup(archive));
  }

  browser.append(archiveGrid);
  return browser;
}

function getRenderableArchives(manifest: UiAssetManifest): UiAssetArchive[] {
  if (manifest.archives && manifest.archives.length > 0) {
    const renderableArchives = manifest.archives
      .filter(archive => archive.contactSheet || archive.assets.length > 0)
      .sort((left, right) => getArchivePriority(left) - getArchivePriority(right));

    if (renderableArchives.length > 0) {
      return renderableArchives;
    }
  }

  return [
    {
      id: "manifest-assets",
      label: "Manifest assets",
      assets: manifest.assets,
    },
  ];
}

function getArchivePriority(archive: UiAssetArchive): number {
  const archivePath = archive.sourceArchivePath ?? archive.label;
  const knownPriority = PRIORITY_ARCHIVE_PATHS.indexOf(archivePath ?? "");
  if (knownPriority >= 0) {
    return knownPriority;
  }

  if (archive.assets.some(asset => asset.role === "item-icon")) {
    return PRIORITY_ARCHIVE_PATHS.length;
  }

  if (
    archive.assets.some(asset =>
      ["menu-background", "button-frame", "ui-fragment"].includes(asset.role ?? ""),
    )
  ) {
    return PRIORITY_ARCHIVE_PATHS.length + 1;
  }

  return PRIORITY_ARCHIVE_PATHS.length + 2;
}

function createArchiveGroup(archive: UiAssetArchive): HTMLElement {
  const group = document.createElement("article");
  group.className = "rom-archive-group";
  group.dataset.romArchive = archive.id;

  const header = document.createElement("header");
  header.className = "rom-archive-header";

  const title = document.createElement("h3");
  title.textContent = archive.label;

  const meta = document.createElement("p");
  meta.textContent = [
    archive.fileCount === undefined ? null : `${archive.fileCount} files`,
    archive.assets.length === 1 ? "1 asset" : `${archive.assets.length} assets`,
  ]
    .filter((item): item is string => item !== null)
    .join(" / ");

  header.append(title, meta);

  const assets = document.createElement("div");
  assets.className = "rom-asset-grid";

  for (const asset of getPrioritizedAssets(archive)) {
    assets.append(createAssetFigure(asset));
  }

  group.append(header, assets);
  return group;
}

function getPrioritizedAssets(archive: UiAssetArchive): UiAsset[] {
  const assets = archive.contactSheet
    ? [archive.contactSheet, ...archive.assets]
    : [...archive.assets];

  return assets
    .sort((left, right) => getRolePriority(left) - getRolePriority(right))
    .slice(0, MAX_ASSETS_PER_ARCHIVE);
}

function getRolePriority(asset: UiAsset): number {
  const descriptor = [asset.role, asset.category, asset.kind, asset.type]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const priority = PRIORITY_ROLES.findIndex(role => descriptor.includes(role));

  return priority === -1 ? PRIORITY_ROLES.length : priority;
}

function createAssetFigure(asset: UiAsset): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "rom-browser-asset";
  figure.dataset.romAssetRole = asset.role ?? asset.category ?? "unknown";

  const image = document.createElement("img");
  image.className = "rom-browser-image";
  image.src = asset.path;
  image.alt = asset.role ?? asset.name ?? asset.id;
  image.loading = "lazy";

  const caption = document.createElement("figcaption");
  caption.className = "rom-browser-caption";

  const role = document.createElement("span");
  role.className = "rom-browser-role";
  role.textContent = asset.role ?? asset.category ?? "unknown";

  const path = document.createElement("span");
  path.className = "rom-browser-path";
  path.textContent = asset.path;

  caption.append(role, path);
  figure.append(image, caption);
  return figure;
}

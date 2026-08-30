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

export function RomAssetBrowser({ manifest }: { manifest?: UiAssetManifest | null }) {
  const archives = manifest ? getRenderableArchives(manifest) : [];
  const empty = !manifest || (manifest.assets.length === 0 && archives.length === 0);

  return (
    <section
      className="rom-asset-browser"
      data-rom-asset-browser={manifest ? "loaded" : "empty"}
    >
      <header className="rom-browser-header">
        <div className="rom-browser-title">
          <p className="kicker">HGSS Graphics</p>
          <h2>ROM Asset Browser</h2>
        </div>
        <p className="rom-browser-source">
          {manifest?.sourcePath ?? "ROM asset manifest unavailable"}
        </p>
      </header>
      {empty ? (
        <p className="rom-browser-empty">ROM asset manifest unavailable</p>
      ) : (
        <div className="rom-archive-grid">
          {archives.map(archive => (
            <article key={archive.id} className="rom-archive-group" data-rom-archive={archive.id}>
              <header className="rom-archive-header">
                <h3>{archive.label}</h3>
                <p>
                  {[
                    archive.fileCount === undefined ? null : `${archive.fileCount} files`,
                    archive.assets.length === 1
                      ? "1 asset"
                      : `${archive.assets.length} assets`,
                  ]
                    .filter((item): item is string => item !== null)
                    .join(" / ")}
                </p>
              </header>
              <div className="rom-asset-grid">
                {getPrioritizedAssets(archive).map(asset => (
                  <figure
                    key={`${asset.id}-${asset.path}`}
                    className="rom-browser-asset"
                    data-rom-asset-role={asset.role ?? asset.category ?? "unknown"}
                  >
                    {/* The diagnostic browser intentionally renders arbitrary manifest images. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="rom-browser-image"
                      src={asset.path}
                      alt={asset.role ?? asset.name ?? asset.id}
                      loading="lazy"
                    />
                    <figcaption className="rom-browser-caption">
                      <span className="rom-browser-role">
                        {asset.role ?? asset.category ?? "unknown"}
                      </span>
                      <span className="rom-browser-path">{asset.path}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
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

  return [{ id: "manifest-assets", label: "Manifest assets", assets: manifest.assets }];
}

function getArchivePriority(archive: UiAssetArchive): number {
  const knownPriority = PRIORITY_ARCHIVE_PATHS.indexOf(
    archive.sourceArchivePath ?? archive.label ?? "",
  );
  if (knownPriority >= 0) return knownPriority;
  if (archive.assets.some(asset => asset.role === "item-icon")) return PRIORITY_ARCHIVE_PATHS.length;
  if (
    archive.assets.some(asset =>
      ["menu-background", "button-frame", "ui-fragment"].includes(asset.role ?? ""),
    )
  ) {
    return PRIORITY_ARCHIVE_PATHS.length + 1;
  }
  return PRIORITY_ARCHIVE_PATHS.length + 2;
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

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
      className="w-full max-w-[1040px] overflow-hidden rounded-lg border-4 border-[#2b3a31] bg-[#f8fbf0] shadow-[0_8px_0_#2b3a31] max-[760px]:shadow-none"
      data-rom-asset-browser={manifest ? "loaded" : "empty"}
    >
      <header className="flex items-end justify-between gap-4 border-b-4 border-[#2b3a31] bg-[#b7d7d6] px-[18px] py-3.5 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-2 max-[760px]:p-3">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#314236]">
            HGSS Graphics
          </p>
          <h2 className="m-0 text-xl leading-none font-black">ROM Asset Browser</h2>
        </div>
        <p className="m-0 max-w-[52%] text-right text-[0.78rem] font-extrabold text-[#314236] [overflow-wrap:anywhere] max-[760px]:max-w-full max-[760px]:text-left">
          {manifest?.sourcePath ?? "ROM asset manifest unavailable"}
        </p>
      </header>
      {empty ? (
        <p className="m-0 p-[18px] font-extrabold text-[#5a4335]">ROM asset manifest unavailable</p>
      ) : (
        <div className="grid max-h-[520px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5 overflow-auto p-3.5 max-[760px]:max-h-none max-[760px]:grid-cols-1 max-[760px]:p-2.5">
          {archives.map(function mapItem(archive) {
            return (
              <article
                key={archive.id}
                className="min-w-0 overflow-hidden rounded-md border-[3px] border-[#2b3a31] bg-[#fff9dd]"
                data-rom-archive={archive.id}
              >
                <header className="flex items-center justify-between gap-2.5 border-b-[3px] border-[#2b3a31] bg-[#f4dd83] px-3 py-2.5 [&_h3]:m-0 [&_h3]:min-w-0 [&_h3]:text-[0.98rem] [&_h3]:font-black [&_h3]:[overflow-wrap:anywhere] [&_p]:m-0 [&_p]:shrink-0 [&_p]:text-xs [&_p]:font-black [&_p]:text-[#314236]">
                  <h3>{archive.label}</h3>
                  <p>
                    {[
                      archive.fileCount === undefined ? null : `${archive.fileCount} files`,
                      archive.assets.length === 1 ? "1 asset" : `${archive.assets.length} assets`,
                    ]
                      .filter(function filterItem(item): item is string {
                        return item !== null;
                      })
                      .join(" / ")}
                  </p>
                </header>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(86px,1fr))] gap-2.5 p-2.5">
                  {getPrioritizedAssets(archive).map(function mapItem(asset) {
                    return (
                      <figure
                        key={`${asset.id}-${asset.path}`}
                        className="m-0 grid min-w-0 content-start gap-1.5 data-[rom-asset-role=contact-sheet]:col-[1/-1] [&[data-rom-asset-role=contact-sheet]>img]:h-40"
                        data-rom-asset-role={asset.role ?? asset.category ?? "unknown"}
                      >
                        {/* The diagnostic browser intentionally renders arbitrary manifest images. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="h-[82px] w-full rounded border-2 border-[#314236] bg-[#e5e7df] object-contain [image-rendering:pixelated]"
                          src={asset.path}
                          alt={asset.role ?? asset.name ?? asset.id}
                          loading="lazy"
                        />
                        <figcaption className="grid min-w-0 gap-[3px]">
                          <span className="text-[0.7rem] font-black text-[#17201a]">
                            {asset.role ?? asset.category ?? "unknown"}
                          </span>
                          <span className="text-[0.64rem] font-extrabold text-[#5a4335] [overflow-wrap:anywhere]">
                            {asset.path}
                          </span>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getRenderableArchives(manifest: UiAssetManifest): UiAssetArchive[] {
  if (manifest.archives && manifest.archives.length > 0) {
    const renderableArchives = manifest.archives
      .filter(function filterItem(archive) {
        return archive.contactSheet || archive.assets.length > 0;
      })
      .sort(function compareItems(left, right) {
        return getArchivePriority(left) - getArchivePriority(right);
      });

    if (renderableArchives.length > 0) return renderableArchives;
  }

  return [{ id: "manifest-assets", label: "Manifest assets", assets: manifest.assets }];
}

function getArchivePriority(archive: UiAssetArchive): number {
  const knownPriority = PRIORITY_ARCHIVE_PATHS.indexOf(
    archive.sourceArchivePath ?? archive.label ?? "",
  );
  if (knownPriority >= 0) return knownPriority;
  if (archive.assets.some(asset => asset.role === "item-icon"))
    return PRIORITY_ARCHIVE_PATHS.length;
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

import type { UiAsset } from "./types";
import { SampleMapPreview } from "./map-sample-preview";
import { RomAssetBrowser } from "./rom-asset-browser";
import {
  selectRomConversionCandidateSections,
  type RomCatalogSummary,
  type RomWebConversionData,
} from "./rom-web-conversion";

export function RomWebConversionWorkspace({ data }: { data: RomWebConversionData }) {
  const manifest = data.screenManifest ?? data.dumpManifest ?? data.uiManifest;
  return (
    <section
      className="grid min-h-dvh w-full place-items-center gap-[18px] overflow-auto bg-[var(--rom-screen-background)] p-4 max-[760px]:items-start max-[760px]:p-2.5"
      data-screen="rom-web-conversion"
    >
      <RomAssetBrowser manifest={manifest} />
      <RomWebConversionPanel data={data} />
    </section>
  );
}

export function RomWebConversionPanel({ data }: { data: RomWebConversionData }) {
  const sections = selectRomConversionCandidateSections(data);
  return (
    <section
      className="w-full max-w-[1040px] overflow-hidden rounded-lg border-4 border-[#2b3a31] bg-[#eef2e8] shadow-[0_8px_0_#2b3a31] max-[760px]:shadow-none"
      data-rom-conversion-panel={data.mode}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(220px,360px)] gap-4 border-b-4 border-[#2b3a31] bg-[#d2dccb] px-[18px] py-3.5 max-[760px]:grid-cols-1 max-[760px]:p-3">
        <div className="grid gap-1.5">
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#314236]">
            ROM-only layer
          </p>
          <h2 className="m-0 text-xl leading-none font-black">ROM Web Conversion</h2>
          <p className="m-0 max-w-[640px] text-sm font-extrabold text-[#314236]">
            {data.mode === "screen-manifest"
              ? "Extracted screen assets are driving this conversion layer."
              : "Fallback ROM extraction layer using decoded dump and UI manifests."}
          </p>
        </div>
        <ul
          className="m-0 grid content-start gap-1.5 p-0 [list-style:none] [&_li]:min-w-0 [&_li]:rounded [&_li]:border-2 [&_li]:border-[#314236] [&_li]:bg-[#f8fbf0] [&_li]:px-2 [&_li]:py-1.5 [&_li]:text-[0.68rem] [&_li]:font-black [&_li]:[overflow-wrap:anywhere]"
          aria-label="ROM conversion manifest status"
        >
          {data.loadedPaths.map(path => (
            <li key={`loaded-${path}`}>{`${path} loaded`}</li>
          ))}
          {data.missingPaths.map(path => (
            <li key={`missing-${path}`} className="border-dashed! bg-[#fff1d6]! text-[#6f1f18]">
              {`${path} missing`}
            </li>
          ))}
        </ul>
      </header>
      <SampleMapPreview />
      <RomCatalogSummarySection summary={data.catalogSummary} />
      {sections.length === 0 ? (
        <p className="m-0 p-[18px] font-extrabold text-[#5a4335]">
          No ROM-derived screen or UI candidates found in loaded manifests.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5 p-3.5 max-[760px]:grid-cols-1 max-[760px]:p-2.5">
          {sections.map(section => (
            <article
              key={section.id}
              className="min-w-0 overflow-hidden rounded-md border-[3px] border-[#2b3a31] bg-[#f8fbf0]"
              data-rom-conversion-section={section.id}
            >
              <header className="grid gap-1 border-b-[3px] border-[#2b3a31] bg-[#c7d8b8] px-3 py-2.5 [&_h3]:m-0 [&_h3]:text-[0.98rem] [&_h3]:font-black [&_p]:m-0 [&_p]:text-[0.68rem] [&_p]:font-black [&_p]:text-[#314236] [&_p]:[overflow-wrap:anywhere]">
                <h3>{section.title}</h3>
                <p>{section.sourcePath}</p>
              </header>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5 p-2.5">
                {section.assets.map(asset => (
                  <RomConversionAsset key={`${asset.id}-${asset.path}`} asset={asset} />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RomCatalogSummarySection({ summary }: { summary?: RomCatalogSummary | null }) {
  return (
    <section
      className="grid gap-3 border-b-4 border-[#2b3a31] bg-[#f8fbf0] p-3.5"
      data-rom-catalog-summary={summary?.mode ?? "unavailable"}
    >
      <header className="grid gap-1 [&_h3]:m-0 [&_h3]:font-black [&_p]:m-0 [&_p]:text-xs [&_p]:font-extrabold [&_p]:text-[#314236]">
        <h3>ROM catalog summary</h3>
        <p>
          {summary?.mode === "asset-index"
            ? `${summary.sourcePath} loaded`
            : summary?.mode === "fallback-catalogs"
              ? "asset-index missing; using individual extraction catalogs"
              : "No ROM extraction catalogs found"}
        </p>
      </header>
      {!summary || summary.categories.length === 0 ? (
        <p className="m-0 text-sm font-extrabold text-[#5a4335]">Catalog counts unavailable.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          {summary.categories.map(category => (
            <article
              key={category.id}
              className="grid min-w-0 content-start gap-1.5 rounded-md border-2 border-[#314236] bg-[#eef2e8] p-2.5 [&_h4]:m-0 [&_h4]:font-black"
              data-rom-catalog-category={category.id}
            >
              <h4>{category.title}</h4>
              <p className="m-0 text-lg font-black text-[#17201a]">
                {`${new Intl.NumberFormat("en-US").format(category.count)} ${category.countLabel}`}
              </p>
              <p className="m-0 text-[0.64rem] font-extrabold text-[#5a4335] [overflow-wrap:anywhere]">
                {category.sourcePath}
              </p>
              {category.sampleAsset && isImageAssetPath(category.sampleAsset.path) ? (
                <figure className="m-0 grid gap-1 [&_figcaption]:text-[0.64rem] [&_figcaption]:font-bold [&_img]:h-24 [&_img]:w-full [&_img]:rounded [&_img]:border-2 [&_img]:border-[#314236] [&_img]:object-contain [&_img]:[image-rendering:pixelated]">
                  {/* Diagnostics must accept arbitrary image paths from the extraction catalog. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={category.sampleAsset.path}
                    alt={category.sampleAsset.role ?? `${category.title} sample`}
                    loading="lazy"
                  />
                  <figcaption>{category.sampleAsset.role ?? "sample asset"}</figcaption>
                </figure>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RomConversionAsset({ asset }: { asset: UiAsset }) {
  return (
    <figure
      className="m-0 grid min-w-0 gap-1.5 [&_figcaption]:grid [&_figcaption]:min-w-0 [&_figcaption]:gap-[3px] [&_img]:h-24 [&_img]:w-full [&_img]:rounded [&_img]:border-2 [&_img]:border-dashed [&_img]:border-[#314236] [&_img]:bg-[#f8fbf0] [&_img]:object-contain [&_img]:[image-rendering:pixelated]"
      data-rom-conversion-asset-role={asset.role ?? asset.category ?? "unknown"}
    >
      {/* Diagnostics must accept arbitrary image paths from the extraction manifest. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.path} alt={asset.role ?? asset.name ?? asset.id} loading="lazy" />
      <figcaption>
        <span className="text-[0.7rem] font-black text-[#17201a]">
          {asset.role ?? asset.category ?? "unknown"}
        </span>
        <span className="text-[0.64rem] font-extrabold text-[#5a4335] [overflow-wrap:anywhere]">
          {asset.path}
        </span>
      </figcaption>
    </figure>
  );
}

function isImageAssetPath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

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
    <section className="game-screen game-screen--rom-only" data-screen="rom-web-conversion">
      <RomAssetBrowser manifest={manifest} />
      <RomWebConversionPanel data={data} />
    </section>
  );
}

export function RomWebConversionPanel({ data }: { data: RomWebConversionData }) {
  const sections = selectRomConversionCandidateSections(data);
  return (
    <section className="rom-conversion-panel" data-rom-conversion-panel={data.mode}>
      <header className="rom-conversion-header">
        <div className="rom-conversion-title">
          <p className="kicker">ROM-only layer</p>
          <h2>ROM Web Conversion</h2>
          <p className="rom-conversion-summary">
            {data.mode === "screen-manifest"
              ? "Extracted screen assets are driving this conversion layer."
              : "Fallback ROM extraction layer using decoded dump and UI manifests."}
          </p>
        </div>
        <ul className="rom-conversion-manifests" aria-label="ROM conversion manifest status">
          {data.loadedPaths.map(path => (
            <li key={`loaded-${path}`} className="is-loaded">{`${path} loaded`}</li>
          ))}
          {data.missingPaths.map(path => (
            <li key={`missing-${path}`} className="is-missing">{`${path} missing`}</li>
          ))}
        </ul>
      </header>
      <SampleMapPreview />
      <RomCatalogSummarySection summary={data.catalogSummary} />
      {sections.length === 0 ? (
        <p className="rom-conversion-empty">
          No ROM-derived screen or UI candidates found in loaded manifests.
        </p>
      ) : (
        <div className="rom-conversion-section-grid">
          {sections.map(section => (
            <article
              key={section.id}
              className="rom-conversion-section"
              data-rom-conversion-section={section.id}
            >
              <header className="rom-conversion-section-header">
                <h3>{section.title}</h3>
                <p>{section.sourcePath}</p>
              </header>
              <div className="rom-conversion-assets">
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
      className="rom-catalog-summary"
      data-rom-catalog-summary={summary?.mode ?? "unavailable"}
    >
      <header className="rom-catalog-summary-header">
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
        <p className="rom-catalog-summary-empty">Catalog counts unavailable.</p>
      ) : (
        <div className="rom-catalog-summary-grid">
          {summary.categories.map(category => (
            <article
              key={category.id}
              className="rom-catalog-summary-card"
              data-rom-catalog-category={category.id}
            >
              <h4>{category.title}</h4>
              <p className="rom-catalog-summary-count">
                {`${new Intl.NumberFormat("en-US").format(category.count)} ${category.countLabel}`}
              </p>
              <p className="rom-catalog-summary-source">{category.sourcePath}</p>
              {category.sampleAsset && isImageAssetPath(category.sampleAsset.path) ? (
                <figure className="rom-catalog-summary-sample">
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
      className="rom-conversion-asset"
      data-rom-conversion-asset-role={asset.role ?? asset.category ?? "unknown"}
    >
      {/* Diagnostics must accept arbitrary image paths from the extraction manifest. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.path} alt={asset.role ?? asset.name ?? asset.id} loading="lazy" />
      <figcaption>
        <span className="rom-conversion-role">{asset.role ?? asset.category ?? "unknown"}</span>
        <span className="rom-conversion-path">{asset.path}</span>
      </figcaption>
    </figure>
  );
}

function isImageAssetPath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

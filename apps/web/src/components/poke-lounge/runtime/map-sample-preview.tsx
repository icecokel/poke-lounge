import type { CSSProperties } from "react";
import {
  createSampleMapModel,
  getSampleTileVariant,
  SAMPLE_MAP_TILE_DEFINITIONS,
  type SampleMapModel,
  type SampleMapNpc,
} from "./map-sample";

export function SampleMapPreview({ model = createSampleMapModel() }: { model?: SampleMapModel }) {
  return (
    <section className="map-sample" data-map-sample={model.id}>
      <header className="map-sample-header">
        <h3>{model.name}</h3>
        <p>{`${model.width} x ${model.height} tile code map`}</p>
      </header>
      <div
        className="map-sample-board"
        style={
          {
            "--map-columns": String(model.width),
            "--map-rows": String(model.height),
          } as CSSProperties
        }
        role="img"
        aria-label="Sample ROM asset map with tree boundary, water, forest, and nurse NPC."
      >
        {model.tiles.map(tile => (
          <span
            key={`${tile.x}-${tile.y}`}
            className={`map-sample-tile map-sample-tile--${tile.code.toLowerCase()} map-sample-tile--variant-${getSampleTileVariant(tile)}`}
            data-tile-code={tile.code}
            data-tile-x={tile.x}
            data-tile-y={tile.y}
            data-tile-variant={getSampleTileVariant(tile)}
            data-blocks-movement={tile.definition.blocksMovement}
            data-encounter-rate={tile.definition.encounterRate}
            data-rom-asset={tile.definition.assetPath}
            data-rom-source={tile.definition.sourcePaths.join(",")}
            style={{ "--tile-image": `url("${tile.definition.assetPath}")` } as CSSProperties}
            aria-label={tile.definition.label}
          >
            {model.npcs
              .filter(npc => npc.x === tile.x && npc.y === tile.y)
              .map(npc => (
                <SampleMapNpcMarker key={npc.id} npc={npc} />
              ))}
          </span>
        ))}
      </div>
      <ul className="map-sample-legend">
        {(["T", "G", "F", "W", "P", "D"] as const).map(code => {
          const definition = SAMPLE_MAP_TILE_DEFINITIONS[code];
          return (
            <li key={code} data-tile-code={code}>
              {definition.encounterRate > 0
                ? `${definition.label} - encounter ${definition.encounterRate}%`
                : definition.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SampleMapNpcMarker({ npc }: { npc: SampleMapNpc }) {
  return (
    <span
      className={`map-sample-npc map-sample-npc--${npc.id}`}
      data-map-npc={npc.id}
      data-npc-x={npc.x}
      data-npc-y={npc.y}
      data-npc-placement={npc.placement}
      data-rom-asset={npc.assetPath}
      data-rom-source={npc.sourcePaths.join(",")}
      style={{ "--npc-image": `url("${npc.assetPath}")` } as CSSProperties}
      aria-label={npc.label}
    />
  );
}

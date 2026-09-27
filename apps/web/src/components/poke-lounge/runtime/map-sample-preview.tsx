import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import {
  createSampleMapModel,
  getSampleTileVariant,
  SAMPLE_MAP_TILE_DEFINITIONS,
  type SampleMapModel,
  type SampleMapNpc,
  type SampleMapTileCode,
} from "./map-sample";

export function SampleMapPreview({ model = createSampleMapModel() }: { model?: SampleMapModel }) {
  return (
    <section
      className="grid gap-3 border-b-4 border-[#2b3a31] bg-[#e7eddc] p-3.5 max-[760px]:p-2.5"
      data-map-sample={model.id}
    >
      <header className="flex items-end justify-between gap-3 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-1 [&_h3]:m-0 [&_h3]:text-base [&_h3]:font-black [&_p]:m-0 [&_p]:text-xs [&_p]:font-black [&_p]:text-[#314236]">
        <h3>{model.name}</h3>
        <p>{`${model.width} x ${model.height} tile code map`}</p>
      </header>
      <div
        className="grid w-max max-w-full overflow-auto rounded-md border-[3px] border-[#2b3a31] bg-[#24372c] p-1.5 shadow-[inset_0_0_0_3px_#879c76] [--tile-size:32px] [grid-template-columns:repeat(var(--map-columns),var(--tile-size))] [grid-template-rows:repeat(var(--map-rows),var(--tile-size))] max-[760px]:[--tile-size:clamp(22px,7vw,32px)]"
        style={
          {
            "--map-columns": String(model.width),
            "--map-rows": String(model.height),
          } as CSSProperties
        }
        role="img"
        aria-label="Sample ROM asset map with tree boundary, water, forest, and nurse NPC."
      >
        {model.tiles.map(function mapItem(tile) {
          const variant = getSampleTileVariant(tile);
          return (
            <span
              key={`${tile.x}-${tile.y}`}
              className={cn(
                "relative block h-[calc(var(--tile-size)+1px)] w-[calc(var(--tile-size)+1px)] overflow-hidden [image-rendering:pixelated] before:absolute before:-inset-px before:bg-[image:var(--tile-image)] before:bg-center before:bg-no-repeat before:bg-[length:calc(var(--tile-size)+2px)_calc(var(--tile-size)+2px)] before:[image-rendering:pixelated]",
                tileBackgroundClassName(tile.code),
                variant === 1 && "before:scale-x-[-1]",
                variant === 2 && "before:scale-y-[-1]",
                variant === 3 && "before:rotate-180",
              )}
              data-tile-code={tile.code}
              data-tile-x={tile.x}
              data-tile-y={tile.y}
              data-tile-variant={variant}
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
          );
        })}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 [&_li]:rounded [&_li]:border-2 [&_li]:border-[#314236] [&_li]:bg-[#f8fbf0] [&_li]:px-[7px] [&_li]:py-[5px] [&_li]:text-[0.68rem] [&_li]:font-black">
        {(["T", "G", "F", "W", "P", "D"] as const).map(function mapItem(code) {
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
      className="pointer-events-none absolute inset-x-0 -top-[12%] z-2 block h-[112%] w-full bg-[image:var(--npc-image)] bg-contain bg-bottom bg-no-repeat [image-rendering:pixelated]"
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

function tileBackgroundClassName(code: SampleMapTileCode): string {
  switch (code) {
    case "T":
    case "F":
      return "bg-[#3d8a4d]";
    case "G":
      return "bg-[#78b65d]";
    case "W":
      return "bg-[#2f8fc7]";
    case "P":
      return "bg-[#d9c991]";
    case "D":
      return "bg-[#8fc69a]";
  }
}

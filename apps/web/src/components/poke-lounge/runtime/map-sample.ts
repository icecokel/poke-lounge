export type SampleMapTileCode = "T" | "G" | "F" | "P" | "D" | "W";

export interface SampleMapTileDefinition {
  code: SampleMapTileCode;
  label: string;
  blocksMovement: boolean;
  encounterRate: number;
  assetPath: string;
  sourcePaths: readonly string[];
}

export interface SampleMapTile {
  code: SampleMapTileCode;
  x: number;
  y: number;
  definition: SampleMapTileDefinition;
}

export interface SampleMapNpc {
  id: "nurse";
  label: string;
  x: number;
  y: number;
  placement: "center";
  assetPath: string;
  sourcePaths: readonly string[];
}

export interface SampleMapModel {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: SampleMapTile[];
  npcs: SampleMapNpc[];
}

export const SAMPLE_MAP_TILE_DEFINITIONS: Record<SampleMapTileCode, SampleMapTileDefinition> = {
  T: {
    code: "T",
    label: "Tree boundary",
    blocksMovement: true,
    encounterRate: 0,
    assetPath: "/assets/map-sample-rom/forest.png",
    sourcePaths: [
      "public/assets/poke-lounge/dump/a_1_9_9/file_0002_pal_0004.png",
      "public/assets/poke-lounge/textures/a_0_4_4_0000/tree01_re.png",
    ],
  },
  G: {
    code: "G",
    label: "Tall grass",
    blocksMovement: false,
    encounterRate: 25,
    assetPath: "/assets/map-sample-rom/tall-grass-edge.png",
    sourcePaths: [
      "public/assets/poke-lounge/dump/a_1_9_9/file_0002_pal_0004.png",
      "public/assets/poke-lounge/textures/a_1_0_3_0021/lgrass_ani1_1.png",
    ],
  },
  F: {
    code: "F",
    label: "Forest",
    blocksMovement: true,
    encounterRate: 0,
    assetPath: "/assets/map-sample-rom/forest.png",
    sourcePaths: [
      "public/assets/poke-lounge/dump/a_1_9_9/file_0002_pal_0004.png",
      "public/assets/poke-lounge/textures/a_0_4_4_0000/tree01_re.png",
    ],
  },
  P: {
    code: "P",
    label: "Walkable path",
    blocksMovement: false,
    encounterRate: 0,
    assetPath: "/assets/map-sample-rom/walkable-path.png",
    sourcePaths: ["public/assets/poke-lounge/textures/a_0_4_4_0020/grass02_r.png"],
  },
  D: {
    code: "D",
    label: "Dirt path",
    blocksMovement: false,
    encounterRate: 0,
    assetPath: "/assets/map-sample-rom/dirt-path.png",
    sourcePaths: ["public/assets/poke-lounge/textures/a_0_4_4_0103/dtf_f01.png"],
  },
  W: {
    code: "W",
    label: "Water",
    blocksMovement: true,
    encounterRate: 0,
    assetPath: "/assets/map-sample-rom/water.png",
    sourcePaths: [
      "public/assets/poke-lounge/textures/data_minimum_nsbtx/sea_1.png",
      "public/assets/poke-lounge/textures/data_fldtanime_narc_0001/sea_on_1.png",
    ],
  },
};

export const SAMPLE_MAP_LAYOUT: readonly string[] = [
  "TTTTTTTTTTTTTTTT",
  "TTTTPPPPTTTTWWWT",
  "TTGGGGPPGGGWWWWT",
  "TGGGGGPPGGGWWWWT",
  "TGGGGGPPGGGGWPGT",
  "TGGFFFFPPPPPPPGT",
  "TTGFFFFPPPPPPPGT",
  "TTGGGGGPPPPDGGGT",
  "TTTGGGGGGGDDGGGT",
  "TTTGGWWGGGDDGGGT",
  "TTGGGWWGGGGGGGGT",
  "TTTTTTTTTTTTTTTT",
];

export const SAMPLE_MAP_NURSE: Omit<SampleMapNpc, "x" | "y"> = {
  id: "nurse",
  label: "Nurse NPC",
  placement: "center",
  assetPath: "/assets/map-sample-rom/nurse-npc.png",
  sourcePaths: ["public/assets/poke-lounge/textures/a_0_8_1_0133/pcwoman1_5.png"],
};

export function createSampleMapModel(
  layout: readonly string[] = SAMPLE_MAP_LAYOUT,
): SampleMapModel {
  const height = layout.length;
  const width = layout[0]?.length ?? 0;
  const tiles: SampleMapTile[] = [];

  for (const [y, row] of layout.entries()) {
    if (row.length !== width) {
      throw new Error("Sample map rows must have a stable width.");
    }

    for (const [x, code] of [...row].entries()) {
      if (!isSampleMapTileCode(code)) {
        throw new Error(`Unsupported sample map tile code: ${code}`);
      }

      tiles.push({
        code,
        x,
        y,
        definition: SAMPLE_MAP_TILE_DEFINITIONS[code],
      });
    }
  }

  return {
    id: "rom-field-sample",
    name: "HG Camera Field Sample",
    width,
    height,
    tiles,
    npcs: [
      {
        ...SAMPLE_MAP_NURSE,
        x: Math.floor(width / 2),
        y: Math.floor(height / 2),
      },
    ],
  };
}

export function renderSampleMap(model = createSampleMapModel()): HTMLElement {
  const section = document.createElement("section");
  section.className = "map-sample";
  section.dataset.mapSample = model.id;

  const header = document.createElement("header");
  header.className = "map-sample-header";

  const title = document.createElement("h3");
  title.textContent = model.name;

  const meta = document.createElement("p");
  meta.textContent = `${model.width} x ${model.height} tile code map`;

  header.append(title, meta);

  const board = document.createElement("div");
  board.className = "map-sample-board";
  board.style.setProperty("--map-columns", String(model.width));
  board.style.setProperty("--map-rows", String(model.height));
  board.setAttribute("role", "img");
  board.setAttribute(
    "aria-label",
    "Sample ROM asset map with tree boundary, water, forest, and nurse NPC.",
  );

  for (const tile of model.tiles) {
    board.append(
      renderSampleMapTile(
        tile,
        model.npcs.filter(npc => npc.x === tile.x && npc.y === tile.y),
      ),
    );
  }

  section.append(header, board, createMapLegend());
  return section;
}

function renderSampleMapTile(tile: SampleMapTile, npcs: readonly SampleMapNpc[] = []): HTMLElement {
  const element = document.createElement("span");
  element.className = `map-sample-tile map-sample-tile--${tile.code.toLowerCase()}`;
  element.dataset.tileCode = tile.code;
  element.dataset.tileX = String(tile.x);
  element.dataset.tileY = String(tile.y);
  element.dataset.tileVariant = String(getSampleTileVariant(tile));
  element.classList.add(`map-sample-tile--variant-${element.dataset.tileVariant}`);
  element.dataset.blocksMovement = String(tile.definition.blocksMovement);
  element.dataset.encounterRate = String(tile.definition.encounterRate);
  element.dataset.romAsset = tile.definition.assetPath;
  element.dataset.romSource = tile.definition.sourcePaths.join(",");
  element.style.setProperty("--tile-image", `url("${tile.definition.assetPath}")`);
  element.setAttribute("aria-label", tile.definition.label);

  for (const npc of npcs) {
    element.append(renderSampleMapNpc(npc));
  }

  return element;
}

function getSampleTileVariant(tile: SampleMapTile): number {
  if (!["P", "D"].includes(tile.code)) {
    return 0;
  }

  return Math.abs(tile.x * 3 + tile.y * 5) % 4;
}

function renderSampleMapNpc(npc: SampleMapNpc): HTMLElement {
  const element = document.createElement("span");
  element.className = `map-sample-npc map-sample-npc--${npc.id}`;
  element.dataset.mapNpc = npc.id;
  element.dataset.npcX = String(npc.x);
  element.dataset.npcY = String(npc.y);
  element.dataset.npcPlacement = npc.placement;
  element.dataset.romAsset = npc.assetPath;
  element.dataset.romSource = npc.sourcePaths.join(",");
  element.style.setProperty("--npc-image", `url("${npc.assetPath}")`);
  element.setAttribute("aria-label", npc.label);
  return element;
}

function createMapLegend(): HTMLElement {
  const legend = document.createElement("ul");
  legend.className = "map-sample-legend";

  for (const code of ["T", "G", "F", "W", "P", "D"] as const) {
    const definition = SAMPLE_MAP_TILE_DEFINITIONS[code];
    const item = document.createElement("li");
    item.dataset.tileCode = code;
    item.textContent =
      definition.encounterRate > 0
        ? `${definition.label} - encounter ${definition.encounterRate}%`
        : definition.label;
    legend.append(item);
  }

  return legend;
}

function isSampleMapTileCode(value: string): value is SampleMapTileCode {
  return value in SAMPLE_MAP_TILE_DEFINITIONS;
}

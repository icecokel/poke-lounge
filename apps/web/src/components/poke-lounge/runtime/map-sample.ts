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

export function getSampleTileVariant(tile: SampleMapTile): number {
  if (!["P", "D"].includes(tile.code)) {
    return 0;
  }

  return Math.abs(tile.x * 3 + tile.y * 5) % 4;
}

function isSampleMapTileCode(value: string): value is SampleMapTileCode {
  return value in SAMPLE_MAP_TILE_DEFINITIONS;
}

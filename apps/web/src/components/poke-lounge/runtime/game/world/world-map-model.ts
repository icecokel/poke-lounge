import { FIELD_MAP } from "./fieldMap";

export interface WorldMapTile {
  gid: number;
  key: string;
  x: number;
  y: number;
}

export interface WorldMapLayerModel {
  name: "Below Player" | "World" | "Above Player";
  tiles: WorldMapTile[];
}

export interface WorldMapNpcModel {
  displayName: string;
  imageUrl: string;
  name: keyof typeof FIELD_MAP.npcs;
  role: string;
  x: number;
  y: number;
}

export interface WorldMapModel {
  collisionCoordinates: ReadonlySet<string>;
  collisionGids: ReadonlySet<number>;
  height: number;
  heightInPixels: number;
  layers: WorldMapLayerModel[];
  npcs: WorldMapNpcModel[];
  spawnPoints: ReadonlyMap<string, { x: number; y: number }>;
  tallGrassBase: WorldMapTile[];
  tallGrassCoordinates: ReadonlySet<string>;
  tallGrassForeground: WorldMapTile[];
  tileHeight: number;
  tileset: {
    columns: number;
    firstGid: number;
    imageUrl: string;
    margin: number;
    spacing: number;
    tileHeight: number;
    tileWidth: number;
  };
  tileWidth: number;
  width: number;
  widthInPixels: number;
}

export interface WorldPlayerAtlasFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface WorldPlayerAtlasModel {
  frames: ReadonlyMap<string, WorldPlayerAtlasFrame>;
  height: number;
  imageUrl: string;
  width: number;
}

interface TiledProperty {
  name?: unknown;
  value?: unknown;
}

interface TiledObject {
  height?: unknown;
  name?: unknown;
  properties?: unknown;
  type?: unknown;
  width?: unknown;
  x?: unknown;
  y?: unknown;
}

interface TiledLayer {
  data?: unknown;
  name?: unknown;
  objects?: unknown;
  type?: unknown;
}

interface TiledTileset {
  columns?: unknown;
  firstgid?: unknown;
  margin?: unknown;
  spacing?: unknown;
  tileheight?: unknown;
  tiles?: unknown;
  tilewidth?: unknown;
}

const TILE_LAYER_NAMES = ["Below Player", "World", "Above Player"] as const;

export function createWorldMapModel(value: unknown): WorldMapModel {
  const map = asRecord(value, "world map");
  const width = readPositiveInteger(map.width, "world map width");
  const height = readPositiveInteger(map.height, "world map height");
  const tileWidth = readPositiveInteger(map.tilewidth, "world map tile width");
  const tileHeight = readPositiveInteger(map.tileheight, "world map tile height");
  const layers = readArray<TiledLayer>(map.layers, "world map layers");
  const tilesets = readArray<TiledTileset>(map.tilesets, "world map tilesets");
  const tileset = tilesets[0];
  if (!tileset) throw new Error("World map tileset is missing.");

  const firstGid = readPositiveInteger(tileset.firstgid, "world map first GID");
  const tilesetModel = {
    columns: readPositiveInteger(tileset.columns, "world map tileset columns"),
    firstGid,
    imageUrl: FIELD_MAP.tilesetUrl,
    margin: readNonNegativeInteger(tileset.margin, "world map tileset margin"),
    spacing: readNonNegativeInteger(tileset.spacing, "world map tileset spacing"),
    tileHeight: readPositiveInteger(tileset.tileheight, "world map tileset tile height"),
    tileWidth: readPositiveInteger(tileset.tilewidth, "world map tileset tile width"),
  };

  const tileLayers = TILE_LAYER_NAMES.map(name => {
    const layer = findLayer(layers, name, "tilelayer");
    const data = readArray<unknown>(layer.data, `${name} tile data`);
    if (data.length !== width * height) {
      throw new Error(`${name} tile data must contain ${width * height} entries.`);
    }
    return {
      name,
      tiles: data.flatMap((rawGid, index) => {
        const gid = readNonNegativeInteger(rawGid, `${name} tile GID`);
        return gid === 0
          ? []
          : [{ gid, key: `${name}-${index}`, x: index % width, y: Math.floor(index / width) }];
      }),
    };
  });

  const grassLayer = findLayer(layers, FIELD_MAP.tallGrass.regionLayerName, "objectgroup");
  const grassObjects = readArray<TiledObject>(grassLayer.objects, "tall grass objects");
  const tallGrassCoordinates = new Set<string>();
  for (const object of grassObjects) {
    const x = readGridNumber(object.x, tileWidth, "tall grass x");
    const y = readGridNumber(object.y, tileHeight, "tall grass y");
    const regionWidth = readGridNumber(object.width, tileWidth, "tall grass width");
    const regionHeight = readGridNumber(object.height, tileHeight, "tall grass height");
    if (regionWidth <= 0 || regionHeight <= 0) {
      throw new Error("Tall grass region dimensions must be positive.");
    }
    for (let tileY = y; tileY < y + regionHeight; tileY += 1) {
      for (let tileX = x; tileX < x + regionWidth; tileX += 1) {
        tallGrassCoordinates.add(`${tileX},${tileY}`);
      }
    }
  }
  const createGrassTiles = (gid: number, layer: string) =>
    [...tallGrassCoordinates].map(coordinate => {
      const [x, y] = coordinate.split(",").map(Number) as [number, number];
      return { gid, key: `${layer}-${coordinate}`, x, y };
    });

  const npcLayer = findLayer(layers, "Npcs", "objectgroup");
  const npcs = readArray<TiledObject>(npcLayer.objects, "world NPC objects").map(object => {
    const name = readString(object.name, "world NPC name");
    if (!Object.hasOwn(FIELD_MAP.npcs, name)) {
      throw new Error(`Unsupported world NPC: ${name}`);
    }
    const properties = readProperties(object.properties);
    return {
      displayName: readOptionalProperty(properties, "displayName") ?? name,
      imageUrl: FIELD_MAP.npcs[name as keyof typeof FIELD_MAP.npcs].imageUrl,
      name: name as keyof typeof FIELD_MAP.npcs,
      role: readOptionalProperty(properties, "role") ?? readString(object.type, `${name} role`),
      x: readFiniteNumber(object.x, `${name} x`),
      y: readFiniteNumber(object.y, `${name} y`),
    };
  });

  const spawnLayer = findLayer(layers, "SpawnPoints", "objectgroup");
  const spawnPoints = new Map(
    readArray<TiledObject>(spawnLayer.objects, "world spawn objects").map(object => [
      readString(object.name, "world spawn name"),
      {
        x: readFiniteNumber(object.x, "world spawn x"),
        y: readFiniteNumber(object.y, "world spawn y"),
      },
    ]),
  );
  const collisionGids = new Set<number>();
  for (const tile of readArray<Record<string, unknown>>(tileset.tiles, "world tileset tiles")) {
    const properties = readProperties(tile.properties);
    if (properties.get("collides") === true) {
      collisionGids.add(firstGid + readNonNegativeInteger(tile.id, "world tileset tile id"));
    }
  }
  const worldLayer = tileLayers.find(layer => layer.name === "World");
  const collisionCoordinates = new Set(
    worldLayer?.tiles
      .filter(tile => collisionGids.has(tile.gid))
      .map(tile => `${tile.x},${tile.y}`) ?? [],
  );

  return {
    collisionCoordinates,
    collisionGids,
    height,
    heightInPixels: height * tileHeight,
    layers: tileLayers,
    npcs,
    spawnPoints,
    tallGrassBase: createGrassTiles(FIELD_MAP.tallGrass.baseTileIndex, "grass-base"),
    tallGrassCoordinates,
    tallGrassForeground: createGrassTiles(
      FIELD_MAP.tallGrass.foregroundTileIndex,
      "grass-foreground",
    ),
    tileHeight,
    tileset: tilesetModel,
    tileWidth,
    width,
    widthInPixels: width * tileWidth,
  };
}

export function getWorldTileSourcePosition(model: WorldMapModel, gid: number) {
  const tileIndex = gid - model.tileset.firstGid;
  if (tileIndex < 0) throw new Error(`World tile GID ${gid} is outside the tileset.`);
  return {
    x:
      model.tileset.margin +
      (tileIndex % model.tileset.columns) * (model.tileset.tileWidth + model.tileset.spacing),
    y:
      model.tileset.margin +
      Math.floor(tileIndex / model.tileset.columns) *
        (model.tileset.tileHeight + model.tileset.spacing),
  };
}

export function createWorldPlayerAtlasModel(value: unknown): WorldPlayerAtlasModel {
  const atlas = asRecord(value, "world player atlas");
  const frames = asRecord(atlas.frames, "world player atlas frames");
  const meta = asRecord(atlas.meta, "world player atlas metadata");
  const size = asRecord(meta.size, "world player atlas size");

  return {
    frames: new Map(
      Object.entries(frames).map(([name, rawFrame]) => {
        const entry = asRecord(rawFrame, `${name} atlas entry`);
        const frame = asRecord(entry.frame, `${name} atlas frame`);
        return [
          name,
          {
            height: readPositiveInteger(frame.h, `${name} frame height`),
            width: readPositiveInteger(frame.w, `${name} frame width`),
            x: readNonNegativeInteger(frame.x, `${name} frame x`),
            y: readNonNegativeInteger(frame.y, `${name} frame y`),
          },
        ];
      }),
    ),
    height: readPositiveInteger(size.h, "world player atlas height"),
    imageUrl: FIELD_MAP.player.atlasUrl,
    width: readPositiveInteger(size.w, "world player atlas width"),
  };
}

function findLayer(layers: TiledLayer[], name: string, type: string): TiledLayer {
  const layer = layers.find(candidate => candidate.name === name && candidate.type === type);
  if (!layer) throw new Error(`Missing ${type} layer: ${name}`);
  return layer;
}

function readProperties(value: unknown): Map<string, unknown> {
  return new Map(
    readArray<TiledProperty>(value ?? [], "Tiled properties").map(property => [
      readString(property.name, "Tiled property name"),
      property.value,
    ]),
  );
}

function readOptionalProperty(properties: Map<string, unknown>, name: string): string | null {
  const value = properties.get(name);
  return typeof value === "string" && value ? value : null;
}

function readArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value as T[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a string.`);
  return value;
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function readPositiveInteger(value: unknown, label: string): number {
  const number = readNonNegativeInteger(value, label);
  if (number === 0) throw new Error(`${label} must be positive.`);
  return number;
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function readGridNumber(value: unknown, gridSize: number, label: string): number {
  const number = readFiniteNumber(value, label);
  if (number % gridSize !== 0) throw new Error(`${label} must align to the tile grid.`);
  return number / gridSize;
}

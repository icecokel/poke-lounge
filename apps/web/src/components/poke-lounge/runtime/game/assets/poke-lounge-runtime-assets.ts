import {
  getPokeLoungeAudioPreloadAssets,
  parsePokeLoungeAudioManifest,
  POKE_LOUNGE_AUDIO_MANIFEST_PATH,
} from "../audio/poke-lounge-audio";
import type {
  PokeLoungeAudioManifest,
  PokeLoungeBgmId,
  PokeLoungeSfxId,
} from "../audio/poke-lounge-audio.types";
import { BATTLE_ASSET_MANIFEST_PATH } from "../battle/battle-assets";
import { ROM_BATTLE_PRELOAD_ASSETS } from "../battle/battle-design";
import {
  toBattlePokemonPreloadAssets,
  type BattlePokemonPreloadAsset,
} from "../battle/battle-pokemon-assets";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
  type RuntimeGameDataJson,
} from "../data/game-data-json";
import { FIELD_MAP } from "../world/field-map";
import { WILD_ENCOUNTER_TABLES_JSON_ASSET } from "../world/wild-encounter-tables";

const JSON_CACHE_ASSETS = [
  ["battleAssetManifest", BATTLE_ASSET_MANIFEST_PATH],
  WILD_ENCOUNTER_TABLES_JSON_ASSET,
] as const;

const GAME_DATA_JSON_CACHE_ASSETS = [
  ["pokemonData", POKEMON_DATA_JSON_PATH, "pokemonData"],
  ["itemData", ITEM_DATA_JSON_PATH, "itemData"],
  ["romPersonalData", POKEMON_DATA_JSON_PATH, "pokemonData"],
  ["romRefinedBattleRecords", POKEMON_DATA_JSON_PATH, "pokemonData"],
  ["levelUpMoveTable", LEVEL_UP_MOVE_TABLE_JSON_PATH, "levelUpMoveTable"],
  ["wildBattleMoveSets", WILD_BATTLE_MOVE_SETS_JSON_PATH, "wildBattleMoveSets"],
  ["battlePokemonAssets", BATTLE_POKEMON_ASSETS_JSON_PATH, "battlePokemonAssets"],
] as const satisfies ReadonlyArray<readonly [string, string, keyof RuntimeGameDataJson]>;

export interface PokeLoungeAssetLoadProgress {
  loaded: number;
  total: number;
  ratio: number;
}

export interface PokeLoungeLoadedSpriteSheet extends BattlePokemonPreloadAsset {
  image: HTMLImageElement;
}

export interface PokeLoungeRuntimeAssets {
  audioBuffers: ReadonlyMap<PokeLoungeSfxId | PokeLoungeBgmId, ArrayBuffer>;
  audioManifest: PokeLoungeAudioManifest;
  images: ReadonlyMap<string, HTMLImageElement>;
  json: ReadonlyMap<string, unknown>;
  playerAtlas: {
    data: object;
    image: HTMLImageElement;
  };
  spriteSheets: readonly PokeLoungeLoadedSpriteSheet[];
  tilemap: object;
}

export interface LoadPokeLoungeRuntimeAssetsOptions {
  runtimeGameData: RuntimeGameDataJson;
  fetcher?: typeof fetch;
  imageLoader?: (path: string, signal?: AbortSignal) => Promise<HTMLImageElement>;
  onProgress?: (progress: PokeLoungeAssetLoadProgress) => void;
  signal?: AbortSignal;
}

export async function loadPokeLoungeRuntimeAssets({
  runtimeGameData,
  fetcher = fetch,
  imageLoader = loadBrowserImage,
  onProgress,
  signal,
}: LoadPokeLoungeRuntimeAssetsOptions): Promise<PokeLoungeRuntimeAssets> {
  const audioManifestValue = await fetchRequiredJson(
    fetcher,
    POKE_LOUNGE_AUDIO_MANIFEST_PATH,
    signal,
  );
  const audioManifest = parsePokeLoungeAudioManifest(audioManifestValue);
  if (!audioManifest) {
    throw new Error("Required Poke Lounge audio manifest is invalid.");
  }

  const spriteSheetAssets = toBattlePokemonPreloadAssets();
  const audioAssets = getPokeLoungeAudioPreloadAssets(audioManifest);
  const imageAssets = [
    ...ROM_BATTLE_PRELOAD_ASSETS.map(function mapItem([key, path]) {
      return { key, path };
    }),
    { key: FIELD_MAP.tilesetKey, path: FIELD_MAP.tilesetUrl },
    ...Object.values(FIELD_MAP.npcs).map(function mapItem(npc) {
      return { key: npc.textureKey, path: npc.imageUrl };
    }),
  ];
  const uniqueImagePaths = new Set([
    ...imageAssets.map(function mapItem(asset) {
      return asset.path;
    }),
    ...spriteSheetAssets.map(function mapItem(asset) {
      return asset.path;
    }),
    FIELD_MAP.player.atlasUrl,
  ]);
  const total = 1 + JSON_CACHE_ASSETS.length + 2 + uniqueImagePaths.size + audioAssets.length;
  let loaded = 1;
  const reportProgress = () => {
    onProgress?.({ loaded, total, ratio: loaded / total });
  };
  const complete = <T>(value: T): T => {
    loaded += 1;
    reportProgress();
    return value;
  };
  reportProgress();

  const json = new Map<string, unknown>();
  for (const [cacheKey, , dataKey] of GAME_DATA_JSON_CACHE_ASSETS) {
    json.set(cacheKey, runtimeGameData[dataKey]);
  }

  const [jsonEntries, tilemapValue, playerAtlasValue] = await Promise.all([
    Promise.all(
      JSON_CACHE_ASSETS.map(async function mapItem([key, path]) {
        return [key, complete(await fetchRequiredJson(fetcher, path, signal))] as const;
      }),
    ),
    fetchRequiredJson(fetcher, FIELD_MAP.mapUrl, signal).then(complete),
    fetchRequiredJson(fetcher, FIELD_MAP.player.atlasJsonUrl, signal).then(complete),
  ]);
  if (!isObject(tilemapValue) || !isObject(playerAtlasValue)) {
    throw new Error("Required Poke Lounge map or player atlas data is invalid.");
  }
  for (const [key, value] of jsonEntries) {
    json.set(key, value);
  }

  const imagePromises = new Map<string, Promise<HTMLImageElement>>();
  const getImage = (path: string) => {
    const existing = imagePromises.get(path);
    if (existing) {
      return existing;
    }
    const promise = imageLoader(path, signal).then(complete);
    imagePromises.set(path, promise);
    return promise;
  };
  const [loadedImages, spriteSheets, playerAtlasImage, audioBufferEntries] = await Promise.all([
    Promise.all(
      imageAssets.map(async function mapItem(asset) {
        return [asset.key, await getImage(asset.path)] as const;
      }),
    ),
    Promise.all(
      spriteSheetAssets.map(async function mapItem(asset) {
        return { ...asset, image: await getImage(asset.path) };
      }),
    ),
    getImage(FIELD_MAP.player.atlasUrl),
    Promise.all(
      audioAssets.map(async function mapItem(asset) {
        return [
          asset.id,
          complete(await fetchRequiredArrayBuffer(fetcher, asset.src, signal)),
        ] as const;
      }),
    ),
  ]);

  return {
    audioBuffers: new Map(audioBufferEntries),
    audioManifest,
    images: new Map(loadedImages),
    json,
    playerAtlas: { data: playerAtlasValue, image: playerAtlasImage },
    spriteSheets,
    tilemap: tilemapValue,
  };
}

async function fetchRequiredJson(
  fetcher: typeof fetch,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetcher(path, { cache: "force-cache", signal });
  if (!response.ok) {
    throw new Error(`Failed to load required Poke Lounge asset ${path}: ${response.status}`);
  }
  return response.json();
}

async function fetchRequiredArrayBuffer(
  fetcher: typeof fetch,
  path: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetcher(path, { cache: "force-cache", signal });
  if (!response.ok) {
    throw new Error(`Failed to load required Poke Lounge asset ${path}: ${response.status}`);
  }
  return response.arrayBuffer();
}

function loadBrowserImage(path: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise(function resolvePromise(resolve, reject) {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      image.src = "";
      reject(signal?.reason ?? new DOMException("Asset loading aborted.", "AbortError"));
    };
    image.onload = function callback() {
      cleanup();
      resolve(image);
    };
    image.onerror = function callback() {
      cleanup();
      reject(new Error(`Failed to load required Poke Lounge image ${path}.`));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = path;
  });
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

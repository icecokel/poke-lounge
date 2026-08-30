import {
  BATTLE_POKEMON_SPRITE_FRAME_SIZE,
  BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE,
  getRuntimeBattlePokemonSpriteSheetRanges,
  type BattlePokemonSpriteSheetRangeRecord,
} from "../data/game-data-json";
import type { BattleSpriteRef } from "./battleTypes";
import { isSupportedPokemonSpeciesId } from "./pokemon-species";

export interface BattlePokemonAssetSet {
  speciesId: number;
  front: BattleSpriteRef;
  back: BattleSpriteRef;
}

export interface BattlePokemonPreloadAsset {
  assetKey: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  endFrame: number;
}

export const BATTLE_POKEMON_FRAME_SIZE = {
  width: BATTLE_POKEMON_SPRITE_FRAME_SIZE,
  height: BATTLE_POKEMON_SPRITE_FRAME_SIZE,
} as const;

export const DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES = [
  createDefaultSpriteSheetRange(1, 256),
  createDefaultSpriteSheetRange(257, 493),
] as const satisfies readonly BattlePokemonSpriteSheetRangeRecord[];

export function getBattlePokemonAssets(speciesId: number): BattlePokemonAssetSet {
  if (!isSupportedPokemonSpeciesId(speciesId)) {
    throw new Error(`Missing battle Pokemon assets for species ${speciesId}`);
  }

  const range = getBattlePokemonSpriteSheetRanges().find(
    candidate => speciesId >= candidate.startSpeciesId && speciesId <= candidate.endSpeciesId,
  );

  if (!range) {
    throw new Error(`Missing battle Pokemon assets for species ${speciesId}`);
  }

  const frame = speciesId - range.startSpeciesId;

  return {
    speciesId,
    front: createBattleSpriteRef(range, "front", frame),
    back: createBattleSpriteRef(range, "back", frame),
  };
}

export function toBattlePokemonPreloadAssets(): BattlePokemonPreloadAsset[] {
  const preloadAssets = getBattlePokemonSpriteSheetRanges().flatMap(range =>
    (["front", "back"] as const).map(side => ({
      assetKey: createSpriteSheetAssetKey(range, side),
      path: range[side].path,
      frameWidth: range.frameWidth,
      frameHeight: range.frameHeight,
      endFrame: range.endSpeciesId - range.startSpeciesId,
    })),
  );
  const uniqueAssets = new Map<string, BattlePokemonPreloadAsset>();

  for (const asset of preloadAssets) {
    const existing = uniqueAssets.get(asset.assetKey);

    if (existing && existing.path !== asset.path) {
      throw new Error(`Conflicting battle Pokemon sprite sheet key ${asset.assetKey}`);
    }

    uniqueAssets.set(asset.assetKey, asset);
  }

  return [...uniqueAssets.values()];
}

function getBattlePokemonSpriteSheetRanges(): BattlePokemonSpriteSheetRangeRecord[] {
  return getRuntimeBattlePokemonSpriteSheetRanges([...DEFAULT_BATTLE_POKEMON_SPRITE_SHEET_RANGES]);
}

function createBattleSpriteRef(
  range: BattlePokemonSpriteSheetRangeRecord,
  side: "front" | "back",
  frame: number,
): BattleSpriteRef {
  return {
    assetKey: createSpriteSheetAssetKey(range, side),
    path: range[side].path,
    frame,
    width: range.frameWidth,
    height: range.frameHeight,
  };
}

function createSpriteSheetAssetKey(
  range: BattlePokemonSpriteSheetRangeRecord,
  side: "front" | "back",
): string {
  return `battle-pokemon-${side}-${range.startSpeciesId}-${range.endSpeciesId}`;
}

function createDefaultSpriteSheetRange(
  startSpeciesId: number,
  endSpeciesId: number,
): BattlePokemonSpriteSheetRangeRecord {
  return {
    startSpeciesId,
    endSpeciesId,
    frameWidth: BATTLE_POKEMON_FRAME_SIZE.width,
    frameHeight: BATTLE_POKEMON_FRAME_SIZE.height,
    columns: BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE,
    rows: BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE,
    front: {
      path: `/assets/pokemon/sheets/front-${startSpeciesId}-${endSpeciesId}.png`,
    },
    back: {
      path: `/assets/pokemon/sheets/back-${startSpeciesId}-${endSpeciesId}.png`,
    },
  };
}

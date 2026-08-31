import { POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS } from "@poke-lounge/battle/runtime-item-ids";
import {
  MAX_SUPPORTED_POKEMON_SPECIES_ID,
  MIN_SUPPORTED_POKEMON_SPECIES_ID,
} from "../battle/pokemon-species";

export const LEVEL_UP_MOVE_TABLE_JSON_PATH = "/game-data/level-up-move-table.json";
export const WILD_BATTLE_MOVE_SETS_JSON_PATH = "/game-data/wild-battle-move-sets.json";
export const BATTLE_POKEMON_ASSETS_JSON_PATH = "/game-data/battle-pokemon-assets.json";
export const POKEMON_DATA_JSON_PATH = "/game-data/pokemon-data.json";
export const ITEM_DATA_JSON_PATH = "/game-data/item-data.json";
export const POKE_LOUNGE_ROM_DATA_API_PATH = "/poke-lounge/rom-data";
export const POKE_LOUNGE_SHOP_ITEMS_API_PATHS = {
  basic: "/poke-lounge/shops/basic/items",
  premium: "/poke-lounge/shops/premium/items",
} as const;
export const BATTLE_POKEMON_SPRITE_FRAME_SIZE = 80;
export const BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE = 16;

const BATTLE_POKEMON_ASSET_MANIFEST_VERSION = 2;
const HGSS_ITEM_RECORD_COUNT = 513;
const HGSS_GROWTH_TABLE_COUNT = 8;
const HGSS_GROWTH_TABLE_LEVEL_COUNT = 101;
const EXPECTED_ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
const CONTENT_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SUPPORTED_RUNTIME_ITEM_ROM_IDS = new Set<number>(
  Object.values(POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS),
);
const ROM_DOCUMENT_KEYS = [
  "pokemon-data",
  "item-data",
  "level-up-move-table",
  "growth-table",
] as const;

type RomDocumentKey = (typeof ROM_DOCUMENT_KEYS)[number];
export type RuntimeShopKind = "basic" | "premium";
type RuntimeShopCatalogs = Partial<Record<RuntimeShopKind, readonly number[]>>;

export interface LevelUpMoveRow {
  level: number;
  moveId: number;
}

export interface RuntimePokemonMoveSummary {
  id: number;
  name: string;
  pp: number;
}

export interface RuntimePokemonSpeciesSummary {
  id: number;
  name: string;
  catchRate: number;
  baseExpYield: number;
  growthRate: number;
  genderRatio: number;
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    specialAttack: number;
    specialDefense: number;
  };
  typeIds: number[];
}

export interface RuntimePokemonMoveDetails extends RuntimePokemonMoveSummary {
  power: number;
  accuracy: number;
  typeId: number;
  typeName: string;
  category: "physical" | "special" | "status";
  effectCode: number;
  effectChance: number;
  priority: number;
}

export interface RuntimeItemDetails {
  id: number;
  name: string;
  description: string;
  price: number;
  partyUse: boolean;
  partyUseEffects?: {
    poisonHeal: boolean;
    revive: boolean;
    levelUp: boolean;
    evolve: boolean;
    hpRestore: boolean;
    hpRestoreParam: number;
  };
}

export interface BattlePokemonSpriteSheetAssetRecord {
  path: string;
}

export interface BattlePokemonSpriteSheetRangeRecord {
  startSpeciesId: number;
  endSpeciesId: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  front: BattlePokemonSpriteSheetAssetRecord;
  back: BattlePokemonSpriteSheetAssetRecord;
}

interface RuntimeGameDataJsonState {
  pokemonData: unknown | null;
  itemData: unknown | null;
  shopCatalogs: RuntimeShopCatalogs;
  pokemonDataRecordCount: number | null;
  moveNames: Record<number, string> | null;
  levelUpMoveTable: Record<number, LevelUpMoveRow[]> | null;
  growthExperienceTables: Map<number, readonly number[]> | null;
  wildBattleMoveSets: Record<number, number[]> | null;
  battlePokemonAssets: { spriteSheetRanges: BattlePokemonSpriteSheetRangeRecord[] } | null;
}

export interface RuntimeGameDataJson {
  pokemonData: unknown;
  itemData: unknown;
  levelUpMoveTable: unknown;
  growthTable: unknown;
  wildBattleMoveSets: unknown;
  battlePokemonAssets: unknown;
}

const runtimeGameDataJsonState: RuntimeGameDataJsonState = {
  pokemonData: null,
  itemData: null,
  shopCatalogs: {},
  pokemonDataRecordCount: null,
  moveNames: null,
  levelUpMoveTable: null,
  growthExperienceTables: null,
  wildBattleMoveSets: null,
  battlePokemonAssets: null,
};

export async function loadRuntimeGameDataJson(
  fetcher: typeof fetch = fetch,
  loadRomData: () => Promise<unknown> = function callback() {
    return import("@/lib/api-client").then(function handleResolved({ apiClient }) {
      return apiClient.get<unknown>(POKE_LOUNGE_ROM_DATA_API_PATH);
    });
  },
): Promise<RuntimeGameDataJson> {
  try {
    const [romData, wildBattleMoveSets, battlePokemonAssets] = await Promise.all([
      loadRomData(),
      fetchRequiredJson(fetcher, WILD_BATTLE_MOVE_SETS_JSON_PATH),
      fetchRequiredJson(fetcher, BATTLE_POKEMON_ASSETS_JSON_PATH),
    ]);
    const { pokemonData, itemData, levelUpMoveTable, growthTable } = readRomDataResponse(romData);

    const data = {
      pokemonData,
      itemData,
      levelUpMoveTable,
      growthTable,
      wildBattleMoveSets,
      battlePokemonAssets,
    };

    registerRuntimeGameDataJson(data);

    return data;
  } catch (error) {
    resetRuntimeGameDataJsonState();
    throw error;
  }
}

export function registerRuntimeGameDataJson(data: RuntimeGameDataJson): void {
  const {
    pokemonData,
    itemData,
    levelUpMoveTable,
    growthTable,
    wildBattleMoveSets,
    battlePokemonAssets,
  } = data;
  const normalizedPokemonData = isPokemonDataJson(pokemonData) ? pokemonData : null;
  const normalizedItemData = hasCompleteItemCoverage(itemData) ? itemData : null;
  const pokemonDataRecordCount = normalizePokemonDataRecordCount(pokemonData);
  const moveNames = normalizePokemonMoveNames(pokemonData);
  const normalizedLevelUpMoveTable = normalizeLevelUpMoveTable(levelUpMoveTable);
  const growthExperienceTables = normalizeGrowthExperienceTables(growthTable);
  const normalizedWildBattleMoveSets = normalizeWildBattleMoveSets(wildBattleMoveSets);
  const normalizedBattlePokemonAssets = normalizeBattlePokemonAssetManifest(battlePokemonAssets);

  if (
    !normalizedPokemonData ||
    !normalizedItemData ||
    !pokemonDataRecordCount ||
    !moveNames ||
    !normalizedLevelUpMoveTable ||
    !growthExperienceTables ||
    !normalizedWildBattleMoveSets ||
    !normalizedBattlePokemonAssets ||
    !hasCompleteSupportedPokemonCoverage(normalizedPokemonData) ||
    !hasCompleteLevelUpMoveCoverage(normalizedLevelUpMoveTable, moveNames)
  ) {
    resetRuntimeGameDataJsonState();
    throw new Error("Required Poke Lounge runtime game data is incomplete.");
  }

  runtimeGameDataJsonState.pokemonData = normalizedPokemonData;
  runtimeGameDataJsonState.itemData = normalizedItemData;
  runtimeGameDataJsonState.shopCatalogs = {};
  runtimeGameDataJsonState.pokemonDataRecordCount = pokemonDataRecordCount;
  runtimeGameDataJsonState.moveNames = moveNames;
  runtimeGameDataJsonState.levelUpMoveTable = normalizedLevelUpMoveTable;
  runtimeGameDataJsonState.growthExperienceTables = growthExperienceTables;
  runtimeGameDataJsonState.wildBattleMoveSets = normalizedWildBattleMoveSets;
  runtimeGameDataJsonState.battlePokemonAssets = normalizedBattlePokemonAssets;
}

export function getRuntimeLevelUpMoveTable(): Record<number, LevelUpMoveRow[]> {
  return runtimeGameDataJsonState.levelUpMoveTable ?? {};
}

export function getRuntimeWildBattleMoveSets(): Record<number, number[]> {
  return runtimeGameDataJsonState.wildBattleMoveSets ?? {};
}

export function getRuntimeGrowthExperienceTable(growthRate: number): readonly number[] {
  const tables = runtimeGameDataJsonState.growthExperienceTables;
  if (!tables) {
    throw new Error("Required Poke Lounge growth data is not loaded.");
  }

  return tables.get(growthRate) ?? tables.get(0)!;
}

export function getRuntimeBattlePokemonSpriteSheetRanges(
  fallbackRanges: BattlePokemonSpriteSheetRangeRecord[],
): BattlePokemonSpriteSheetRangeRecord[] {
  if (!runtimeGameDataJsonState.battlePokemonAssets) {
    return fallbackRanges;
  }

  return runtimeGameDataJsonState.battlePokemonAssets.spriteSheetRanges;
}

export function getRuntimePokemonDataRecordCountForTest(): number | null {
  return runtimeGameDataJsonState.pokemonDataRecordCount;
}

export function getRuntimePokemonData(): unknown | null {
  return runtimeGameDataJsonState.pokemonData;
}

export function getRuntimeItemDetails(itemId: number): RuntimeItemDetails | null {
  const itemData = runtimeGameDataJsonState.itemData;
  if (!isRecord(itemData) || !isRecord(itemData.items)) {
    return null;
  }

  const item = itemData.items[String(itemId)];
  if (!isRecord(item)) {
    return null;
  }

  const id = readPositiveInteger(item.id);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const description = typeof item.description === "string" ? item.description.trim() : "";
  const price = readNonNegativeInteger(item.price);
  const partyUse = item.partyUse;
  if (id !== itemId || !name || !description || price === null || typeof partyUse !== "boolean") {
    return null;
  }

  if (!partyUse) {
    return { id, name, description, price, partyUse };
  }

  const effects = item.partyUseEffects;
  if (
    !isRecord(effects) ||
    typeof effects.poisonHeal !== "boolean" ||
    typeof effects.revive !== "boolean" ||
    typeof effects.levelUp !== "boolean" ||
    typeof effects.evolve !== "boolean" ||
    typeof effects.hpRestore !== "boolean"
  ) {
    return null;
  }
  const hpRestoreParam = readNonNegativeInteger(effects.hpRestoreParam);
  if (hpRestoreParam === null) {
    return null;
  }

  return {
    id,
    name,
    description,
    price,
    partyUse,
    partyUseEffects: {
      poisonHeal: effects.poisonHeal,
      revive: effects.revive,
      levelUp: effects.levelUp,
      evolve: effects.evolve,
      hpRestore: effects.hpRestore,
      hpRestoreParam,
    },
  };
}

export function getRuntimeShopItemRomIds(shopKind: RuntimeShopKind): readonly number[] {
  const itemIds = runtimeGameDataJsonState.shopCatalogs?.[shopKind];

  if (!itemIds) {
    throw new Error("Required Poke Lounge shop catalog is not loaded.");
  }

  return itemIds;
}

export function hasRuntimeShopItemRomIds(shopKind: RuntimeShopKind): boolean {
  return runtimeGameDataJsonState.shopCatalogs[shopKind] !== undefined;
}

export async function loadRuntimeShopItemRomIds(
  shopKind: RuntimeShopKind,
  loadShopItemIds: (path: string) => Promise<unknown> = function callback(path) {
    return import("@/lib/api-client").then(function handleResolved({ apiClient }) {
      return apiClient.get<unknown>(path);
    });
  },
): Promise<readonly number[]> {
  const itemIds = await loadShopItemIds(POKE_LOUNGE_SHOP_ITEMS_API_PATHS[shopKind]);
  const normalizedItemIds = normalizeRuntimeShopItemRomIds(
    itemIds,
    runtimeGameDataJsonState.itemData,
  );

  if (!normalizedItemIds) {
    throw new Error(`Required Poke Lounge ${shopKind} shop catalog response is invalid.`);
  }

  return normalizedItemIds;
}

export function registerRuntimeShopItemRomIds(
  shopKind: RuntimeShopKind,
  itemIds: readonly number[],
): void {
  const normalizedItemIds = normalizeRuntimeShopItemRomIds(
    itemIds,
    runtimeGameDataJsonState.itemData,
  );

  if (!normalizedItemIds) {
    throw new Error(`Required Poke Lounge ${shopKind} shop catalog response is invalid.`);
  }

  runtimeGameDataJsonState.shopCatalogs = {
    ...runtimeGameDataJsonState.shopCatalogs,
    [shopKind]: normalizedItemIds,
  };
}

export function clearRuntimeShopItemRomIds(shopKind: RuntimeShopKind): void {
  const shopCatalogs = { ...runtimeGameDataJsonState.shopCatalogs };
  delete shopCatalogs[shopKind];
  runtimeGameDataJsonState.shopCatalogs = shopCatalogs;
}

export function getRuntimePokemonMoveSummary(moveId: number): RuntimePokemonMoveSummary | null {
  const pokemonData = runtimeGameDataJsonState.pokemonData;

  if (!isRecord(pokemonData) || !isRecord(pokemonData.moves)) {
    return null;
  }

  const move = pokemonData.moves[String(moveId)];

  if (!isRecord(move)) {
    return null;
  }

  const id = readPositiveInteger(move.id);
  const name = typeof move.name === "string" ? move.name.trim() : "";
  const pp = readPositiveInteger(move.pp);

  if (id !== moveId || !name || !pp) {
    return null;
  }

  return {
    id,
    name,
    pp,
  };
}

export function getRuntimePokemonSpeciesSummary(
  speciesId: number,
): RuntimePokemonSpeciesSummary | null {
  const pokemonData = runtimeGameDataJsonState.pokemonData;
  if (!isRecord(pokemonData) || !isRecord(pokemonData.species)) {
    return null;
  }
  const species = pokemonData.species[String(speciesId)];
  if (!isRecord(species) || !isRecord(species.baseStats) || !isRecord(species.types)) {
    return null;
  }
  const baseStats = species.baseStats;
  const typeIds = species.types.ids;
  const catchRate = readNonNegativeInteger(species.catchRate);
  const baseExpYield = readNonNegativeInteger(species.baseExpYield);
  const growthRate = readNonNegativeInteger(species.growthRate);
  const genderRatio = readNonNegativeInteger(species.genderRatio);
  if (
    !Number.isInteger(species.speciesId) ||
    typeof species.name !== "string" ||
    !isRecord(baseStats) ||
    !Number.isInteger(baseStats.hp) ||
    !Number.isInteger(baseStats.attack) ||
    !Number.isInteger(baseStats.defense) ||
    !Number.isInteger(baseStats.speed) ||
    !Number.isInteger(baseStats.specialAttack) ||
    !Number.isInteger(baseStats.specialDefense) ||
    !Array.isArray(typeIds) ||
    !typeIds.every(function testItem(typeId) {
      return Number.isInteger(typeId);
    }) ||
    catchRate === null ||
    baseExpYield === null ||
    growthRate === null ||
    genderRatio === null
  ) {
    return null;
  }
  return {
    id: species.speciesId as number,
    name: species.name,
    catchRate,
    baseExpYield,
    growthRate,
    genderRatio,
    baseStats: {
      hp: baseStats.hp as number,
      attack: baseStats.attack as number,
      defense: baseStats.defense as number,
      speed: baseStats.speed as number,
      specialAttack: baseStats.specialAttack as number,
      specialDefense: baseStats.specialDefense as number,
    },
    typeIds: typeIds as number[],
  };
}

export function getRuntimePokemonMoveDetails(moveId: number): RuntimePokemonMoveDetails | null {
  const pokemonData = runtimeGameDataJsonState.pokemonData;
  if (!isRecord(pokemonData) || !isRecord(pokemonData.moves)) {
    return null;
  }
  const move = pokemonData.moves[String(moveId)];
  if (!isRecord(move)) {
    return null;
  }
  const id = readPositiveInteger(move.id);
  const name = typeof move.name === "string" ? move.name.trim() : "";
  const pp = readPositiveInteger(move.pp);
  const power = typeof move.power === "number" && Number.isInteger(move.power) ? move.power : 0;
  const accuracy =
    typeof move.accuracy === "number" && Number.isInteger(move.accuracy) ? move.accuracy : 0;
  const typeId = typeof move.typeId === "number" && Number.isInteger(move.typeId) ? move.typeId : 0;
  const typeName = typeof move.typeName === "string" ? move.typeName.trim() : "";
  const effectCode =
    typeof move.effectCode === "number" && Number.isInteger(move.effectCode) ? move.effectCode : 0;
  const effectChance =
    typeof move.effectChance === "number" && Number.isInteger(move.effectChance)
      ? move.effectChance
      : 0;
  const priority =
    typeof move.priority === "number" && Number.isInteger(move.priority) ? move.priority : 0;
  const category = move.category;
  if (
    id !== moveId ||
    !name ||
    !typeName ||
    !pp ||
    typeof category !== "string" ||
    !["physical", "special", "status"].includes(category)
  ) {
    return null;
  }
  return {
    id,
    name,
    pp,
    power,
    accuracy,
    typeId,
    typeName,
    effectCode,
    effectChance,
    priority,
    category: category as RuntimePokemonMoveDetails["category"],
  };
}

export function getRuntimePokemonSpeciesGrowthRate(speciesId: number): number | null {
  const pokemonData = runtimeGameDataJsonState.pokemonData;

  if (!isRecord(pokemonData) || !isRecord(pokemonData.species)) {
    return null;
  }

  const species = pokemonData.species[String(speciesId)];

  if (!isRecord(species)) {
    return null;
  }

  const growthRate = species.growthRate;

  return typeof growthRate === "number" && Number.isInteger(growthRate) && growthRate >= 0
    ? growthRate
    : null;
}

export function getRuntimePokemonSpeciesGenderRatio(speciesId: number): number | null {
  const pokemonData = runtimeGameDataJsonState.pokemonData;

  if (!isRecord(pokemonData) || !isRecord(pokemonData.species)) {
    return null;
  }

  const species = pokemonData.species[String(speciesId)];

  if (!isRecord(species)) {
    return null;
  }

  const genderRatio = species.genderRatio;

  return typeof genderRatio === "number" &&
    Number.isInteger(genderRatio) &&
    genderRatio >= 0 &&
    genderRatio <= 255
    ? genderRatio
    : null;
}

export function getRuntimeMoveName(moveId: number): string {
  const name = runtimeGameDataJsonState.moveNames?.[moveId];
  if (!name) {
    throw new Error(`Missing runtime move name for move ${moveId}`);
  }
  return name;
}

export function resetRuntimeGameDataJsonStateForTest(): void {
  resetRuntimeGameDataJsonState();
}

function resetRuntimeGameDataJsonState(): void {
  runtimeGameDataJsonState.pokemonData = null;
  runtimeGameDataJsonState.itemData = null;
  runtimeGameDataJsonState.shopCatalogs = {};
  runtimeGameDataJsonState.pokemonDataRecordCount = null;
  runtimeGameDataJsonState.moveNames = null;
  runtimeGameDataJsonState.levelUpMoveTable = null;
  runtimeGameDataJsonState.growthExperienceTables = null;
  runtimeGameDataJsonState.wildBattleMoveSets = null;
  runtimeGameDataJsonState.battlePokemonAssets = null;
}

export function normalizePokemonDataRecordCount(data: unknown): number | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const recordCount = Object.values(data.species).filter(function filterItem(value) {
    if (!isRecord(value)) {
      return false;
    }

    return readPositiveInteger(value.speciesId) !== null && isRecord(value.baseStats);
  }).length;

  return recordCount > 0 ? recordCount : null;
}

export function normalizePokemonMoveNames(data: unknown): Record<number, string> | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.moves)) {
    return null;
  }

  const moveNames = Object.entries(data.moves).reduce<Record<number, string>>(function reduceItems(
    accumulator,
    [moveIdKey, value],
  ) {
    const moveId = readPositiveInteger(moveIdKey);

    if (!moveId || !isRecord(value) || readPositiveInteger(value.id) !== moveId) {
      return accumulator;
    }

    const name = typeof value.name === "string" ? value.name.trim() : "";

    if (!name) {
      return accumulator;
    }

    accumulator[moveId] = name;
    return accumulator;
  }, {});

  return Object.keys(moveNames).length > 0 ? moveNames : null;
}

export function normalizeLevelUpMoveTable(data: unknown): Record<number, LevelUpMoveRow[]> | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const species = Object.entries(data.species).reduce<Record<number, LevelUpMoveRow[]>>(
    function reduceItems(accumulator, [speciesIdKey, value]) {
      const speciesId = readPositiveInteger(speciesIdKey);
      const rows = normalizeLevelUpMoveRows(value);

      if (!speciesId || rows.length === 0) {
        return accumulator;
      }

      accumulator[speciesId] = rows;
      return accumulator;
    },
    {},
  );

  return Object.keys(species).length > 0 ? species : null;
}

export function normalizeWildBattleMoveSets(data: unknown): Record<number, number[]> | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const species = Object.entries(data.species).reduce<Record<number, number[]>>(
    function reduceItems(accumulator, [speciesIdKey, value]) {
      const speciesId = readPositiveInteger(speciesIdKey);
      const moveIds = normalizeWildBattleMoveSet(value);

      if (!speciesId || moveIds.length === 0) {
        return accumulator;
      }

      accumulator[speciesId] = moveIds;
      return accumulator;
    },
    {},
  );

  return Object.keys(species).length > 0 ? species : null;
}

export function normalizeBattlePokemonAssetManifest(
  data: unknown,
): { spriteSheetRanges: BattlePokemonSpriteSheetRangeRecord[] } | null {
  if (
    !isRecord(data) ||
    data.version !== BATTLE_POKEMON_ASSET_MANIFEST_VERSION ||
    !Array.isArray(data.spriteSheetRanges)
  ) {
    return null;
  }

  const spriteSheetRanges = data.spriteSheetRanges
    .map(normalizeBattlePokemonSpriteSheetRangeRecord)
    .filter(function filterItem(range): range is BattlePokemonSpriteSheetRangeRecord {
      return range !== null;
    })
    .sort(function compareItems(left, right) {
      return left.startSpeciesId - right.startSpeciesId;
    });

  if (
    spriteSheetRanges.length === 0 ||
    spriteSheetRanges.length !== data.spriteSheetRanges.length ||
    !hasCompleteBattlePokemonSpriteSheetCoverage(spriteSheetRanges)
  ) {
    return null;
  }

  return { spriteSheetRanges };
}

function normalizeLevelUpMoveRows(data: unknown): LevelUpMoveRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const uniqueRows = new Map<string, LevelUpMoveRow>();

  for (const row of data) {
    if (!isRecord(row)) {
      continue;
    }

    const level = readPositiveInteger(row.level);
    const moveId = readPositiveInteger(row.moveId);

    if (!level || !moveId) {
      continue;
    }

    uniqueRows.set(`${level}:${moveId}`, { level, moveId });
  }

  return [...uniqueRows.values()].sort(function compareItems(left, right) {
    return left.level - right.level;
  });
}

function isPokemonDataJson(data: unknown): boolean {
  return isRecord(data) && data.version === 1 && isRecord(data.species);
}

function hasCompleteSupportedPokemonCoverage(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.species)) {
    return false;
  }

  for (
    let speciesId = MIN_SUPPORTED_POKEMON_SPECIES_ID;
    speciesId <= MAX_SUPPORTED_POKEMON_SPECIES_ID;
    speciesId += 1
  ) {
    const species = data.species[String(speciesId)];

    if (
      !isRecord(species) ||
      readPositiveInteger(species.speciesId) !== speciesId ||
      !isRecord(species.baseStats)
    ) {
      return false;
    }
  }

  return true;
}

function hasCompleteItemCoverage(data: unknown): boolean {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.items)) {
    return false;
  }

  for (let itemId = 1; itemId <= HGSS_ITEM_RECORD_COUNT; itemId += 1) {
    const item = data.items[String(itemId)];
    if (
      !isRecord(item) ||
      readPositiveInteger(item.id) !== itemId ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      typeof item.description !== "string" ||
      !item.description.trim() ||
      readNonNegativeInteger(item.price) === null ||
      typeof item.partyUse !== "boolean" ||
      (item.partyUse && !isRecord(item.partyUseEffects))
    ) {
      return false;
    }
  }

  return Object.keys(data.items).length === HGSS_ITEM_RECORD_COUNT;
}

function normalizeRuntimeShopItemRomIds(data: unknown, itemData: unknown): number[] | null {
  if (
    !Array.isArray(data) ||
    data.length === 0 ||
    !isRecord(itemData) ||
    !isRecord(itemData.items)
  ) {
    return null;
  }
  const items = itemData.items;
  const seenItemIds = new Set<number>();
  const normalizedItemIds: number[] = [];

  for (const itemId of data) {
    const normalizedItemId = readPositiveInteger(itemId);
    if (
      normalizedItemId === null ||
      normalizedItemId !== itemId ||
      !isRecord(items[String(normalizedItemId)]) ||
      !SUPPORTED_RUNTIME_ITEM_ROM_IDS.has(normalizedItemId) ||
      seenItemIds.has(normalizedItemId)
    ) {
      return null;
    }
    seenItemIds.add(normalizedItemId);
    normalizedItemIds.push(normalizedItemId);
  }

  return normalizedItemIds;
}

function hasCompleteLevelUpMoveCoverage(
  levelUpMoveTable: Record<number, LevelUpMoveRow[]>,
  moveNames: Record<number, string>,
): boolean {
  for (
    let speciesId = MIN_SUPPORTED_POKEMON_SPECIES_ID;
    speciesId <= MAX_SUPPORTED_POKEMON_SPECIES_ID;
    speciesId += 1
  ) {
    const rows = levelUpMoveTable[speciesId];

    if (
      !rows?.length ||
      rows.some(function testItem(row) {
        return !moveNames[row.moveId];
      })
    ) {
      return false;
    }
  }

  return true;
}

function normalizeGrowthExperienceTables(data: unknown): Map<number, readonly number[]> | null {
  if (
    !isRecord(data) ||
    data.version !== 1 ||
    !Array.isArray(data.tables) ||
    data.tables.length !== HGSS_GROWTH_TABLE_COUNT
  ) {
    return null;
  }

  const tables = new Map<number, readonly number[]>();
  for (let growthRate = 0; growthRate < HGSS_GROWTH_TABLE_COUNT; growthRate += 1) {
    const table = data.tables[growthRate];
    if (
      !isRecord(table) ||
      table.growth_rate !== growthRate ||
      !Array.isArray(table.experience) ||
      table.experience.length !== HGSS_GROWTH_TABLE_LEVEL_COUNT ||
      !table.experience.every(function testItem(value) {
        return typeof value === "number" && Number.isInteger(value) && value >= 0;
      })
    ) {
      return null;
    }

    tables.set(growthRate, table.experience as number[]);
  }

  return tables;
}

function normalizeWildBattleMoveSet(data: unknown): number[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const moveIds: number[] = [];
  const seenMoveIds = new Set<number>();

  for (const value of data) {
    const moveId = readPositiveInteger(value);

    if (!moveId || seenMoveIds.has(moveId)) {
      continue;
    }

    moveIds.push(moveId);
    seenMoveIds.add(moveId);

    if (moveIds.length === 4) {
      break;
    }
  }

  return moveIds;
}

function normalizeBattlePokemonSpriteSheetRangeRecord(
  data: unknown,
): BattlePokemonSpriteSheetRangeRecord | null {
  if (!isRecord(data)) {
    return null;
  }

  const startSpeciesId = readPositiveInteger(data.startSpeciesId);
  const endSpeciesId = readPositiveInteger(data.endSpeciesId);
  const frameWidth = readPositiveInteger(data.frameWidth);
  const frameHeight = readPositiveInteger(data.frameHeight);
  const columns = readPositiveInteger(data.columns);
  const rows = readPositiveInteger(data.rows);
  const front = normalizeBattlePokemonSpriteSheetAssetRecord(data.front);
  const back = normalizeBattlePokemonSpriteSheetAssetRecord(data.back);

  if (
    !startSpeciesId ||
    !endSpeciesId ||
    !frameWidth ||
    !frameHeight ||
    !columns ||
    !rows ||
    frameWidth !== BATTLE_POKEMON_SPRITE_FRAME_SIZE ||
    frameHeight !== BATTLE_POKEMON_SPRITE_FRAME_SIZE ||
    columns !== BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE ||
    rows !== BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE ||
    startSpeciesId > endSpeciesId ||
    endSpeciesId - startSpeciesId + 1 > columns * rows ||
    !front ||
    !back
  ) {
    return null;
  }

  return {
    startSpeciesId,
    endSpeciesId,
    frameWidth,
    frameHeight,
    columns,
    rows,
    front,
    back,
  };
}

function normalizeBattlePokemonSpriteSheetAssetRecord(
  data: unknown,
): BattlePokemonSpriteSheetAssetRecord | null {
  if (!isRecord(data)) {
    return null;
  }

  const path = typeof data.path === "string" && data.path.startsWith("/assets/") ? data.path : null;

  if (!path) {
    return null;
  }

  return { path };
}

function readPositiveInteger(value: unknown): number | null {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? Number.parseInt(value, 10) : value;

  return typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0
    ? candidate
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? Number.parseInt(value, 10) : value;

  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0
    ? candidate
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasCompleteBattlePokemonSpriteSheetCoverage(
  ranges: BattlePokemonSpriteSheetRangeRecord[],
): boolean {
  if (
    ranges[0].startSpeciesId !== MIN_SUPPORTED_POKEMON_SPECIES_ID ||
    ranges[ranges.length - 1].endSpeciesId !== MAX_SUPPORTED_POKEMON_SPECIES_ID
  ) {
    return false;
  }

  return ranges.every(function testItem(range, index) {
    return index === 0 || range.startSpeciesId === ranges[index - 1].endSpeciesId + 1;
  });
}

function readRomDataResponse(
  data: unknown,
): Pick<RuntimeGameDataJson, "pokemonData" | "itemData" | "levelUpMoveTable" | "growthTable"> {
  if (!isRecord(data) || !Array.isArray(data.documents) || data.documents.length !== 4) {
    throw invalidRomDataResponse();
  }

  const documents = new Map<RomDocumentKey, Record<string, unknown>>();
  for (const candidate of data.documents) {
    if (
      !isRecord(candidate) ||
      typeof candidate.documentKey !== "string" ||
      !ROM_DOCUMENT_KEYS.includes(candidate.documentKey as RomDocumentKey) ||
      documents.has(candidate.documentKey as RomDocumentKey) ||
      candidate.schemaVersion !== 1 ||
      candidate.romSha1 !== EXPECTED_ROM_SHA1 ||
      typeof candidate.contentSha256 !== "string" ||
      !CONTENT_SHA256_PATTERN.test(candidate.contentSha256) ||
      !isRecord(candidate.payload) ||
      candidate.payload.version !== 1 ||
      !isRecord(candidate.payload.source) ||
      candidate.payload.source.romSha1 !== EXPECTED_ROM_SHA1
    ) {
      throw invalidRomDataResponse();
    }

    documents.set(candidate.documentKey as RomDocumentKey, candidate.payload);
  }

  if (
    ROM_DOCUMENT_KEYS.some(function testItem(key) {
      return !documents.has(key);
    })
  ) {
    throw invalidRomDataResponse();
  }

  return {
    pokemonData: documents.get("pokemon-data")!,
    itemData: documents.get("item-data")!,
    levelUpMoveTable: documents.get("level-up-move-table")!,
    growthTable: documents.get("growth-table")!,
  };
}

function invalidRomDataResponse(): Error {
  return new Error("Required Poke Lounge ROM data response is invalid.");
}

async function fetchRequiredJson(fetcher: typeof fetch, path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path);
  } catch (cause) {
    throw new Error(`Failed to load required Poke Lounge data ${path}.`, { cause });
  }

  if (!response.ok) {
    throw new Error(`Failed to load required Poke Lounge data ${path}: ${response.status}`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`Required Poke Lounge data ${path} is not valid JSON.`, { cause });
  }
}

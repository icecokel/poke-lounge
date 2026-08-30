import {
  MAX_SUPPORTED_POKEMON_SPECIES_ID,
  MIN_SUPPORTED_POKEMON_SPECIES_ID,
} from "../battle/pokemon-species";

export const LEVEL_UP_MOVE_TABLE_JSON_PATH = "/game-data/level-up-move-table.json";
export const WILD_BATTLE_MOVE_SETS_JSON_PATH = "/game-data/wild-battle-move-sets.json";
export const BATTLE_POKEMON_ASSETS_JSON_PATH = "/game-data/battle-pokemon-assets.json";
export const POKEMON_DATA_JSON_PATH = "/game-data/pokemon-data.json";
export const BATTLE_POKEMON_SPRITE_FRAME_SIZE = 80;
export const BATTLE_POKEMON_SPRITE_SHEET_GRID_SIZE = 16;

const BATTLE_POKEMON_ASSET_MANIFEST_VERSION = 2;

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
  category: "physical" | "special" | "status";
  effectCode: number;
  effectChance: number;
  priority: number;
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
  pokemonDataRecordCount: number | null;
  moveNames: Record<number, string> | null;
  levelUpMoveTable: Record<number, LevelUpMoveRow[]> | null;
  wildBattleMoveSets: Record<number, number[]> | null;
  battlePokemonAssets: { spriteSheetRanges: BattlePokemonSpriteSheetRangeRecord[] } | null;
}

export interface RuntimeGameDataJson {
  pokemonData: unknown;
  levelUpMoveTable: unknown;
  wildBattleMoveSets: unknown;
  battlePokemonAssets: unknown;
}

const runtimeGameDataJsonState: RuntimeGameDataJsonState = {
  pokemonData: null,
  pokemonDataRecordCount: null,
  moveNames: null,
  levelUpMoveTable: null,
  wildBattleMoveSets: null,
  battlePokemonAssets: null,
};

export async function loadRuntimeGameDataJson(
  fetcher: typeof fetch = fetch,
): Promise<RuntimeGameDataJson> {
  const [pokemonData, levelUpMoveTable, wildBattleMoveSets, battlePokemonAssets] =
    await Promise.all([
      fetchJson(fetcher, POKEMON_DATA_JSON_PATH),
      fetchJson(fetcher, LEVEL_UP_MOVE_TABLE_JSON_PATH),
      fetchJson(fetcher, WILD_BATTLE_MOVE_SETS_JSON_PATH),
      fetchJson(fetcher, BATTLE_POKEMON_ASSETS_JSON_PATH),
    ]);

  const data = { pokemonData, levelUpMoveTable, wildBattleMoveSets, battlePokemonAssets };

  registerRuntimeGameDataJson(data);

  return data;
}

export function registerRuntimeGameDataJson(data: RuntimeGameDataJson): void {
  const { pokemonData, levelUpMoveTable, wildBattleMoveSets, battlePokemonAssets } = data;
  const normalizedPokemonData = isPokemonDataJson(pokemonData) ? pokemonData : null;
  const pokemonDataRecordCount = normalizePokemonDataRecordCount(pokemonData);
  const moveNames = normalizePokemonMoveNames(pokemonData);
  const normalizedLevelUpMoveTable = normalizeLevelUpMoveTable(levelUpMoveTable);
  const normalizedWildBattleMoveSets = normalizeWildBattleMoveSets(wildBattleMoveSets);
  const normalizedBattlePokemonAssets = normalizeBattlePokemonAssetManifest(battlePokemonAssets);

  if (
    !normalizedPokemonData ||
    !pokemonDataRecordCount ||
    !moveNames ||
    !normalizedLevelUpMoveTable ||
    !normalizedWildBattleMoveSets ||
    !normalizedBattlePokemonAssets ||
    !hasCompleteSupportedPokemonCoverage(normalizedPokemonData) ||
    !hasCompleteLevelUpMoveCoverage(normalizedLevelUpMoveTable, moveNames)
  ) {
    resetRuntimeGameDataJsonState();
    throw new Error("Required Poke Lounge runtime game data is incomplete.");
  }

  runtimeGameDataJsonState.pokemonData = normalizedPokemonData;
  runtimeGameDataJsonState.pokemonDataRecordCount = pokemonDataRecordCount;
  runtimeGameDataJsonState.moveNames = moveNames;
  runtimeGameDataJsonState.levelUpMoveTable = normalizedLevelUpMoveTable;
  runtimeGameDataJsonState.wildBattleMoveSets = normalizedWildBattleMoveSets;
  runtimeGameDataJsonState.battlePokemonAssets = normalizedBattlePokemonAssets;
}

export function getRuntimeLevelUpMoveTable(
  fallbackTable: Record<number, LevelUpMoveRow[]>,
): Record<number, LevelUpMoveRow[]> {
  return runtimeGameDataJsonState.levelUpMoveTable
    ? {
        ...fallbackTable,
        ...runtimeGameDataJsonState.levelUpMoveTable,
      }
    : fallbackTable;
}

export function getRuntimeWildBattleMoveSets(
  fallbackMoveSets: Record<number, number[]>,
): Record<number, number[]> {
  return runtimeGameDataJsonState.wildBattleMoveSets
    ? {
        ...fallbackMoveSets,
        ...runtimeGameDataJsonState.wildBattleMoveSets,
      }
    : fallbackMoveSets;
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
    !typeIds.every(typeId => Number.isInteger(typeId))
  ) {
    return null;
  }
  return {
    id: species.speciesId as number,
    name: species.name,
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

export function getRuntimeMoveName(moveId: number, fallbackName: string): string {
  return runtimeGameDataJsonState.moveNames?.[moveId] ?? fallbackName;
}

export function resetRuntimeGameDataJsonStateForTest(): void {
  resetRuntimeGameDataJsonState();
}

function resetRuntimeGameDataJsonState(): void {
  runtimeGameDataJsonState.pokemonData = null;
  runtimeGameDataJsonState.pokemonDataRecordCount = null;
  runtimeGameDataJsonState.moveNames = null;
  runtimeGameDataJsonState.levelUpMoveTable = null;
  runtimeGameDataJsonState.wildBattleMoveSets = null;
  runtimeGameDataJsonState.battlePokemonAssets = null;
}

export function normalizePokemonDataRecordCount(data: unknown): number | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const recordCount = Object.values(data.species).filter(value => {
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

  const moveNames = Object.entries(data.moves).reduce<Record<number, string>>(
    (accumulator, [moveIdKey, value]) => {
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
    },
    {},
  );

  return Object.keys(moveNames).length > 0 ? moveNames : null;
}

export function normalizeLevelUpMoveTable(data: unknown): Record<number, LevelUpMoveRow[]> | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const species = Object.entries(data.species).reduce<Record<number, LevelUpMoveRow[]>>(
    (accumulator, [speciesIdKey, value]) => {
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
    (accumulator, [speciesIdKey, value]) => {
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
    .filter((range): range is BattlePokemonSpriteSheetRangeRecord => range !== null)
    .sort((left, right) => left.startSpeciesId - right.startSpeciesId);

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

  return [...uniqueRows.values()].sort((left, right) => left.level - right.level);
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

    if (!rows?.length || rows.some(row => !moveNames[row.moveId])) {
      return false;
    }
  }

  return true;
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

  return ranges.every(
    (range, index) => index === 0 || range.startSpeciesId === ranges[index - 1].endSpeciesId + 1,
  );
}

async function fetchJson(fetcher: typeof fetch, path: string): Promise<unknown> {
  try {
    const response = await fetcher(path);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

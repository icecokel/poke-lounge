import { MAX_POKEMON_LEVEL, MIN_POKEMON_LEVEL, type WildEncounterSlot } from "./wildEncounters";

export const DEFAULT_WILD_ENCOUNTER_TABLE_ID = "starter-field";
export const WILD_ENCOUNTER_TABLES_JSON_ASSET = [
  "wildEncounterTables",
  "/game-data/wild-encounter-tables.json",
] as const;

export interface WildEncounterTableData {
  version: 1 | 2;
  defaultTableId: string;
  tables: WildEncounterTable[];
}

export interface WildEncounterTable {
  id: string;
  mapKeys: string[];
  areaIds?: string[];
  encounterRate?: number;
  slots: WildEncounterSlot[];
}

export interface WildEncounterConfig {
  encounterRate?: number;
  slots: ReadonlyArray<WildEncounterSlot>;
}

interface WildEncounterSpeciesRange {
  startNationalDexId: number;
  endNationalDexId: number;
}

interface EncounterPokemonRecord {
  speciesId: number;
  nationalDexId: number;
  name: string;
  catchRate: number;
}

export function selectWildEncounterConfig(
  data: unknown,
  mapKey: string,
  areaId?: string | null,
  pokemonData?: unknown,
): WildEncounterConfig | undefined {
  const table = selectWildEncounterTable(data, mapKey, areaId, pokemonData);

  return table
    ? {
        ...(table.encounterRate !== undefined ? { encounterRate: table.encounterRate } : {}),
        slots: table.slots,
      }
    : undefined;
}

export function selectWildEncounterSlots(
  data: unknown,
  mapKey: string,
  areaId?: string | null,
  pokemonData?: unknown,
): ReadonlyArray<WildEncounterSlot> | undefined {
  return selectWildEncounterConfig(data, mapKey, areaId, pokemonData)?.slots;
}

function selectWildEncounterTable(
  data: unknown,
  mapKey: string,
  areaId?: string | null,
  pokemonData?: unknown,
): WildEncounterTable | undefined {
  const tableData = normalizeWildEncounterTableData(data, pokemonData);

  if (!tableData) {
    return undefined;
  }

  const areaTable = areaId
    ? tableData.tables.find(
        table => table.mapKeys.includes(mapKey) && table.areaIds?.includes(areaId),
      )
    : undefined;
  const mapTable = tableData.tables.find(
    table => table.mapKeys.includes(mapKey) && !table.areaIds?.length,
  );
  const defaultTable = tableData.tables.find(table => table.id === tableData.defaultTableId);

  return areaTable ?? mapTable ?? defaultTable;
}

export function normalizeWildEncounterTableData(
  data: unknown,
  pokemonData?: unknown,
): WildEncounterTableData | null {
  if (!isRecord(data)) {
    return null;
  }

  const version = data.version;

  if ((version !== 1 && version !== 2) || typeof data.defaultTableId !== "string") {
    return null;
  }

  if (!Array.isArray(data.tables)) {
    return null;
  }

  const pokemonRecords = version === 2 ? normalizeEncounterPokemonRecords(pokemonData) : null;

  if (version === 2 && !pokemonRecords) {
    return null;
  }

  const tables = data.tables
    .map(table => normalizeWildEncounterTable(table, version, pokemonRecords ?? []))
    .filter((table): table is WildEncounterTable => table !== null);

  if (tables.length === 0) {
    return null;
  }

  return {
    version,
    defaultTableId: data.defaultTableId,
    tables,
  };
}

function normalizeWildEncounterTable(
  data: unknown,
  version: 1 | 2,
  pokemonRecords: ReadonlyArray<EncounterPokemonRecord>,
): WildEncounterTable | null {
  if (!isRecord(data) || typeof data.id !== "string" || data.id.length === 0) {
    return null;
  }

  const slots =
    version === 1
      ? normalizeExplicitEncounterSlots(data.slots)
      : expandEncounterSpeciesRanges(
          data.speciesRanges,
          pokemonRecords,
          data.commonNationalDexIds,
          data.rarePoolWeight,
        );

  if (slots.length === 0) {
    return null;
  }

  return {
    id: data.id,
    ...(Array.isArray(data.areaIds)
      ? { areaIds: data.areaIds.filter((areaId): areaId is string => typeof areaId === "string") }
      : {}),
    mapKeys: Array.isArray(data.mapKeys)
      ? data.mapKeys.filter((mapKey): mapKey is string => typeof mapKey === "string")
      : [],
    slots,
    ...(typeof data.encounterRate === "number" && Number.isFinite(data.encounterRate)
      ? { encounterRate: Math.max(0, Math.min(1, data.encounterRate)) }
      : {}),
  };
}

function normalizeExplicitEncounterSlots(data: unknown): WildEncounterSlot[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(normalizeWildEncounterSlot)
    .filter((slot): slot is WildEncounterSlot => slot !== null);
}

function expandEncounterSpeciesRanges(
  data: unknown,
  pokemonRecords: ReadonlyArray<EncounterPokemonRecord>,
  commonNationalDexIdsData: unknown,
  rarePoolWeightData: unknown,
): WildEncounterSlot[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const ranges = data
    .map(normalizeEncounterSpeciesRange)
    .filter((range): range is WildEncounterSpeciesRange => range !== null);

  if (ranges.length === 0) {
    return [];
  }

  const records = pokemonRecords.filter(record =>
    ranges.some(
      range =>
        record.nationalDexId >= range.startNationalDexId &&
        record.nationalDexId <= range.endNationalDexId,
    ),
  );
  const commonNationalDexIds = Array.isArray(commonNationalDexIdsData)
    ? new Set(commonNationalDexIdsData.filter(isPositiveInteger))
    : null;
  const rareRecords = commonNationalDexIds
    ? records.filter(record => !commonNationalDexIds.has(record.nationalDexId))
    : [];
  const rareSlotWeight =
    commonNationalDexIds &&
    commonNationalDexIds.size > 0 &&
    rareRecords.length > 0 &&
    typeof rarePoolWeightData === "number" &&
    Number.isFinite(rarePoolWeightData) &&
    rarePoolWeightData > 0
      ? rarePoolWeightData / rareRecords.length
      : null;

  return records.map(record => ({
    speciesId: record.speciesId,
    name: record.name,
    minLevel: MIN_POKEMON_LEVEL,
    maxLevel: MAX_POKEMON_LEVEL,
    weight:
      rareSlotWeight !== null && !commonNationalDexIds?.has(record.nationalDexId)
        ? rareSlotWeight
        : resolveWildEncounterWeight(record.catchRate),
  }));
}

function normalizeEncounterSpeciesRange(data: unknown): WildEncounterSpeciesRange | null {
  if (
    !isRecord(data) ||
    !isPositiveInteger(data.startNationalDexId) ||
    !isPositiveInteger(data.endNationalDexId) ||
    data.startNationalDexId > data.endNationalDexId
  ) {
    return null;
  }

  return {
    startNationalDexId: data.startNationalDexId,
    endNationalDexId: data.endNationalDexId,
  };
}

function normalizeEncounterPokemonRecords(data: unknown): EncounterPokemonRecord[] | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.species)) {
    return null;
  }

  const records = Object.values(data.species)
    .map(normalizeEncounterPokemonRecord)
    .filter((record): record is EncounterPokemonRecord => record !== null)
    .sort(
      (left, right) => left.nationalDexId - right.nationalDexId || left.speciesId - right.speciesId,
    );
  const recordsByNationalDexId = new Map<number, EncounterPokemonRecord>();

  for (const record of records) {
    if (!recordsByNationalDexId.has(record.nationalDexId)) {
      recordsByNationalDexId.set(record.nationalDexId, record);
    }
  }

  return recordsByNationalDexId.size > 0 ? [...recordsByNationalDexId.values()] : null;
}

function normalizeEncounterPokemonRecord(data: unknown): EncounterPokemonRecord | null {
  if (
    !isRecord(data) ||
    !isPositiveInteger(data.speciesId) ||
    !isPositiveInteger(data.nationalDexId) ||
    data.encounterable !== true ||
    typeof data.name !== "string" ||
    data.name.trim().length === 0 ||
    typeof data.catchRate !== "number" ||
    !Number.isFinite(data.catchRate) ||
    data.catchRate < 0
  ) {
    return null;
  }

  return {
    speciesId: data.speciesId,
    nationalDexId: data.nationalDexId,
    name: data.name.trim(),
    catchRate: data.catchRate,
  };
}

function resolveWildEncounterWeight(catchRate: number): number {
  if (catchRate >= 190) {
    return 8;
  }

  if (catchRate >= 120) {
    return 6;
  }

  if (catchRate >= 60) {
    return 4;
  }

  if (catchRate >= 30) {
    return 2;
  }

  return 1;
}

function normalizeWildEncounterSlot(data: unknown): WildEncounterSlot | null {
  if (!isRecord(data)) {
    return null;
  }

  if (
    typeof data.speciesId !== "number" ||
    !Number.isInteger(data.speciesId) ||
    data.speciesId < 1 ||
    typeof data.name !== "string" ||
    data.name.length === 0 ||
    typeof data.minLevel !== "number" ||
    !Number.isFinite(data.minLevel) ||
    typeof data.maxLevel !== "number" ||
    !Number.isFinite(data.maxLevel) ||
    typeof data.weight !== "number" ||
    !Number.isFinite(data.weight) ||
    data.weight <= 0
  ) {
    return null;
  }

  const minLevel = Math.max(1, Math.min(100, Math.round(data.minLevel)));
  const maxLevel = Math.max(1, Math.min(100, Math.round(data.maxLevel)));

  return {
    speciesId: data.speciesId,
    name: data.name,
    minLevel: Math.min(minLevel, maxLevel),
    maxLevel: Math.max(minLevel, maxLevel),
    weight: data.weight,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

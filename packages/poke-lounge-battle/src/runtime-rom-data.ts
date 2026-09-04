export const GEN4_PLAYABLE_MOVE_MIN_ID = 1;
export const GEN4_PLAYABLE_MOVE_MAX_ID = 467;
export const GEN4_MOVE_RECORD_MAX_ID = 470;
export const GEN4_MOVE_MAX_PP = 40;

const GEN4_TYPE_NAMES = [
  "노말",
  "격투",
  "비행",
  "독",
  "땅",
  "바위",
  "벌레",
  "고스트",
  "강철",
  "???",
  "불꽃",
  "물",
  "풀",
  "전기",
  "에스퍼",
  "얼음",
  "드래곤",
  "악",
] as const;
const GEN4_MOVE_CATEGORIES = ["physical", "special", "status"] as const;
const GEN4_MOVE_RANGES = new Set([0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]);

export interface Gen4MoveRecord {
  id: number;
  rawHex: string;
  effectCode: number;
  category: (typeof GEN4_MOVE_CATEGORIES)[number];
  categoryId: number;
  power: number;
  typeId: number;
  typeName: string;
  accuracy: number;
  pp: number;
  effectChance: number;
  range: number;
  priority: number;
  name?: string;
  flags: number;
  contestEffect: number;
  contestType: number;
  unknown14: number;
}

export function readCompleteGen4MoveRecords(data: unknown): Record<number, Gen4MoveRecord> | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.moves)) {
    return null;
  }
  const moves = data.moves;
  const typeNames = data.typeNames;
  const moveCategories = data.moveCategories;
  if (
    !Array.isArray(typeNames) ||
    typeNames.length !== GEN4_TYPE_NAMES.length ||
    !typeNames.every(function testItem(value, index) {
      return value === GEN4_TYPE_NAMES[index];
    }) ||
    !isRecord(moveCategories) ||
    Object.keys(moveCategories).length !== GEN4_MOVE_CATEGORIES.length ||
    !GEN4_MOVE_CATEGORIES.every(function testItem(value, index) {
      return moveCategories[String(index)] === value;
    }) ||
    Object.keys(moves).length !== GEN4_MOVE_RECORD_MAX_ID + 1
  ) {
    return null;
  }

  const records: Record<number, Gen4MoveRecord> = {};
  const names = new Set<string>();
  for (let moveId = 0; moveId <= GEN4_MOVE_RECORD_MAX_ID; moveId += 1) {
    const record = readGen4MoveRecord(moves[String(moveId)], moveId);
    if (!record) {
      return null;
    }
    if (moveId >= GEN4_PLAYABLE_MOVE_MIN_ID && moveId <= GEN4_PLAYABLE_MOVE_MAX_ID) {
      if (!record.name || names.has(record.name)) {
        return null;
      }
      names.add(record.name);
    }
    records[moveId] = record;
  }
  return records;
}

export function readGen4MoveRecord(value: unknown, expectedId: number): Gen4MoveRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    id,
    rawHex,
    effectCode,
    category,
    categoryId,
    power,
    typeId,
    typeName,
    accuracy,
    pp,
    effectChance,
    range,
    priority,
  } = value;
  const hasName = Object.hasOwn(value, "name");
  const name = typeof value.name === "string" ? value.name.trim() : undefined;
  const requiresName =
    expectedId >= GEN4_PLAYABLE_MOVE_MIN_ID && expectedId <= GEN4_PLAYABLE_MOVE_MAX_ID;
  if (
    id !== expectedId ||
    (requiresName && (!name || value.name !== name)) ||
    (!requiresName && hasName) ||
    typeof rawHex !== "string" ||
    !/^[0-9a-f]{32}$/.test(rawHex) ||
    !isIntegerBetween(effectCode, 0, 276) ||
    !isIntegerBetween(categoryId, 0, GEN4_MOVE_CATEGORIES.length - 1) ||
    category !== GEN4_MOVE_CATEGORIES[categoryId] ||
    !isIntegerBetween(power, 0, 255) ||
    !isIntegerBetween(typeId, 0, GEN4_TYPE_NAMES.length - 1) ||
    typeName !== GEN4_TYPE_NAMES[typeId] ||
    !isIntegerBetween(accuracy, 0, 100) ||
    !isIntegerBetween(pp, expectedId === 0 ? 0 : 1, expectedId === 0 ? 0 : GEN4_MOVE_MAX_PP) ||
    !isIntegerBetween(effectChance, 0, 100) ||
    !isIntegerBetween(range, 0, 1024) ||
    !GEN4_MOVE_RANGES.has(range) ||
    !isIntegerBetween(priority, -7, 5)
  ) {
    return null;
  }

  const bytes = Array.from({ length: 16 }, function mapItem(_, index) {
    return Number.parseInt(rawHex.slice(index * 2, index * 2 + 2), 16);
  });
  if (
    effectCode !== bytes[0] + bytes[1] * 256 ||
    categoryId !== bytes[2] ||
    power !== bytes[3] ||
    typeId !== bytes[4] ||
    accuracy !== bytes[5] ||
    pp !== bytes[6] ||
    effectChance !== bytes[7] ||
    range !== bytes[8] + bytes[9] * 256 ||
    priority !== (bytes[10] >= 128 ? bytes[10] - 256 : bytes[10])
  ) {
    return null;
  }

  if (
    !isIntegerBetween(value.flags, 0, 255) ||
    value.flags !== bytes[11] ||
    !isIntegerBetween(value.contestEffect, 0, 23) ||
    value.contestEffect !== bytes[12] ||
    !isIntegerBetween(value.contestType, 0, 4) ||
    value.contestType !== bytes[13] ||
    value.unknown14 !== 0 ||
    value.unknown14 !== bytes[14] + bytes[15] * 256
  ) {
    return null;
  }

  return value as unknown as Gen4MoveRecord;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

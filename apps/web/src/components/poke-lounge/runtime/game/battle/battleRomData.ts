export type RomFieldEncoding = "u8" | "u16le";
export type Gen4MoveCategory = "physical" | "special" | "status";

export interface RomCandidateField {
  value: number;
  offset: number;
  width: number;
  encoding?: RomFieldEncoding;
  note?: string;
  hypothesis?: string;
  confidence?: number | string;
}

export interface RomBattleMoveRecord {
  index: number;
  raw_hex: string;
  candidate_fields?: Record<string, RomCandidateField>;
  refined_candidate_fields?: Record<string, RomCandidateField>;
}

export interface RomBackedMoveDefinition {
  id: number;
  name: string;
  effectCode: number;
  effectChance: number;
  priority: number;
  category: Gen4MoveCategory;
  power: number;
  typeId: number;
  typeName: string;
  accuracy: number;
  pp: number;
  maxPp: number;
  rawHex: string;
}

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

export function getGen4TypeName(typeId: number): string {
  return GEN4_TYPE_NAMES[typeId] ?? `type-${typeId}`;
}

const GEN4_CATEGORIES: Record<number, Gen4MoveCategory> = {
  0: "physical",
  1: "special",
  2: "status",
};

export function normalizeRomMoveRecord(
  record: RomBattleMoveRecord,
  name = `Move ${record.index}`,
): RomBackedMoveDefinition {
  const fields = record.refined_candidate_fields ?? record.candidate_fields ?? {};
  const effectCode = fields.effect?.value ?? 0;
  const categoryValue = fields.category?.value ?? 2;
  const typeId = fields.type?.value ?? 0;
  const pp = fields.pp?.value ?? 0;
  const effectChance = Number.parseInt(record.raw_hex.slice(14, 16), 16) || 0;
  const priorityByte = Number.parseInt(record.raw_hex.slice(20, 22), 16) || 0;

  return {
    id: record.index,
    name,
    effectCode,
    effectChance,
    priority: priorityByte > 127 ? priorityByte - 256 : priorityByte,
    category: GEN4_CATEGORIES[categoryValue] ?? "status",
    power: fields.power?.value ?? 0,
    typeId,
    typeName: getGen4TypeName(typeId),
    accuracy: fields.accuracy?.value ?? 0,
    pp,
    maxPp: pp,
    rawHex: record.raw_hex,
  };
}

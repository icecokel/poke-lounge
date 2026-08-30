export const EVOLUTION_STONE_CATALOG = {
  sunStone: {
    id: "sunStone",
    displayName: "태양의돌",
    description: "특정 포켓몬을 진화시키는 태양처럼 붉은 돌이다.",
    evolutionParameter: 80,
    evolutionMethods: [7],
  },
  moonStone: {
    id: "moonStone",
    displayName: "달의돌",
    description: "특정 포켓몬을 진화시키는 밤하늘처럼 검은 돌이다.",
    evolutionParameter: 81,
    evolutionMethods: [7],
  },
  fireStone: {
    id: "fireStone",
    displayName: "불꽃의돌",
    description: "특정 포켓몬을 진화시키는 주황색 돌이다.",
    evolutionParameter: 82,
    evolutionMethods: [7],
  },
  thunderStone: {
    id: "thunderStone",
    displayName: "천둥의돌",
    description: "특정 포켓몬을 진화시키는 번개 무늬의 돌이다.",
    evolutionParameter: 83,
    evolutionMethods: [7],
  },
  waterStone: {
    id: "waterStone",
    displayName: "물의돌",
    description: "특정 포켓몬을 진화시키는 맑은 물빛 돌이다.",
    evolutionParameter: 84,
    evolutionMethods: [7],
  },
  leafStone: {
    id: "leafStone",
    displayName: "리프의돌",
    description: "특정 포켓몬을 진화시키는 잎사귀 무늬의 돌이다.",
    evolutionParameter: 85,
    evolutionMethods: [7],
  },
  shinyStone: {
    id: "shinyStone",
    displayName: "빛의돌",
    description: "특정 포켓몬을 진화시키는 눈부시게 빛나는 돌이다.",
    evolutionParameter: 107,
    evolutionMethods: [7],
  },
  duskStone: {
    id: "duskStone",
    displayName: "어둠의돌",
    description: "특정 포켓몬을 진화시키는 그림자처럼 어두운 돌이다.",
    evolutionParameter: 108,
    evolutionMethods: [7],
  },
  dawnStone: {
    id: "dawnStone",
    displayName: "각성의돌",
    description: "특정 포켓몬의 숨겨진 능력을 깨워 진화시키는 돌이다.",
    evolutionParameter: 109,
    evolutionMethods: [16, 17],
  },
} as const;

export const EVOLUTION_STONE_ITEM_IDS = [
  "sunStone",
  "moonStone",
  "fireStone",
  "thunderStone",
  "waterStone",
  "leafStone",
  "shinyStone",
  "duskStone",
  "dawnStone",
] as const satisfies ReadonlyArray<keyof typeof EVOLUTION_STONE_CATALOG>;

export type EvolutionStoneItemId = (typeof EVOLUTION_STONE_ITEM_IDS)[number];

export function isEvolutionStoneItemId(itemId: string): itemId is EvolutionStoneItemId {
  return EVOLUTION_STONE_ITEM_IDS.some(candidate => candidate === itemId);
}

import { RUNTIME_ITEM_ROM_IDS } from "./runtime-items";

export const EVOLUTION_STONE_CATALOG = {
  sunStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.sunStone,
    evolutionMethods: [7],
  },
  moonStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.moonStone,
    evolutionMethods: [7],
  },
  fireStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.fireStone,
    evolutionMethods: [7],
  },
  thunderStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.thunderStone,
    evolutionMethods: [7],
  },
  waterStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.waterStone,
    evolutionMethods: [7],
  },
  leafStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.leafStone,
    evolutionMethods: [7],
  },
  shinyStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.shinyStone,
    evolutionMethods: [7],
  },
  duskStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.duskStone,
    evolutionMethods: [7],
  },
  dawnStone: {
    evolutionParameter: RUNTIME_ITEM_ROM_IDS.dawnStone,
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

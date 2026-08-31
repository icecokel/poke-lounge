export const POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS = {
  potion: 17,
  pokeball: 4,
  antidote: 18,
  superPotion: 26,
  hyperPotion: 25,
  revive: 28,
  ultraBall: 2,
  rareCandy: 50,
  sunStone: 80,
  moonStone: 81,
  fireStone: 82,
  thunderStone: 83,
  waterStone: 84,
  leafStone: 85,
  shinyStone: 107,
  duskStone: 108,
  dawnStone: 109,
} as const;

export type PokeLoungeRuntimeItemId = keyof typeof POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS;

export const FIELD_NPC_BASE = {
  displaySize: {
    width: 40,
    height: 40,
  },
  hitbox: {
    width: 24,
    height: 20,
    offsetX: 4,
    offsetY: 12,
  },
} as const;

export const FIELD_MAP = {
  key: "town",
  mapUrl: "/maps/pokemmo-reference/town.json",
  tilesetKey: "tuxmon-sample-32px-extruded",
  tilesetName: "tuxmon-sample-32px-extruded",
  tilesetUrl: "/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png",
  tallGrass: {
    regionLayerName: "TallGrassZones",
    baseLayerName: "Tall Grass",
    foregroundLayerName: "Tall Grass Foreground",
    baseTileIndex: 122,
    foregroundTileIndex: 146,
  },
  player: {
    textureKey: "currentPlayer",
    atlasUrl: "/assets/poke-lounge/player/hero-atlas.png",
    atlasJsonUrl: "/assets/poke-lounge/player/hero-atlas.json",
    sourceFrames: "/assets/poke-lounge/textures/a_0_8_1_0069/hero_1.png..hero_16.png",
    displaySize: {
      width: 40,
      height: 40,
    },
    hitbox: {
      width: 24,
      height: 24,
      offsetX: 4,
      offsetY: 8,
    },
    frameNames: {
      back: "hero-back",
      front: "hero-front",
      left: "hero-left",
      right: "hero-right",
    },
    walkAnimationKeys: {
      back: "hero-back-walk",
      front: "hero-front-walk",
      left: "hero-left-walk",
      right: "hero-right-walk",
    },
  },
  npcs: {
    nurse: {
      ...FIELD_NPC_BASE,
      textureKey: "field-npc-nurse",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0133/pcwoman1_5.png",
    },
    shopkeeper: {
      ...FIELD_NPC_BASE,
      textureKey: "field-npc-shopkeeper",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0132/shopm1_5.png",
    },
    premiumShopkeeper: {
      ...FIELD_NPC_BASE,
      textureKey: "field-npc-premium-shopkeeper",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0039/gentleman_5.png",
    },
    gamehost: {
      ...FIELD_NPC_BASE,
      textureKey: "field-npc-gamehost",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0184/mania_5.png",
    },
    soloChallenger: {
      ...FIELD_NPC_BASE,
      textureKey: "field-npc-solo-challenger",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0039/gentleman_5.png",
    },
    storagePc: {
      displaySize: {
        width: 40,
        height: 40,
      },
      hitbox: {
        width: 26,
        height: 18,
        offsetX: 3,
        offsetY: 14,
      },
      textureKey: "field-object-storage-pc",
      imageUrl: "/assets/poke-lounge/textures/a_0_7_0_0093/tmfl04_door1.png",
    },
  },
  sourceRepository: "aaron5670/PokeMMO-Online-Realtime-Multiplayer-Game",
  defaultSpawn: "Spawn Point",
  fallbackSpawn: {
    x: 656,
    y: 446,
  },
  recoverySpawn: {
    x: 640,
    y: 304,
    facing: "back",
  },
  encounterAreas: [
    {
      id: "town-west-field",
      x: 0,
      y: 64,
      width: 640,
      height: 352,
    },
    {
      id: "town-plaza-field",
      x: 640,
      y: 64,
      width: 512,
      height: 352,
    },
    {
      id: "town-south-field",
      x: 0,
      y: 416,
      width: 1280,
      height: 160,
    },
  ],
  maxPlayers: 6,
} as const;

export const POKE_WORLD_MESSAGES = [
  "CURRENT_PLAYERS",
  "PLAYER_JOINED",
  "PLAYER_MOVED",
  "PLAYER_MOVEMENT_ENDED",
  "PLAYER_CHANGED_MAP",
  "PLAYER_LEFT",
] as const;

export function resolveFieldEncounterAreaId(
  position: { x: number; y: number },
  areas: ReadonlyArray<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = FIELD_MAP.encounterAreas,
): string | null {
  const area = areas.find(function findItem(candidate) {
    return (
      position.x >= candidate.x &&
      position.x < candidate.x + candidate.width &&
      position.y >= candidate.y &&
      position.y < candidate.y + candidate.height
    );
  });

  return area?.id ?? null;
}

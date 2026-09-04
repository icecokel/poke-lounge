import { createTournamentBracketState } from "@poke-lounge/battle/tournament-bracket";

import { getPokeLoungeCopy } from "./poke-lounge-copy";
import type { GameBootstrapData } from "./runtime/types";
import {
  createBattleUiStore,
  type BattlePresentationState,
  type BattleUiStore,
} from "./runtime/game/battle/battle-ui-store";
import type { MobileBattleUiState } from "./runtime/game/ui/mobile-battle-ui";
import type {
  MobileWorldUiState,
  PokeLoungePartySlotSummary,
} from "./runtime/game/ui/mobile-world-ui";
import type { TournamentStateRoomPayload } from "./runtime/game/network/tournament-projection";
import {
  createDefaultGameState,
  createDefaultLocalPlayer,
  createGameStateStore,
  type GameStateStore,
  type PlayerPokemon,
} from "./runtime/game/state/game-state-store";
import {
  createWorldFrameStore,
  type WorldFrameStore,
} from "./runtime/game/world/world-frame-store";
import type { WorldMapModel, WorldPlayerAtlasModel } from "./runtime/game/world/world-map-model";
import { createWorldUiStore, type WorldUiStore } from "./runtime/game/world/world-ui-store";

export const storyCopy = getPokeLoungeCopy("ko-KR");
export const storyNoop = () => undefined;
export const storyAsyncNoop = async () => undefined;

export const storyPokemon: PlayerPokemon = {
  speciesId: 152,
  name: "치코리타",
  level: 18,
  currentHp: 45,
  maxHp: 52,
  experience: 2_120,
  growthRate: 3,
  status: "normal",
  moves: [
    { id: 33, name: "몸통박치기", pp: 31, maxPp: 35 },
    { id: 45, name: "울음소리", pp: 40, maxPp: 40 },
  ],
};

const storySecondPokemon: PlayerPokemon = {
  speciesId: 155,
  name: "브케인",
  level: 17,
  currentHp: 12,
  maxHp: 46,
  experience: 1_840,
  growthRate: 3,
  status: "burned",
  moves: [
    { id: 52, name: "불꽃세례", pp: 20, maxPp: 25 },
    { id: 98, name: "전광석화", pp: 27, maxPp: 30 },
  ],
};

export const storyParty: PokeLoungePartySlotSummary[] = Array.from(
  { length: 6 },
  function callback(_, slotIndex) {
    if (slotIndex === 0) {
      return {
        canSetAsLead: false,
        currentHp: 45,
        isActive: true,
        isEmpty: false,
        level: 18,
        maxHp: 52,
        name: "치코리타",
        slotIndex,
        status: "normal",
      };
    }
    if (slotIndex === 1) {
      return {
        canSetAsLead: true,
        currentHp: 12,
        isActive: false,
        isEmpty: false,
        level: 17,
        maxHp: 46,
        name: "브케인",
        slotIndex,
        status: "burned",
      };
    }
    return {
      canSetAsLead: false,
      currentHp: null,
      isActive: false,
      isEmpty: true,
      level: 0,
      maxHp: null,
      name: "-",
      slotIndex,
      status: null,
    };
  },
);

export const storyBootstrap: GameBootstrapData = {
  version: 1,
  maxPlayers: 8,
  starters: [
    {
      id: "chikorita",
      speciesId: 152,
      name: "Chikorita",
      displayName: "치코리타",
      type: "Grass",
      assetPath: "/assets/pokemon/front/152.png",
    },
    {
      id: "cyndaquil",
      speciesId: 155,
      name: "Cyndaquil",
      displayName: "브케인",
      type: "Fire",
      assetPath: "/assets/pokemon/front/155.png",
    },
    {
      id: "totodile",
      speciesId: 158,
      name: "Totodile",
      displayName: "리아코",
      type: "Water",
      assetPath: "/assets/pokemon/front/158.png",
    },
  ],
};

const storyParticipants = Array.from({ length: 5 }, function callback(_, index) {
  return {
    playerId: `player-${index + 1}`,
    displayName: index === 0 ? "나" : index === 4 ? "AI 트레이너" : `트레이너 ${index + 1}`,
  };
});
const storyBracket = createTournamentBracketState(storyParticipants, 1);

export const storyLobbyProjection: TournamentStateRoomPayload = {
  revision: 1,
  roomCode: "ROOM01",
  hostPlayerId: "player-1",
  roundIndex: 0,
  roomStatus: "waiting",
  roomRound: {
    index: 0,
    phase: "waiting",
    durationMs: 300_000,
    startedAtMs: null,
    endsAtMs: null,
  },
  participants: storyParticipants.slice(0, 3).map(function mapItem(participant, index) {
    return {
      ...participant,
      controller: index === 2 ? ("ai" as const) : ("human" as const),
      role: "participant" as const,
      ready: index !== 1,
      partyReady: true,
      connected: true,
      seed: null,
    };
  }),
  tournament: {
    version: 2,
    bracket: null,
    activeMatchId: null,
    activeMatchAuthority: null,
    cumulativeScores: {},
  },
  ownPlayerId: "player-1",
  activeMatchTransport: "awaiting-authority",
  competitionKind: null,
  finalStandings: [],
  resultSync: { matchId: null, status: "idle" },
};

export const storyTournamentProjection: TournamentStateRoomPayload = {
  ...storyLobbyProjection,
  roundIndex: 1,
  roomStatus: "tournament",
  roomRound: {
    index: 1,
    phase: "tournament",
    durationMs: 300_000,
    startedAtMs: Date.now(),
    endsAtMs: Date.now() + 180_000,
  },
  participants: storyBracket.participants.map(function mapItem(participant) {
    return {
      ...participant,
      controller: "human" as const,
      role: "participant" as const,
      ready: true,
      partyReady: true,
      connected: true,
    };
  }),
  tournament: {
    version: 2,
    bracket: storyBracket,
    activeMatchId: storyBracket.currentRound?.matches[0]?.matchId ?? null,
    activeMatchAuthority: "casual",
    cumulativeScores: { "player-1": 120, "player-2": 90 },
  },
  ownPlayerId: "player-4",
  activeMatchTransport: "casual",
  competitionKind: "tournament-unranked",
};

export const storyMobileWorldState: MobileWorldUiState = {
  box: [
    {
      boxIndex: 0,
      currentHp: 48,
      level: 16,
      maxHp: 48,
      name: "리아코",
      selected: true,
      status: "normal",
    },
  ],
  dice: {
    options: [
      {
        disabled: false,
        label: "낮다",
        prediction: "lower",
        rewardPokeDollars: 200,
        selected: true,
        winningCaseCount: 3,
      },
      {
        disabled: false,
        label: "같다",
        prediction: "equal",
        rewardPokeDollars: 600,
        selected: false,
        winningCaseCount: 1,
      },
      {
        disabled: false,
        label: "높다",
        prediction: "higher",
        rewardPokeDollars: 300,
        selected: false,
        winningCaseCount: 2,
      },
    ],
    stakePokeDollars: 100,
    targetNumber: 4,
  },
  items: [
    {
      count: 4,
      description: "포켓몬의 HP를 20 회복한다.",
      disabled: false,
      id: "potion",
      index: 0,
      name: "상처약",
      price: 300,
      selected: true,
    },
    {
      count: 10,
      description: "야생 포켓몬을 잡기 위한 도구.",
      disabled: false,
      id: "pokeball",
      index: 1,
      name: "몬스터볼",
      price: 200,
      selected: false,
    },
  ],
  inputMode: "keyboard",
  message: "",
  moveReplacement: {
    moves: [
      { id: 33, index: 0, name: "몸통박치기", selected: true },
      { id: 45, index: 1, name: "울음소리", selected: false },
      { id: 73, index: 2, name: "씨뿌리기", selected: false },
      { id: 75, index: 3, name: "잎날가르기", selected: false },
    ],
    newMoveName: "매지컬리프",
    pokemonName: "치코리타",
  },
  party: storyParty,
  pcFocus: "party",
  screen: "explore",
  selectedItemDescription: "포켓몬의 HP를 20 회복한다.",
  selectedItemName: "상처약",
  selectedPartySlotIndex: 0,
  title: "필드 조작",
  walletPokeDollars: 3_200,
};

export const storyBattleControls: MobileBattleUiState = {
  phase: "command",
  message: null,
  isHelpOpen: false,
  isInputLocked: false,
  canGoBack: false,
  isForcedPartySwitch: false,
  commands: [
    { id: "fight", selected: true },
    { id: "bag", selected: false },
    { id: "pokemon", selected: false },
    { id: "run", selected: false },
  ],
  moves: [
    {
      index: 0,
      name: "몸통박치기",
      pp: 31,
      maxPp: 35,
      type: "노말",
      effectNotice: null,
      selected: true,
      disabled: false,
    },
    {
      index: 1,
      name: "잎날가르기",
      pp: 24,
      maxPp: 25,
      type: "풀",
      effectNotice: null,
      selected: false,
      disabled: false,
    },
  ],
  party: storyParty.map(function mapItem(pokemon) {
    return {
      slotIndex: pokemon.slotIndex,
      name: pokemon.name,
      level: pokemon.level,
      currentHp: pokemon.currentHp ?? 0,
      maxHp: pokemon.maxHp ?? 0,
      status: pokemon.status,
      selected: pokemon.slotIndex === 1,
      isCurrent: pokemon.slotIndex === 0,
      isFainted: pokemon.status === "fainted",
      isEmpty: pokemon.isEmpty,
      canSwitch: pokemon.slotIndex === 1,
      sprite: pokemon.isEmpty
        ? null
        : {
            assetKey: `party-${pokemon.slotIndex}`,
            frame: 0,
            path: `/assets/pokemon/front/${pokemon.slotIndex === 0 ? 152 : 155}.png`,
          },
    };
  }),
  items: [
    { index: 0, id: "potion", name: "상처약", count: 4, selected: true, disabled: false },
    {
      index: 1,
      id: "pokeball",
      name: "몬스터볼",
      count: 10,
      selected: false,
      disabled: false,
    },
  ],
  moveReplacement: {
    pokemonName: "치코리타",
    newMoveName: "매지컬리프",
    newMovePp: 20,
    newMoveMaxPp: 20,
    newMoveType: "풀",
  },
};

export const storyBattlePresentation: BattlePresentationState = {
  authoritative: { connectionStatus: "online", inputPending: false, spectating: false },
  battleKind: "wild",
  capture: null,
  entrance: { active: false, progress: 1 },
  evolution: null,
  help: { inputMode: "keyboard", open: false },
  message: null,
  opponent: {
    currentHp: 34,
    displayedHp: 34,
    level: 17,
    maxHp: 46,
    name: "브케인",
    sprite: {
      alpha: 1,
      height: 72,
      sprite: {
        assetKey: "cyndaquil-front",
        frame: 0,
        path: "/assets/pokemon/battle/155/front-default-normal.png",
      },
      tint: null,
      width: 72,
      x: 164,
      y: 43,
    },
    status: "normal",
  },
  phase: "command",
  player: {
    currentHp: 45,
    displayedHp: 45,
    level: 18,
    maxHp: 52,
    name: "치코리타",
    sprite: {
      alpha: 1,
      height: 80,
      sprite: {
        assetKey: "chikorita-back",
        frame: 0,
        path: "/assets/pokemon/battle/152/back-default-normal.png",
      },
      tint: null,
      width: 80,
      x: 64,
      y: 104,
    },
    status: "normal",
  },
};

export function createStoryBattleUiStore(
  presentation: BattlePresentationState = storyBattlePresentation,
  controls: MobileBattleUiState = storyBattleControls,
): BattleUiStore {
  const store = createBattleUiStore();
  store.publish({ controls, presentation });
  return store;
}

export function createStoryGameStateStore(): GameStateStore {
  const localPlayer = {
    ...createDefaultLocalPlayer(),
    displayName: "나",
    party: [
      { slotIndex: 0, pokemon: storyPokemon },
      { slotIndex: 1, pokemon: storySecondPokemon },
    ],
    pokemonBox: [{ speciesId: 158, name: "리아코", level: 16, currentHp: 48, maxHp: 48 }],
    wallet: { pokeDollars: 3_200 },
    competitive: { rank: 7, score: 1_240 },
  };
  const defaultState = createDefaultGameState();
  return createGameStateStore({
    initialState: {
      ...defaultState,
      currentPlayerId: localPlayer.playerId,
      playersById: { [localPlayer.playerId]: localPlayer },
    },
  });
}

export const storyWorldModel: WorldMapModel = {
  collisionCoordinates: new Set(),
  collisionGids: new Set(),
  height: 18,
  heightInPixels: 576,
  layers: [
    {
      name: "Below Player",
      tiles: Array.from({ length: 40 * 18 }, function callback(_, index) {
        return { gid: 126, key: `ground-${index}`, x: index % 40, y: Math.floor(index / 40) };
      }),
    },
    { name: "World", tiles: [] },
    { name: "Above Player", tiles: [] },
  ],
  npcs: [
    {
      displayName: "간호순",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0133/pcwoman1_5.png",
      name: "nurse",
      role: "healer",
      x: 640,
      y: 304,
    },
    {
      displayName: "상점 주인",
      imageUrl: "/assets/poke-lounge/textures/a_0_8_1_0132/shopm1_5.png",
      name: "shopkeeper",
      role: "shop",
      x: 720,
      y: 304,
    },
  ],
  spawnPoints: new Map([["Spawn Point", { x: 656, y: 446 }]]),
  tallGrassBase: [],
  tallGrassCoordinates: new Set(),
  tallGrassForeground: [],
  tileHeight: 32,
  tileset: {
    columns: 24,
    firstGid: 1,
    imageUrl: "/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png",
    margin: 1,
    spacing: 2,
    tileHeight: 32,
    tileWidth: 32,
  },
  tileWidth: 32,
  width: 40,
  widthInPixels: 1_280,
};

export const storyWorldAtlas: WorldPlayerAtlasModel = {
  frames: new Map([
    ["hero-front", { x: 0, y: 32, width: 32, height: 32 }],
    ["hero-back", { x: 0, y: 0, width: 32, height: 32 }],
    ["hero-left", { x: 0, y: 64, width: 32, height: 32 }],
    ["hero-right", { x: 0, y: 96, width: 32, height: 32 }],
  ]),
  height: 128,
  imageUrl: "/assets/poke-lounge/player/hero-atlas.png",
  width: 128,
};

export function createStoryWorldStores(): {
  frameStore: WorldFrameStore;
  gameStateStore: GameStateStore;
  uiStore: WorldUiStore;
} {
  const frameStore = createWorldFrameStore();
  frameStore.publish({
    battleIntroPlaying: false,
    camera: { height: 384, width: 512, x: 400, y: 160 },
    localPlayer: { facing: "front", frameName: "hero-front", walking: false, x: 656, y: 446 },
    remotePlayers: [
      {
        controller: "human",
        displayName: "트레이너 2",
        facing: "front",
        frameName: "hero-front",
        sessionId: "remote-1",
        walking: false,
        x: 720,
        y: 446,
      },
    ],
  });
  const uiStore = createWorldUiStore();
  uiStore.publishMobile(storyMobileWorldState);
  uiStore.publishPresentation({
    areaAnnouncement: "포켓 라운지 마을",
    interactionPrompt: "Enter: 상호작용",
  });
  return { frameStore, gameStateStore: createStoryGameStateStore(), uiStore };
}

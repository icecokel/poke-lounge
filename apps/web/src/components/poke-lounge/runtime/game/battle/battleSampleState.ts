import type { BattleMove, BattlePokemon, BattleScreenState } from "./battleTypes";
import { createDefaultBattleStatStages } from "./battle-stat-stages";
import { normalizeRomMoveRecord, type RomBattleMoveRecord } from "./battleRomData";
import { createBattleParty } from "./battleParty";
import { getBattlePokemonAssets } from "./battlePokemonAssets";
import { getExperienceForLevel } from "./experience";
import { createMaxIndividualValues } from "./individual-values";

export const BATTLE_LOGICAL_SIZE = { width: 256, height: 192 } as const;

const CHIKORITA_BASE_STATS = {
  hp: 45,
  attack: 49,
  defense: 65,
  special_attack: 49,
  special_defense: 65,
  speed: 45,
};

const CYNDAQUIL_BASE_STATS = {
  hp: 39,
  attack: 52,
  defense: 43,
  special_attack: 60,
  special_defense: 50,
  speed: 65,
};

function refinedMoveField(
  value: number,
  offset: number,
  width: number,
  hypothesis: string,
  confidence: "high" | "medium" = "high",
) {
  return { value, offset, width, hypothesis, confidence };
}

const ROM_MOVE_FIXTURES: Record<number, RomBattleMoveRecord> = {
  33: {
    index: 33,
    raw_hex: "00000023005f23000000007305040000",
    refined_candidate_fields: {
      accuracy: refinedMoveField(95, 5, 1, "byte_5"),
      category: refinedMoveField(0, 2, 1, "byte_2"),
      effect: refinedMoveField(0, 0, 2, "u16le_0", "medium"),
      power: refinedMoveField(35, 3, 1, "byte_3", "medium"),
      pp: refinedMoveField(35, 6, 1, "byte_6"),
      type: refinedMoveField(0, 4, 1, "byte_4"),
    },
  },
  45: {
    index: 45,
    raw_hex: "12000200006428000400005613020000",
    refined_candidate_fields: {
      accuracy: refinedMoveField(100, 5, 1, "byte_5"),
      category: refinedMoveField(2, 2, 1, "byte_2"),
      effect: refinedMoveField(18, 0, 2, "u16le_0", "medium"),
      power: refinedMoveField(0, 3, 1, "byte_3", "medium"),
      pp: refinedMoveField(40, 6, 1, "byte_6"),
      type: refinedMoveField(0, 4, 1, "byte_4"),
    },
  },
  52: {
    index: 52,
    raw_hex: "040001280a64190a0000005205010000",
    refined_candidate_fields: {
      accuracy: refinedMoveField(100, 5, 1, "byte_5"),
      category: refinedMoveField(1, 2, 1, "byte_2"),
      effect: refinedMoveField(4, 0, 2, "u16le_0", "medium"),
      power: refinedMoveField(40, 3, 1, "byte_3", "medium"),
      pp: refinedMoveField(25, 6, 1, "byte_6"),
      type: refinedMoveField(10, 4, 1, "byte_4"),
    },
  },
  98: {
    index: 98,
    raw_hex: "6700002800641e000000017301000000",
    refined_candidate_fields: {
      accuracy: refinedMoveField(100, 5, 1, "byte_5"),
      category: refinedMoveField(0, 2, 1, "byte_2"),
      effect: refinedMoveField(103, 0, 2, "u16le_0", "medium"),
      power: refinedMoveField(40, 3, 1, "byte_3", "medium"),
      pp: refinedMoveField(30, 6, 1, "byte_6"),
      type: refinedMoveField(0, 4, 1, "byte_4"),
    },
  },
};

const PLAYER_MOVES: BattleMove[] = [
  createBattleMove(33, "몸통박치기"),
  createBattleMove(45, "울음소리"),
];

const OPPONENT_MOVES: BattleMove[] = [
  createBattleMove(52, "불꽃세례"),
  createBattleMove(98, "전광석화"),
];

function createBattleMove(moveId: number, name: string): BattleMove {
  const normalized = normalizeRomMoveRecord(ROM_MOVE_FIXTURES[moveId], name);

  return {
    id: normalized.id,
    name: normalized.name,
    pp: normalized.pp,
    maxPp: normalized.maxPp,
    type: normalized.typeName,
    typeId: normalized.typeId,
    category: normalized.category,
    effectCode: normalized.effectCode,
    effectChance: normalized.effectChance,
    priority: normalized.priority,
    accuracy: normalized.accuracy,
    power: normalized.power,
  };
}

export function createSampleBattleState(): BattleScreenState {
  const chikoritaAssets = getBattlePokemonAssets(152);
  const cyndaquilAssets = getBattlePokemonAssets(155);
  const playerPokemon: BattlePokemon = {
    speciesId: 152,
    name: "치코리타",
    level: 15,
    catchRate: 45,
    baseExpYield: 64,
    growthRate: 3,
    experience: getExperienceForLevel(15, 3),
    baseStats: CHIKORITA_BASE_STATS,
    individualValues: createMaxIndividualValues(),
    maxHp: 45,
    currentHp: 45,
    attack: 28,
    defense: 31,
    specialAttack: 27,
    specialDefense: 31,
    speed: 25,
    statStages: createDefaultBattleStatStages(),
    typeIds: [12],
    status: "normal",
    frontSprite: chikoritaAssets.front,
    backSprite: chikoritaAssets.back,
    moves: PLAYER_MOVES,
  };
  const opponentPokemon: BattlePokemon = {
    speciesId: 155,
    name: "브케인",
    level: 15,
    catchRate: 45,
    baseExpYield: 65,
    growthRate: 3,
    experience: getExperienceForLevel(15, 3),
    baseStats: CYNDAQUIL_BASE_STATS,
    individualValues: createMaxIndividualValues(),
    maxHp: 43,
    currentHp: 43,
    attack: 29,
    defense: 25,
    specialAttack: 32,
    specialDefense: 28,
    speed: 31,
    statStages: createDefaultBattleStatStages(),
    typeIds: [10],
    status: "normal",
    frontSprite: cyndaquilAssets.front,
    backSprite: cyndaquilAssets.back,
    moves: OPPONENT_MOVES,
  };

  return {
    battleKind: "sample",
    phase: "intro",
    roundIndex: 0,
    matchIndex: 0,
    turn: 1,
    runAttemptCount: 0,
    player: {
      playerId: "player-1",
      displayName: "Player 1",
      pokemon: playerPokemon,
      party: createBattleParty(playerPokemon),
      activePartySlotIndex: 0,
    },
    opponent: {
      playerId: "player-2",
      displayName: "Player 2",
      pokemon: opponentPokemon,
      party: createBattleParty(opponentPokemon),
      activePartySlotIndex: 0,
    },
    messageQueue: ["상대가 브케인을 내보냈다!", "가랏! 치코리타!"],
    selectedMoveId: null,
    result: null,
  };
}

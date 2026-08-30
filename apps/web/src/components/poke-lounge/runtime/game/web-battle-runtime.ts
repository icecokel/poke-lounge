import {
  calculateOccupiedPartyAverageLevel,
  createDefaultLocalPlayer,
  type GameStateStore,
  type LocalPlayerState,
} from "./state/gameStateStore";
import { getRuntimePokemonData } from "./data/game-data-json";
import {
  persistBattlePartyToWorld,
  persistCapturedPokemonToWorld,
} from "./battle/battle-world-persistence";
import { BATTLE_END_CONFIRM_MESSAGE } from "./battle/battleLogic";
import type { BattleMove, BattlePokemon, BattleScreenState } from "./battle/battleTypes";
import { planLevelUpBattleProgression } from "./battle/level-up-progression";
import { formatReplacedMoveMessage, formatSkippedMoveMessage } from "./battle/levelUpMoves";
import { normalizePokemonEvolutionTable } from "./battle/pokemon-evolution";
import { createPvpBattleState } from "./battle/pvpBattleFactory";
import {
  createWildBattleState,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "./battle/wildBattleFactory";
import { FIELD_MAP } from "./world/fieldMap";
import { createWildEncounterLevelRange, rollWildEncounter } from "./world/wildEncounters";
import { selectWildEncounterConfig } from "./world/wildEncounterTables";

const PERSONAL_DATA_PATH = "/assets/poke-lounge/extraction/personal-data.json";
const BATTLE_RECORDS_PATH = "/assets/poke-lounge/extraction/refined-battle-records.json";
const WILD_ENCOUNTER_TABLES_PATH = "/game-data/wild-encounter-tables.json";

export const WEB_EXPLORATION_AREAS = [
  { id: "town-west-field", name: "서쪽 들판", description: "낮은 풀숲을 천천히 탐험합니다." },
  { id: "town-plaza-field", name: "광장 주변", description: "라운지 광장 근처를 둘러봅니다." },
  { id: "town-south-field", name: "남쪽 초원", description: "넓은 초원에서 포켓몬을 찾습니다." },
] as const;

interface WebBattleData {
  moveRecords: RomRefinedMoveCollection;
  personalRecords: RomPersonalRecordCollection;
  wildEncounterTables: unknown;
}

let webBattleDataPromise: Promise<WebBattleData> | null = null;
let webBattleData: WebBattleData | null = null;

export interface WebPendingMoveLearning {
  slotIndex: number;
  pokemonName: string;
  newMove: BattleMove;
}

export interface WebBattleProgression {
  state: BattleScreenState;
  pendingMoveLearnings: WebPendingMoveLearning[];
}

export async function createWebWildBattleState(
  areaId: string,
  gameStateStore: GameStateStore,
  random: () => number = Math.random,
): Promise<BattleScreenState> {
  const [battleData, pokemonData] = await Promise.all([
    loadWebBattleData(),
    Promise.resolve(getRuntimePokemonData()),
  ]);
  if (!pokemonData) {
    throw new Error("Runtime Pokemon data must be loaded before exploration");
  }

  const localPlayer = gameStateStore.getCurrentLocalPlayer();
  const averageLevel = calculateOccupiedPartyAverageLevel(localPlayer.party);
  const encounterConfig = selectWildEncounterConfig(
    battleData.wildEncounterTables,
    FIELD_MAP.key,
    areaId,
    pokemonData,
  );
  if (!encounterConfig?.slots.length || averageLevel === null) {
    throw new Error("A battle-capable party and encounter table are required for exploration");
  }

  const encounter = rollWildEncounter({
    levelRange: createWildEncounterLevelRange(averageLevel),
    mapKey: FIELD_MAP.key,
    random,
    rate: 1,
    slots: encounterConfig.slots,
    step: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
  });
  if (!encounter) {
    throw new Error("Exploration did not produce an encounter");
  }

  const state = createWildBattleState({
    encounter,
    playerParty: localPlayer.party,
    activePartySlotIndex: localPlayer.activePartySlotIndex,
    personalRecords: battleData.personalRecords,
    moveRecords: battleData.moveRecords,
  });

  return {
    ...state,
    player: {
      ...state.player,
      playerId: localPlayer.playerId,
      displayName: localPlayer.displayName,
    },
  };
}

export async function createWebSoloChallengeState(
  gameStateStore: GameStateStore,
): Promise<BattleScreenState> {
  const battleData = await loadWebBattleData();
  let player = gameStateStore.getCurrentLocalPlayer();
  const battleReadySlot = player.party.find(
    slot =>
      slot.pokemon &&
      slot.pokemon.status !== "fainted" &&
      (slot.pokemon.currentHp ?? slot.pokemon.maxHp ?? 1) > 0,
  );
  if (!battleReadySlot) {
    throw new Error("A battle-capable party is required for the solo challenge");
  }
  if (battleReadySlot.slotIndex !== player.activePartySlotIndex) {
    gameStateStore.setActivePartySlot(battleReadySlot.slotIndex);
  }
  gameStateStore.healCurrentParty();
  player = gameStateStore.getCurrentLocalPlayer();
  const opponent: LocalPlayerState = {
    ...createDefaultLocalPlayer("solo-challenger"),
    displayName: "미러 트레이너",
    party: structuredClone(player.party),
    activePartySlotIndex: player.activePartySlotIndex,
  };

  return createPvpBattleState({
    roundIndex: 0,
    matchIndex: 0,
    matchId: "solo-challenge",
    player,
    opponent,
    personalRecords: battleData.personalRecords,
    moveRecords: battleData.moveRecords,
  });
}

export function settleWebBattle(state: BattleScreenState, gameStateStore: GameStateStore): void {
  const localPlayer = gameStateStore.getCurrentLocalPlayer();
  persistBattlePartyToWorld({
    completedCompetitiveBattle: false,
    gameStateStore,
    localPlayer,
    participant: state.player,
  });

  if (state.result?.reason === "capture") {
    persistCapturedPokemonToWorld({
      capturedPokemon: state.result.capturedPokemon,
      gameStateStore,
    });
  }

  const reward = state.result?.rewardPokeDollars ?? 0;
  if (state.result?.winnerPlayerId === state.player.playerId && reward > 0) {
    gameStateStore.setLocalPlayerPokeDollars(
      gameStateStore.getCurrentLocalPlayer().wallet.pokeDollars + reward,
    );
  }
}

export function planWebBattleProgression(
  state: BattleScreenState,
  localPlayer: LocalPlayerState,
): WebBattleProgression {
  if (
    !webBattleData ||
    state.battleKind !== "wild" ||
    state.result?.reason !== "faint" ||
    (state.result.levelsGained ?? 0) <= 0 ||
    state.result.winnerPlayerId !== state.player.playerId
  ) {
    return { state, pendingMoveLearnings: [] };
  }

  const pokemonData = getRuntimePokemonData();
  if (!pokemonData) {
    return { state, pendingMoveLearnings: [] };
  }

  const previousPokemonBySlot = new Map(
    localPlayer.party
      .filter(slot => slot.pokemon)
      .map(slot => [slot.slotIndex, slot.pokemon!] as const),
  );
  const pendingMoveLearnings: WebPendingMoveLearning[] = [];
  const messages: string[] = [];
  let activePokemon = state.player.pokemon;
  const evolutionTable = normalizePokemonEvolutionTable(pokemonData);
  const party = state.player.party.map(slot => {
    if (!slot.pokemon) {
      return slot;
    }

    const previousPokemon = previousPokemonBySlot.get(slot.slotIndex);
    const previousLevel = resolvePreviousLevel(
      slot.pokemon,
      previousPokemon,
      slot.slotIndex === state.player.activePartySlotIndex ? (state.result?.levelsGained ?? 0) : 0,
    );
    if (previousLevel >= slot.pokemon.level) {
      return slot;
    }

    const progression = planLevelUpBattleProgression({
      evolutionTable,
      moveRecords: webBattleData!.moveRecords,
      personalRecords: webBattleData!.personalRecords,
      pokemon: slot.pokemon,
      previousLevel,
    });
    messages.push(...progression.messages);
    progression.pendingMoveLearnings.forEach(({ newMove }) => {
      pendingMoveLearnings.push({
        slotIndex: slot.slotIndex,
        pokemonName: progression.pokemon.name,
        newMove,
      });
    });
    if (slot.slotIndex === state.player.activePartySlotIndex) {
      activePokemon = progression.pokemon;
    }
    return { ...slot, pokemon: progression.pokemon };
  });

  const nextState = {
    ...state,
    player: { ...state.player, pokemon: activePokemon, party },
    messageQueue: insertBeforeBattleEnd(state.messageQueue, messages),
  };

  return {
    state: pendingMoveLearnings.length
      ? {
          ...nextState,
          phase: "move-replace-select",
          messageQueue: nextState.messageQueue.filter(
            message => message !== BATTLE_END_CONFIRM_MESSAGE,
          ),
        }
      : nextState,
    pendingMoveLearnings,
  };
}

export function resolveWebMoveLearning(
  state: BattleScreenState,
  pendingMoveLearnings: WebPendingMoveLearning[],
  moveIndex: number | null,
): WebBattleProgression {
  const [pending, ...rest] = pendingMoveLearnings;
  if (!pending) {
    return { state: { ...state, phase: "ended" }, pendingMoveLearnings: [] };
  }

  const targetSlot = state.player.party.find(slot => slot.slotIndex === pending.slotIndex);
  const targetPokemon = targetSlot?.pokemon ?? state.player.pokemon;
  const replacedMove = moveIndex === null ? null : targetPokemon.moves[moveIndex];
  const nextPokemon = replacedMove
    ? {
        ...targetPokemon,
        moves: targetPokemon.moves.map((move, index) =>
          index === moveIndex ? pending.newMove : move,
        ),
      }
    : targetPokemon;
  const nextParty = state.player.party.map(slot =>
    slot.slotIndex === pending.slotIndex ? { ...slot, pokemon: nextPokemon } : slot,
  );
  const message = replacedMove
    ? formatReplacedMoveMessage(pending.pokemonName, replacedMove.name, pending.newMove.name)
    : formatSkippedMoveMessage(pending.pokemonName, pending.newMove.name);

  return {
    state: {
      ...state,
      phase: rest.length ? "move-replace-select" : "ended",
      player: {
        ...state.player,
        pokemon:
          pending.slotIndex === state.player.activePartySlotIndex
            ? nextPokemon
            : state.player.pokemon,
        party: nextParty,
      },
      messageQueue: rest.length ? [message] : [message, BATTLE_END_CONFIRM_MESSAGE],
    },
    pendingMoveLearnings: rest,
  };
}

async function loadWebBattleData(fetcher: typeof fetch = fetch): Promise<WebBattleData> {
  webBattleDataPromise ??= Promise.all([
    fetchJson(fetcher, PERSONAL_DATA_PATH),
    fetchJson(fetcher, BATTLE_RECORDS_PATH),
    fetchJson(fetcher, WILD_ENCOUNTER_TABLES_PATH),
  ])
    .then(([personalRecords, moveRecords, wildEncounterTables]) => {
      if (!isRecord(personalRecords) || !Array.isArray(personalRecords.records)) {
        throw new Error("Invalid personal battle data");
      }
      if (!isRecord(moveRecords) || !("moves" in moveRecords)) {
        throw new Error("Invalid move battle data");
      }

      webBattleData = {
        personalRecords: personalRecords as unknown as RomPersonalRecordCollection,
        moveRecords: moveRecords as unknown as RomRefinedMoveCollection,
        wildEncounterTables,
      };
      return webBattleData;
    })
    .catch(error => {
      webBattleDataPromise = null;
      throw error;
    });

  return webBattleDataPromise;
}

async function fetchJson(fetcher: typeof fetch, path: string): Promise<unknown> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Unable to load Web battle data: ${path} (${response.status})`);
  }
  return response.json() as Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolvePreviousLevel(
  pokemon: BattlePokemon,
  previousPokemon: LocalPlayerState["party"][number]["pokemon"] | undefined,
  fallbackLevelsGained: number,
): number {
  if (previousPokemon?.speciesId === pokemon.speciesId) {
    return previousPokemon.level;
  }
  return Math.max(1, pokemon.level - fallbackLevelsGained);
}

function insertBeforeBattleEnd(messageQueue: string[], messages: string[]): string[] {
  const index = messageQueue.lastIndexOf(BATTLE_END_CONFIRM_MESSAGE);
  return index === -1
    ? [...messageQueue, ...messages]
    : [...messageQueue.slice(0, index), ...messages, ...messageQueue.slice(index)];
}

import { normalizeCompetitiveParty, type NormalizedCompetitiveParty } from "../competitive-party";
import {
  chooseBattleBagItem,
  choosePartySlot,
  choosePlayerMove,
  isBattleMoveSelectable,
  popBattleMessage,
} from "./battle/battle-logic";
import {
  createStoredBattlePokemon,
  createWildBattleState,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "./battle/wild-battle-factory";
import { planLevelUpBattleProgression } from "./battle/level-up-progression";
import { normalizePokemonEvolutionTable } from "./battle/pokemon-evolution";
import { getRuntimePokemonSpeciesSummary } from "./data/game-data-json";
import type { BattlePokemon, BattleScreenState } from "./battle/battle-types";
import { healPokemon } from "./player/heal-pokemon";
import type { PlayerFacing, PlayerPokemonSlot } from "./player/player-types";
import {
  FIELD_MAP,
  NURSE_HEAL_DURATION_MS,
  NURSE_INTERACTION_DISTANCE,
  resolveFieldEncounterAreaId,
} from "./world/field-map";
import { LOCAL_PLAYER_SPEED, AI_REMOTE_PLAYER_INTERPOLATION_MS } from "./world/player-motion";
import {
  moveWorldPlayer,
  worldPlayerCollides,
  type WorldPosition,
} from "./world/world-runtime-motion";
import type { WorldMapModel } from "./world/world-map-model";
import { consumeCompletedTileSteps, createTileStepTracker, pixelToTile } from "./world/tile-steps";
import { createWildEncounterLevelRange, rollWildEncounter } from "./world/wild-encounters";
import { selectWildEncounterConfig } from "./world/wild-encounter-tables";

export interface AiAdventureState {
  position: WorldPosition;
  facing: PlayerFacing;
  updatedAtMs: number;
  roundIndex: number;
  activity: "idle" | "moving" | "hunting" | "recovering" | "tournament";
  path: WorldPosition[];
  party: PlayerPokemonSlot<BattlePokemon>[];
  activeSlotIndex: number;
  inventory: Record<string, number>;
  pokeDollars: number;
  box: BattlePokemon[];
  battle: BattleScreenState | null;
  readyAtMs: number;
}

export interface AiAdventureContext {
  model: WorldMapModel;
  pokemonData: RomPersonalRecordCollection;
  moveData: RomRefinedMoveCollection;
  encounterData: unknown;
}

export function createAiAdventure(
  party: NormalizedCompetitiveParty,
  nowMs: number,
  context: AiAdventureContext,
): AiAdventureState {
  return {
    position: { ...FIELD_MAP.fallbackSpawn },
    facing: "front",
    updatedAtMs: nowMs,
    roundIndex: 0,
    activity: "idle",
    path: [],
    activeSlotIndex: party.activeSlotIndex,
    inventory: { pokeball: 10 },
    pokeDollars: 0,
    box: [],
    battle: null,
    readyAtMs: nowMs,
    party: party.members.map(member => ({
      slotIndex: member.slotIndex,
      pokemon: createStoredBattlePokemon({
        personalRecords: context.pokemonData,
        moveRecords: context.moveData,
        pokemon: {
          ...member,
          name: getRuntimePokemonSpeciesSummary(member.speciesId)!.name,
          // Learn the same level-up moves as a player's starter, not the old AI-only Tackle.
          moves: undefined,
        },
      }),
    })),
  };
}

export function advanceAiAdventure(
  state: AiAdventureState,
  nowMs: number,
  roundIndex: number,
  preparing: boolean,
  context: AiAdventureContext,
  random: () => number = Math.random,
): void {
  const elapsedMs = Math.min(
    AI_REMOTE_PLAYER_INTERPOLATION_MS,
    Math.max(0, nowMs - state.updatedAtMs),
  );
  state.updatedAtMs = Math.max(state.updatedAtMs, nowMs);
  if (state.roundIndex !== roundIndex) {
    state.roundIndex = roundIndex;
    state.battle = null;
    state.path = [];
  }
  if (!preparing) {
    if (state.battle) {
      state.party = state.battle.player.party;
      state.activeSlotIndex = state.battle.player.activePartySlotIndex;
    }
    // Human parties heal on COMPETITIVE_ASSIGNMENT, and PvP damage stays isolated.
    if (roundIndex > 0 && state.activity !== "tournament") {
      state.party = state.party.map(slot => ({
        ...slot,
        pokemon: slot.pokemon ? healPokemon(slot.pokemon) : null,
      }));
    }
    state.activity = roundIndex > 0 ? "tournament" : "idle";
    state.battle = null;
    return;
  }
  if (state.battle) {
    state.activity = "hunting";
    if (nowMs >= state.readyAtMs) advanceWildBattle(state, nowMs, context, random);
    return;
  }
  if (nowMs < state.readyAtMs) {
    state.activity = "recovering";
    return;
  }
  const needsHeal = state.party.some(
    ({ pokemon }) =>
      pokemon &&
      (pokemon.currentHp < pokemon.maxHp * 0.6 ||
        pokemon.status !== "normal" ||
        pokemon.moves.every(move => move.pp === 0)),
  );
  const nurse = context.model.npcs.find(npc => npc.name === "nurse");
  if (!nurse) throw new Error("AI world nurse is missing");
  if (
    needsHeal &&
    Math.hypot(state.position.x - nurse.x, state.position.y - nurse.y) <= NURSE_INTERACTION_DISTANCE
  ) {
    state.party = state.party.map(slot => ({
      ...slot,
      pokemon: slot.pokemon ? healPokemon(slot.pokemon) : null,
    }));
    state.activeSlotIndex = state.party.find(slot => slot.pokemon)!.slotIndex;
    state.path = [];
    state.readyAtMs = nowMs + NURSE_HEAL_DURATION_MS;
    state.activity = "recovering";
    return;
  }
  if (!state.path.length || (needsHeal && state.activity !== "recovering")) {
    const grass = [...context.model.tallGrassCoordinates].filter(coordinate => {
      const [x, y] = coordinate.split(",").map(Number);
      return !worldPlayerCollides(
        { x: (x + 0.5) * context.model.tileWidth, y: (y + 0.5) * context.model.tileHeight },
        context.model,
      );
    });
    if (grass.length === 0) throw new Error("AI world has no tall grass");
    const coordinate = grass[Math.min(grass.length - 1, Math.floor(random() * grass.length))];
    const [x, y] = coordinate.split(",").map(Number);
    const target = needsHeal
      ? FIELD_MAP.recoverySpawn
      : { x: (x + 0.5) * context.model.tileWidth, y: (y + 0.5) * context.model.tileHeight };
    state.path = findAiPath(state.position, target, context.model);
  }
  state.activity = needsHeal ? "recovering" : "moving";
  let distance = (LOCAL_PLAYER_SPEED * elapsedMs) / 1000;
  const tracker = createTileStepTracker(state.position, context.model.tileWidth);
  while (distance > 0 && state.path.length) {
    const target = state.path[0];
    const dx = target.x - state.position.x,
      dy = target.y - state.position.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) {
      state.path.shift();
      continue;
    }
    const step = Math.min(distance, length, 4);
    const next = moveWorldPlayer(
      state.position,
      { x: (dx / length) * LOCAL_PLAYER_SPEED, y: (dy / length) * LOCAL_PLAYER_SPEED },
      (step / LOCAL_PLAYER_SPEED) * 1000,
      context.model,
    );
    if (next.x === state.position.x && next.y === state.position.y) {
      state.path = [];
      break;
    }
    state.facing =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "front" : "back";
    state.position = next;
    distance -= step;
    for (const completedStep of consumeCompletedTileSteps(tracker, next)) {
      if (
        !context.model.tallGrassCoordinates.has(`${completedStep.to.x},${completedStep.to.y}`) ||
        !state.party.some(slot => slot.pokemon && slot.pokemon.currentHp > 0)
      )
        continue;
      const config = selectWildEncounterConfig(
        context.encounterData,
        FIELD_MAP.key,
        resolveFieldEncounterAreaId(next),
        context.pokemonData,
      );
      if (!config) throw new Error("AI encounter table is missing");
      const occupied = state.party.flatMap(slot => (slot.pokemon ? [slot.pokemon] : []));
      const encounter = rollWildEncounter({
        mapKey: FIELD_MAP.key,
        step: completedStep,
        random,
        rate: config.encounterRate,
        slots: config.slots,
        levelRange: createWildEncounterLevelRange(
          Math.round(occupied.reduce((sum, p) => sum + p.level, 0) / occupied.length),
        ),
      });
      if (!encounter) continue;
      state.battle = createWildBattleState({
        encounter,
        personalRecords: context.pokemonData,
        moveRecords: context.moveData,
        playerParty: state.party,
        activePartySlotIndex: state.activeSlotIndex,
      });
      state.path = [];
      state.activity = "hunting";
      state.readyAtMs = nowMs + 640 + state.battle.messageQueue.length * 850;
      return;
    }
  }
}

function advanceWildBattle(
  state: AiAdventureState,
  nowMs: number,
  context: AiAdventureContext,
  random: () => number,
): void {
  let battle = state.battle!;
  const previousLevels = new Map(
    state.party.map(slot => [slot.slotIndex, slot.pokemon?.level ?? 1]),
  );
  while (battle.messageQueue.length) battle = popBattleMessage(battle);
  state.party = battle.player.party;
  state.activeSlotIndex = battle.player.activePartySlotIndex;
  if (battle.result) {
    state.party = state.party.map(slot => {
      if (!slot.pokemon) return slot;
      const progression = planLevelUpBattleProgression({
        pokemon: slot.pokemon,
        previousLevel: previousLevels.get(slot.slotIndex) ?? slot.pokemon.level,
        personalRecords: context.pokemonData,
        moveRecords: context.moveData,
        evolutionTable: normalizePokemonEvolutionTable(context.pokemonData),
      });
      const pokemon = progression.pokemon;
      for (const pending of progression.pendingMoveLearnings) {
        // A legal four-move choice, using the same available learnset as the player.
        pokemon.moves = [...pokemon.moves.slice(-3), pending.newMove];
      }
      return { ...slot, pokemon };
    });
    const caught = battle.result.capturedPokemon;
    if (battle.result.winnerPlayerId === battle.player.playerId)
      state.pokeDollars += battle.result.rewardPokeDollars ?? 0;
    if (caught) {
      const slotIndex = Array.from({ length: 6 }, (_, i) => i).find(
        i => !state.party.some(slot => slot.slotIndex === i && slot.pokemon),
      );
      if (slotIndex === undefined) state.box.push(caught);
      else
        state.party = [
          ...state.party.filter(slot => slot.slotIndex !== slotIndex),
          { slotIndex, pokemon: caught },
        ];
    }
    state.battle = null;
    if (state.party.every(slot => !slot.pokemon || slot.pokemon.currentHp <= 0)) {
      // The player's defeated party also returns to the nurse before healing.
      state.position = { ...FIELD_MAP.recoverySpawn };
      state.path = [];
      state.activity = "recovering";
    }
    return;
  }
  if (battle.phase === "party-select") {
    const replacement = battle.player.party.find(
      slot => slot.pokemon && slot.pokemon.currentHp > 0 && slot.pokemon.status !== "fainted",
    );
    if (replacement) battle = choosePartySlot(battle, replacement.slotIndex);
  } else if (
    (state.inventory.pokeball ?? 0) > 0 &&
    battle.opponent.pokemon.currentHp <= battle.opponent.pokemon.maxHp * 0.5
  ) {
    battle = chooseBattleBagItem({ ...battle, phase: "bag-select" }, "pokeball", {
      itemCount: state.inventory.pokeball,
      captureRandom16: () => Math.floor(random() * 65536),
    });
    if (battle.usedInventoryItemId === "pokeball") state.inventory.pokeball -= 1;
  } else {
    const moves = battle.player.pokemon.moves;
    const move = moves
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => isBattleMoveSelectable(move))
      .sort((a, b) => b.move.power - a.move.power)[0];
    battle = choosePlayerMove({ ...battle, phase: "move-select" }, move?.index ?? 0, { random });
  }
  state.battle = battle;
  state.readyAtMs = nowMs + Math.max(1, battle.messageQueue.length) * 850;
}

export function aiCompetitiveParty(state: AiAdventureState): NormalizedCompetitiveParty | null {
  const party = state.battle?.player.party ?? state.party;
  const activeSlotIndex = state.battle?.player.activePartySlotIndex ?? state.activeSlotIndex;
  // Like human party submissions, wait for forced switching / nurse recovery to finish.
  // The private adventure must keep advancing even when no legal tournament party exists yet.
  if (party.find(slot => slot.slotIndex === activeSlotIndex)?.pokemon?.currentHp === 0) return null;
  return normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex,
    members: party.flatMap(slot =>
      slot.pokemon
        ? [
            {
              slotIndex: slot.slotIndex,
              speciesId: slot.pokemon.speciesId,
              level: slot.pokemon.level,
              currentHp: slot.pokemon.currentHp,
              status: slot.pokemon.status,
              individualValues: slot.pokemon.individualValues,
              moves: slot.pokemon.moves.map(move => ({ moveId: move.id, pp: move.pp })),
            },
          ]
        : [],
    ),
  });
}

export function findAiPath(
  from: WorldPosition,
  target: WorldPosition,
  model: WorldMapModel,
): WorldPosition[] {
  const start = pixelToTile(from, model.tileWidth),
    end = pixelToTile(target, model.tileWidth);
  const key = (p: WorldPosition) => `${p.x},${p.y}`;
  const center = (p: WorldPosition) => ({
    x: (p.x + 0.5) * model.tileWidth,
    y: (p.y + 0.5) * model.tileHeight,
  });
  const queue = [start],
    previous = new Map<string, WorldPosition | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (key(point) === key(end)) {
      const path: WorldPosition[] = [];
      for (
        let current: WorldPosition | null = point;
        current;
        current = previous.get(key(current)) ?? null
      )
        path.unshift(center(current));
      return path;
    }
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = { x: point.x + dx, y: point.y + dy };
      if (previous.has(key(next)) || worldPlayerCollides(center(next), model)) continue;
      previous.set(key(next), point);
      queue.push(next);
    }
  }
  return [];
}

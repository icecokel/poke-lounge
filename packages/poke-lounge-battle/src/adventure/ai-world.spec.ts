import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAiStarterParty } from "../ai-policy";
import {
  advanceAiAdventure,
  aiCompetitiveParty,
  createAiAdventure,
  findAiPath,
  type AiAdventureContext,
} from "./ai-world";
import { registerRuntimeGameDataJson } from "./data/game-data-json";
import { choosePlayerMove, popBattleMessage } from "./battle/battle-logic";
import { createWildBattleState } from "./battle/wild-battle-factory";
import { createWorldMapModel } from "./world/world-map-model";
import { worldPlayerCollides } from "./world/world-runtime-motion";
import { FIELD_MAP } from "./world/field-map";

const webRoot = resolve(__dirname, "../../../../apps/web");
const read = (path: string) => JSON.parse(readFileSync(resolve(webRoot, path), "utf8"));
const context: AiAdventureContext = {
  model: createWorldMapModel(read("public/maps/pokemmo-reference/town.json")),
  pokemonData: read("public/game-data/pokemon-data.json"),
  moveData: read("public/game-data/pokemon-data.json"),
  encounterData: read("public/game-data/wild-encounter-tables.json"),
};
beforeAll(() =>
  registerRuntimeGameDataJson({
    pokemonData: context.pokemonData,
    itemData: read("public/game-data/item-data.json"),
    levelUpMoveTable: read("public/game-data/level-up-move-table.json"),
    growthTable: read("src/components/poke-lounge/runtime/game/battle/growthTable.json"),
    wildBattleMoveSets: read("public/game-data/wild-battle-move-sets.json"),
    battlePokemonAssets: read("public/game-data/battle-pokemon-assets.json"),
  }),
);
afterEach(() => jest.restoreAllMocks());
const create = () =>
  createAiAdventure(
    createAiStarterParty(() => 0.5),
    1_000,
    context,
  );

it("bounds delayed ticks to 26px, follows collisions and never uses an absolute route offset", () => {
  const state = create();
  expect(state.position).toEqual(FIELD_MAP.fallbackSpawn);
  const from = { ...state.position };
  advanceAiAdventure(state, 17_000, 1, true, context, () => 0.99);
  expect(Math.hypot(state.position.x - from.x, state.position.y - from.y)).toBeLessThanOrEqual(
    26.001,
  );
  expect(state.position).not.toEqual(from);
  expect(worldPlayerCollides(state.position, context.model)).toBe(false);
  const path = findAiPath(state.position, FIELD_MAP.recoverySpawn, context.model);
  expect(path.length).toBeGreaterThan(0);
  expect(path.every(point => !worldPlayerCollides(point, context.model))).toBe(true);
  const stopped = { ...state.position };
  advanceAiAdventure(state, 17_000, 1, true, context, () => 0.99);
  expect(state.position).toEqual(stopped);
});

it("encounters only on grass steps and freezes world movement during battle", () => {
  const state = create();
  for (let now = 1_250; now < 20_000 && !state.battle; now += 250)
    advanceAiAdventure(state, now, 1, true, context, () => 0);
  expect(state.battle?.battleKind).toBe("wild");
  const tile = `${Math.floor(state.position.x / 32)},${Math.floor(state.position.y / 32)}`;
  expect(context.model.tallGrassCoordinates.has(tile)).toBe(true);
  expect(state.party.filter(slot => slot.pokemon)).toHaveLength(1);
  const stopped = { ...state.position };
  advanceAiAdventure(state, state.updatedAtMs + 250, 1, true, context, () => 0);
  expect(state.position).toEqual(stopped);
  expect(state.activity).toBe("hunting");
});

it("resolves AI attacks through the player's battle engine with identical HP and PP", () => {
  const state = create();
  state.roundIndex = 1;
  let battle = createWildBattleState({
    encounter: {
      step: { from: { x: 22, y: 12 }, to: { x: 23, y: 12 } },
      mapKey: FIELD_MAP.key,
      speciesId: 25,
      name: "피카츄",
      level: 10,
    },
    personalRecords: context.pokemonData,
    moveRecords: context.moveData,
    playerParty: state.party,
    activePartySlotIndex: 0,
  });
  while (battle.messageQueue.length) battle = popBattleMessage(battle);
  state.battle = battle;
  state.readyAtMs = 1_000;
  const index = battle.player.pokemon.moves
    .map((move, index) => ({ move, index }))
    .filter(({ move }) => move.pp > 0 && move.competitiveEffectSupport !== "unsupported-primary")
    .sort((a, b) => b.move.power - a.move.power)[0]!.index;
  const expected = choosePlayerMove({ ...battle, phase: "move-select" }, index, {
    random: () => 0.5,
  });
  advanceAiAdventure(state, 1_250, 1, true, context, () => 0.5);
  expect(state.battle).toEqual(expected);
  expect(aiCompetitiveParty(state)!.members[0]!.moves[index]!.pp).toBeLessThan(
    battle.player.pokemon.moves[index].pp,
  );
});

it("spends an actual ball only on a real capture attempt", () => {
  const state = create();
  state.roundIndex = 1;
  const battle = createWildBattleState({
    encounter: {
      step: { from: { x: 22, y: 12 }, to: { x: 23, y: 12 } },
      mapKey: FIELD_MAP.key,
      speciesId: 10,
      name: "캐터피",
      level: 5,
    },
    personalRecords: context.pokemonData,
    moveRecords: context.moveData,
    playerParty: state.party,
    activePartySlotIndex: 0,
  });
  battle.opponent.pokemon.currentHp = 1;
  state.battle = { ...battle, phase: "command", messageQueue: [] };
  state.readyAtMs = 1_000;
  advanceAiAdventure(state, 1_250, 1, true, context, () => 0);
  expect(state.inventory.pokeball).toBe(9);
  expect(state.battle?.result?.reason).toBe("capture");
  advanceAiAdventure(state, state.readyAtMs, 1, true, context, () => 0);
  expect(state.party.filter(slot => slot.pokemon)).toHaveLength(2);
  expect(state.inventory.pokeball).toBe(9);
});

it("walks to the nurse and restores HP, status and PP only within interaction range", () => {
  const state = create();
  state.roundIndex = 1;
  const pokemon = state.party[0].pokemon!;
  pokemon.currentHp = 1;
  pokemon.status = "poisoned";
  pokemon.moves.forEach(move => {
    move.pp = 0;
  });
  advanceAiAdventure(state, 1_250, 1, true, context, () => 0.99);
  expect(state.party[0].pokemon!.currentHp).toBe(1);
  expect(state.activity).toBe("recovering");
  for (let now = 1_500; now < 30_000 && state.party[0].pokemon!.currentHp === 1; now += 250)
    advanceAiAdventure(state, now, 1, true, context, () => 0.99);
  const healed = state.party[0].pokemon!;
  expect(
    Math.hypot(
      state.position.x - FIELD_MAP.recoverySpawn.x,
      state.position.y - FIELD_MAP.recoverySpawn.y,
    ),
  ).toBeLessThanOrEqual(32);
  expect(healed.currentHp).toBe(healed.maxHp);
  expect(healed.status).toBe("normal");
  expect(healed.moves.every(move => move.pp === move.maxPp)).toBe(true);
  const stopped = { ...state.position };
  advanceAiAdventure(state, state.updatedAtMs + 250, 1, true, context);
  expect(state.position).toEqual(stopped);
});

it("does not hunt while waiting or competing; heals at PvP entry like players, not each preparation", () => {
  const state = create();
  const from = { ...state.position };
  state.party[0].pokemon!.currentHp = 1;
  advanceAiAdventure(state, 20_000, 0, false, context);
  expect(state.position).toEqual(from);
  expect(state.battle).toBeNull();
  expect(state.inventory.pokeball).toBe(10);
  expect(state.party[0].pokemon!.currentHp).toBe(1);
  advanceAiAdventure(state, 20_250, 1, false, context);
  expect(state.party[0].pokemon!.currentHp).toBe(state.party[0].pokemon!.maxHp);
  state.party[0].pokemon!.currentHp = 1;
  advanceAiAdventure(state, 20_500, 2, true, context);
  expect(state.party[0].pokemon!.currentHp).toBe(1);
});

it("keeps a fainted party private until nurse recovery makes it battle-ready", () => {
  const state = create();
  state.roundIndex = 1;
  state.position = { ...FIELD_MAP.recoverySpawn };
  state.party[0].pokemon!.currentHp = 0;
  state.party[0].pokemon!.status = "fainted";
  expect(aiCompetitiveParty(state)).toBeNull();
  advanceAiAdventure(state, 1_250, 1, true, context);
  expect(aiCompetitiveParty(state)!.members[0].currentHp).toBeGreaterThan(0);
});

it("keeps moving, fighting and recovering across a full preparation without invalid snapshots", () => {
  let seed = 73;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const state = create();
  const activities = new Set<string>();
  for (let now = 1_250; now < 601_000; now += 250) {
    advanceAiAdventure(state, now, 1, true, context, random);
    expect(() => aiCompetitiveParty(state)).not.toThrow();
    activities.add(state.activity);
  }
  expect(activities).toEqual(new Set(["moving", "hunting", "recovering"]));
});

import { expect, test } from "@playwright/test";
import {
  buildPokeLoungeSaveSnapshot,
  parsePokeLoungeSaveSnapshot,
  sanitizeLocalPlayersSaveState,
} from "../../src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";
import { createGameStateStore } from "../../src/components/poke-lounge/runtime/game/state/gameStateStore";

test.describe("Poke Lounge state hydration", () => {
  test("unknown version and malformed player values are ignored", () => {
    expect(
      parsePokeLoungeSaveSnapshot({ version: 999, game: "poke-lounge", state: {} }),
    ).toBeNull();
    expect(sanitizeLocalPlayersSaveState({ currentPlayerId: 3, playersById: [] })).toBeNull();
  });

  test("dangerous local player keys are rejected before record construction", () => {
    const state = buildPokeLoungeSaveSnapshot(createGameStateStore()).state;
    const player = state.playersById["player-1"];

    for (const playerId of ["__proto__", "prototype", "constructor"]) {
      const playersById = Object.create(null) as Record<string, unknown>;
      Object.defineProperty(playersById, playerId, {
        value: { ...player, playerId },
        enumerable: true,
      });

      expect(sanitizeLocalPlayersSaveState({ currentPlayerId: playerId, playersById })).toBeNull();
    }
  });

  test("current player ID must exactly match an own player record key", () => {
    const state = buildPokeLoungeSaveSnapshot(createGameStateStore()).state;

    expect(
      sanitizeLocalPlayersSaveState({
        currentPlayerId: " player-1",
        playersById: state.playersById,
      }),
    ).toBeNull();
  });

  test("valid snapshots retain only local player state", () => {
    const store = createGameStateStore();
    store.setStarterPokemon({
      speciesId: 155,
      name: "브케인",
      level: 5,
      maxHp: 20,
      currentHp: 20,
      experience: 0,
      growthRate: 1_000_000,
      status: "normal",
      moves: [{ id: 33, name: "몸통박치기", pp: 35, maxPp: 35 }],
    });
    const snapshot = buildPokeLoungeSaveSnapshot(store) as unknown as Record<string, unknown>;
    const state = snapshot.state as Record<string, unknown>;

    state.remotePlayers = { remote: { sessionId: "remote" } };
    state.session = { roomId: "room" };
    state.round = { phase: "battle" };
    state.tournament = { session: { status: "in-progress" } };

    const parsed = parsePokeLoungeSaveSnapshot(snapshot);

    expect(parsed).not.toBeNull();
    expect(parsed?.state).toEqual({
      currentPlayerId: "player-1",
      playersById: {
        "player-1": expect.objectContaining({
          playerId: "player-1",
          party: [expect.objectContaining({ slotIndex: 0 })],
        }),
      },
    });
    expect(parsed?.state).not.toHaveProperty("remotePlayers");
    expect(parsed?.state).not.toHaveProperty("session");
    expect(parsed?.state).not.toHaveProperty("round");
    expect(parsed?.state).not.toHaveProperty("tournament");
  });

  test("valid local Pokemon individual values survive sanitization", () => {
    const store = createGameStateStore();
    store.setStarterPokemon({
      speciesId: 155,
      name: "브케인",
      level: 5,
      individualValues: {
        hp: 31,
        attack: 30,
        defense: 29,
        specialAttack: 28,
        specialDefense: 27,
        speed: 26,
      },
    });

    const parsed = parsePokeLoungeSaveSnapshot(buildPokeLoungeSaveSnapshot(store));

    expect(parsed?.state.playersById["player-1"]?.party[0]?.pokemon?.individualValues).toEqual({
      hp: 31,
      attack: 30,
      defense: 29,
      specialAttack: 28,
      specialDefense: 27,
      speed: 26,
    });
  });

  test("local players hydrate with one storage write and one notification", () => {
    const saved: unknown[] = [];
    const store = createGameStateStore({
      storage: {
        loadLocalPlayers: () => null,
        saveLocalPlayers: localPlayers => saved.push(localPlayers),
        clear: () => undefined,
      },
    });
    const serverStore = createGameStateStore();
    serverStore.setCurrentPlayer("player-server");
    serverStore.setStarterPokemon({
      speciesId: 152,
      name: "치코리타",
      level: 5,
    });
    const snapshot = buildPokeLoungeSaveSnapshot(serverStore);
    const notifications: unknown[] = [];
    store.subscribe(state => notifications.push(state));

    store.hydrateLocalPlayers(snapshot.state);

    expect(store.getState().currentPlayerId).toBe("player-server");
    expect(store.getCurrentLocalPlayer().party[0]?.pokemon?.name).toBe("치코리타");
    expect(saved).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });
});

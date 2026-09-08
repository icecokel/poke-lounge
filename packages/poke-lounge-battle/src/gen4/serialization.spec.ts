import { Battle, Dex, Pokemon, Side, State, toID, type PokemonSet } from "@pkmn/sim";
import { serializeGen4Battle } from "./serialization";

function createBattle() {
  const set = (species: string, ability: string, moves: string[]): PokemonSet => ({
    name: species,
    species,
    ability,
    moves,
    item: "Leftovers",
    nature: "Hardy",
    gender: "M",
    level: 50,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  });
  return new Battle({
    formatid: toID("gen4customgame"),
    seed: "1,2,3,4",
    p1: {
      name: "P1",
      team: [
        set("Pikachu", "Static", ["Thunderbolt", "Rain Dance", "Protect", "U-turn"]),
        set("Squirtle", "Torrent", ["Surf"]),
      ],
    },
    p2: { name: "P2", team: [set("Snorlax", "Immunity", ["Splash"])] },
  });
}
function withMinifiedNames<T>(battle: Battle, run: () => T): T {
  const constructors = [
    Battle,
    battle.field.constructor,
    Side,
    Pokemon,
    Dex.Condition,
    Dex.Ability,
    Dex.Item,
    Dex.Move,
    Dex.Species,
  ];
  const original = constructors.map(
    constructor => [constructor, Object.getOwnPropertyDescriptor(constructor, "name")!] as const,
  );
  try {
    constructors.forEach((constructor, index) =>
      Object.defineProperty(constructor, "name", { value: `c${index}`, configurable: true }),
    );
    return run();
  } finally {
    for (const [constructor, descriptor] of original)
      Object.defineProperty(constructor, "name", descriptor);
  }
}

it("matches the existing unminified simulator wire format without mutating shared State", () => {
  const battle = createBattle();
  const original = State.toRef;
  expect(serializeGen4Battle(battle)).toEqual(battle.toJSON());
  expect(State.toRef).toBe(original);
});

it("reproduces upstream constructor-name corruption and restores typed references after minification", () => {
  const battle = createBattle();
  const expected = JSON.stringify(battle.toJSON());
  withMinifiedNames(battle, () => {
    const broken = JSON.stringify(battle.toJSON());
    expect(broken).toContain("[c3:p1a]");
    expect(() => Battle.fromJSON(broken)).toThrow(/getMoveRequestData/);
    const fixed = JSON.stringify(serializeGen4Battle(battle));
    expect(fixed).toBe(expected);
    const restored = Battle.fromJSON(fixed);
    expect(restored.p1.active[0]).toBeInstanceOf(Pokemon);
    expect(restored.p1.active[0]!.side).toBe(restored.p1);
    expect(restored.p1.active[0]!.battle).toBe(restored);
    expect(restored.p1.active[0]!.species).toBeInstanceOf(Dex.Species);
    expect(restored.p1.activeRequest).toBeTruthy();
    restored.makeChoices("move 1", "move 1");
    expect(restored.turn).toBe(2);
    expect(restored.p2.active[0]!.hp).toBeLessThan(restored.p2.active[0]!.maxhp);
  });
});

it("round-trips weather, turn actions and a mid-turn U-turn switch with minified constructors", () => {
  let battle = createBattle();
  withMinifiedNames(battle, () => {
    const roundTrip = () => {
      battle = Battle.fromJSON(JSON.stringify(serializeGen4Battle(battle)));
    };
    battle.makeChoices("move 2", "move 1");
    roundTrip();
    expect(battle.field.weather).toBe("raindance");
    battle.makeChoices("move 4", "move 1");
    expect(battle.requestState).toBe("switch");
    const turnBefore = battle.turn;
    roundTrip();
    expect(battle.requestState).toBe("switch");
    expect(battle.p1.activeRequest).toMatchObject({ forceSwitch: [true] });
    battle.choose("p1", "switch 2");
    roundTrip();
    expect(battle.p1.active[0]!.species.id).toBe("squirtle");
    expect(battle.turn).toBe(turnBefore + 1);
    expect(battle.field.weather).toBe("raindance");
    battle.makeChoices("move 1", "move 1");
    roundTrip();
    expect(battle.p1.active[0]).toBeInstanceOf(Pokemon);
    expect(battle.turn).toBe(turnBefore + 2);
  });
});

it("preserves every reference wire tag, including empty item IDs, in renamed constructors", () => {
  const battle = createBattle();
  Object.assign(battle, {
    plReferenceProbe: {
      battle,
      field: battle.field,
      side: battle.p1,
      pokemon: battle.p1.active[0],
      condition: battle.dex.conditions.get("raindance"),
      ability: battle.dex.abilities.get("static"),
      item: battle.dex.items.get("leftovers"),
      emptyItem: battle.dex.items.get(""),
      move: battle.dex.moves.get("thunderbolt"),
      species: battle.dex.species.get("pikachu"),
    },
  });
  withMinifiedNames(battle, () => {
    const serialized = serializeGen4Battle(battle);
    // The upstream class is named DataMove, but fromRef only accepts the Move wire tag.
    // Assert the decoder contract, not constructor.name (even in unminified Node).
    expect(serialized.plReferenceProbe).toEqual({
      battle: "[Battle]",
      field: "[Field]",
      side: "[Side:p1]",
      pokemon: "[Pokemon:p1a]",
      condition: "[Condition:raindance]",
      ability: "[Ability:static]",
      item: "[Item:leftovers]",
      emptyItem: "[Item]",
      move: "[Move:thunderbolt]",
      species: "[Species:pikachu]",
    });
    const restored = Battle.fromJSON(JSON.stringify(serialized));
    const probe = (
      restored as Battle & {
        plReferenceProbe: {
          move: InstanceType<typeof Dex.Move>;
          pokemon: Pokemon;
          field: Battle["field"];
        };
      }
    ).plReferenceProbe;
    expect(probe.move).toBeInstanceOf(Dex.Move);
    expect(probe.pokemon).toBe(restored.p1.active[0]);
    expect(probe.field).toBe(restored.field);
  });
});

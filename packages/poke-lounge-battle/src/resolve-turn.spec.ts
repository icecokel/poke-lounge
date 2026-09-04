import { createCanonicalIdRecord, type CanonicalBattleState } from "./canonical-state";
import { createInitialBattleState } from "./ruleset";
import { normalizeCompetitiveParty, type CompetitivePartyInput } from "./competitive-party";
import { resolveTurn, validateCompetitiveAction } from "./resolve-turn";
import { type CanonicalCompetitiveAction } from "./actions";
import { type SeededRandom } from "./prng";

const PLAYER_A = "player-a";
const PLAYER_B = "player-b";
const IVS = {
  hp: 31,
  attack: 31,
  defense: 31,
  specialAttack: 31,
  specialDefense: 31,
  speed: 31,
};

function normalizedParty(input: {
  activeSlotIndex?: number;
  members: Array<{
    slotIndex: number;
    speciesId: number;
    level: number;
    moveIds: number[];
  }>;
}) {
  const party = normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex: input.activeSlotIndex ?? input.members[0]!.slotIndex,
    members: input.members.map(function mapItem(member) {
      return {
        ...member,
        currentHp: 1,
        status: "normal",
        individualValues: IVS,
        moves: member.moveIds.map(function mapItem(moveId) {
          return { moveId, pp: 1 };
        }),
      };
    }),
  } satisfies CompetitivePartyInput);
  return {
    ...party,
    members: party.members.map(function mapItem(member) {
      return { ...member, currentHp: member.maxHp };
    }),
  };
}

function battleState(): CanonicalBattleState {
  return createInitialBattleState([
    {
      playerId: PLAYER_A,
      party: normalizedParty({
        members: [
          { slotIndex: 0, speciesId: 7, level: 11, moveIds: [55, 86] },
          { slotIndex: 3, speciesId: 1, level: 11, moveIds: [33] },
        ],
      }),
    },
    {
      playerId: PLAYER_B,
      party: normalizedParty({
        members: [
          { slotIndex: 2, speciesId: 4, level: 11, moveIds: [33] },
          { slotIndex: 5, speciesId: 158, level: 13, moveIds: [55] },
        ],
      }),
    },
  ]);
}

function actions(first: CanonicalCompetitiveAction, second: CanonicalCompetitiveAction) {
  return createCanonicalIdRecord([
    [PLAYER_A, first],
    [PLAYER_B, second],
  ]);
}

function constantRandom(value: number): SeededRandom {
  return { next: () => value };
}

describe("competitive turn resolution V2", function testSuite() {
  it("uses real move metadata, Gen 4 damage and decrements PP", function testCase() {
    const state = battleState();
    const defenderBefore = state.playersById[PLAYER_B]!.team[0]!.currentHp;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions({ kind: "move", moveId: 55 }, { kind: "move", moveId: 33 }),
      random: constantRandom(0.99),
    });

    const attacker = resolved.state.playersById[PLAYER_A]!.team[0]!;
    const defender = resolved.state.playersById[PLAYER_B]!.team[0]!;
    expect(
      attacker.moves.find(function findItem(move) {
        return move.moveId === 55;
      })?.pp,
    ).toBe(0);
    expect(defender.currentHp).toBeLessThan(defenderBefore);
    expect(resolved.turn).toBe(0);
    expect(resolved.state.turn).toBe(1);
    expect(resolved.stateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    {
      name: "Dragon Rage",
      moveId: 82,
      attackerSpeciesId: 147,
      defenderSpeciesId: 147,
      expectedDamage: 40,
    },
    {
      name: "Sonic Boom",
      moveId: 49,
      attackerSpeciesId: 143,
      defenderSpeciesId: 95,
      expectedDamage: 20,
    },
    {
      name: "Sonic Boom against an immune target",
      moveId: 49,
      attackerSpeciesId: 143,
      defenderSpeciesId: 94,
      expectedDamage: 0,
    },
  ])("resolves $name without battle modifiers", function testCase(fixture) {
    const state = createInitialBattleState([
      {
        playerId: PLAYER_A,
        party: normalizedParty({
          members: [
            {
              slotIndex: 0,
              speciesId: fixture.attackerSpeciesId,
              level: 50,
              moveIds: [fixture.moveId],
            },
          ],
        }),
      },
      {
        playerId: PLAYER_B,
        party: normalizedParty({
          members: [
            {
              slotIndex: 0,
              speciesId: fixture.defenderSpeciesId,
              level: 50,
              moveIds: [33],
            },
          ],
        }),
      },
    ]);
    const defenderBefore = state.playersById[PLAYER_B]!.team[0]!.currentHp;
    let randomCalls = 0;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: createCanonicalIdRecord([
        [PLAYER_A, { kind: "move", moveId: fixture.moveId }],
      ]),
      random: {
        next() {
          randomCalls += 1;
          return 0;
        },
      },
    });

    expect(defenderBefore - resolved.state.playersById[PLAYER_B]!.team[0]!.currentHp).toBe(
      fixture.expectedDamage,
    );
    expect(randomCalls).toBe(1);
  });

  it("resolves one submitted action while the other participant skips the turn", function testCase() {
    const state = battleState();
    const defenderBefore = state.playersById[PLAYER_B]!.team[0]!.currentHp;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: createCanonicalIdRecord([[PLAYER_A, { kind: "move", moveId: 55 }]]),
      random: constantRandom(0.99),
    });

    expect(resolved.state.playersById[PLAYER_A]!.team[0]!.moves[0]!.pp).toBe(0);
    expect(resolved.state.playersById[PLAYER_B]!.team[0]!.currentHp).toBeLessThan(defenderBefore);
    expect(resolved.state.turn).toBe(1);
    expect(resolved.terminal).toBeNull();
  });

  it("advances an empty turn without declaring a winner", function testCase() {
    const state = battleState();

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: createCanonicalIdRecord([]),
      random: constantRandom(0.99),
    });

    expect(resolved.state.playersById).toEqual(state.playersById);
    expect(resolved.state.turn).toBe(1);
    expect(resolved.terminal).toBeNull();
  });

  it("does not end the match when only the active Pokemon faints", function testCase() {
    const state = battleState();
    const defender = state.playersById[PLAYER_B]!.team[0]!;
    defender.currentHp = 1;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions({ kind: "move", moveId: 55 }, { kind: "move", moveId: 33 }),
      random: constantRandom(0.99),
    });

    expect(resolved.terminal).toBeNull();
    expect(resolved.state.playersById[PLAYER_B]!.team[0]).toMatchObject({
      currentHp: 0,
      status: "fainted",
    });
    expect(resolved.state.playersById[PLAYER_B]!.activeSlotIndex).toBe(2);
  });

  it("applies supported status effects and participant-ordered residual damage", function testCase() {
    const state = battleState();
    const attacker = state.playersById[PLAYER_A]!.team[0]!;
    attacker.status = "burned";
    const before = attacker.currentHp;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions({ kind: "move", moveId: 86 }, { kind: "move", moveId: 33 }),
      random: constantRandom(0.99),
    });

    expect(resolved.state.playersById[PLAYER_B]!.team[0]!.status).toBe("paralyzed");
    expect(resolved.state.playersById[PLAYER_A]!.team[0]!.currentHp).toBeLessThan(before);
  });

  it("uses the ROM secondary-effect chance", function testCase() {
    const partyA = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 7, level: 11, moveIds: [34] }],
    });
    const partyB = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 4, level: 11, moveIds: [33] }],
    });
    const state = createInitialBattleState([
      { playerId: PLAYER_A, party: partyA },
      { playerId: PLAYER_B, party: partyB },
    ]);

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions({ kind: "move", moveId: 34 }, { kind: "move", moveId: 33 }),
      random: constantRandom(0.2),
    });

    expect(resolved.state.playersById[PLAYER_B]!.team[0]!.status).toBe("paralyzed");
  });

  it("uses the ROM move priority before speed", function testCase() {
    const partyA = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 7, level: 11, moveIds: [252] }],
    });
    const partyB = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 4, level: 11, moveIds: [33] }],
    });
    const state = createInitialBattleState([
      { playerId: PLAYER_A, party: partyA },
      { playerId: PLAYER_B, party: partyB },
    ]);
    state.playersById[PLAYER_A]!.team[0]!.currentHp = 1;
    state.playersById[PLAYER_B]!.team[0]!.currentHp = 1;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions({ kind: "move", moveId: 252 }, { kind: "move", moveId: 33 }),
      random: constantRandom(0.99),
    });

    expect(resolved.terminal?.winnerPlayerId).toBe(PLAYER_A);
  });

  it("applies Defense Curl to the user without damaging the opponent", function testCase() {
    const party = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 7, level: 11, moveIds: [111] }],
    });
    const state = createInitialBattleState([
      { playerId: PLAYER_A, party },
      { playerId: PLAYER_B, party },
    ]);
    const attackerHp = state.playersById[PLAYER_A]!.team[0]!.currentHp;
    const defenderHp = state.playersById[PLAYER_B]!.team[0]!.currentHp;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: createCanonicalIdRecord([[PLAYER_A, { kind: "move", moveId: 111 }]]),
      random: constantRandom(0.99),
    });

    expect(resolved.state.playersById[PLAYER_A]!.team[0]).toMatchObject({
      currentHp: attackerHp,
      statStages: { defense: 1 },
      moves: [{ moveId: 111, pp: 0 }],
    });
    expect(resolved.state.playersById[PLAYER_B]!.team[0]).toMatchObject({
      currentHp: defenderHp,
      statStages: { defense: 0 },
    });
  });

  it("requires a manual switch after an active faint", function testCase() {
    const state = battleState();
    const active = state.playersById[PLAYER_A]!.team[0]!;
    active.currentHp = 0;
    active.status = "fainted";

    expect(function callback() {
      return validateCompetitiveAction({
        state,
        playerId: PLAYER_A,
        action: { kind: "move", moveId: 55 },
      });
    }).toThrow("Cannot use a move while the active combatant is fainted");
    expect(function callback() {
      return validateCompetitiveAction({
        state,
        playerId: PLAYER_A,
        action: { kind: "switch", slotIndex: 3 },
      });
    }).not.toThrow();
  });

  it("rejects unsupported status moves and permits struggle when they are all that remain", function testCase() {
    const party = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 7, level: 11, moveIds: [97] }],
    });
    const state = createInitialBattleState([
      { playerId: PLAYER_A, party },
      { playerId: PLAYER_B, party },
    ]);

    expect(function callback() {
      return validateCompetitiveAction({
        state,
        playerId: PLAYER_A,
        action: { kind: "move", moveId: 97 },
      });
    }).toThrow("Cannot use an invalid or unsupported move");
    expect(function callback() {
      return validateCompetitiveAction({
        state,
        playerId: PLAYER_A,
        action: { kind: "move", moveId: "struggle" },
      });
    }).not.toThrow();
  });

  it("applies struggle recoil after the first team faints without replacing the winner", function testCase() {
    const party = normalizedParty({
      members: [{ slotIndex: 0, speciesId: 7, level: 11, moveIds: [97] }],
    });
    const state = createInitialBattleState([
      { playerId: PLAYER_A, party },
      { playerId: PLAYER_B, party },
    ]);
    state.playersById[PLAYER_A]!.team[0]!.currentHp = 1;
    state.playersById[PLAYER_B]!.team[0]!.currentHp = 1;

    const resolved = resolveTurn({
      state,
      actionsByPlayerId: actions(
        { kind: "move", moveId: "struggle" },
        { kind: "move", moveId: "struggle" },
      ),
      random: constantRandom(0),
    });

    expect(resolved.state.playersById[PLAYER_A]!.team[0]).toMatchObject({
      currentHp: 0,
      status: "fainted",
    });
    expect(resolved.terminal).toMatchObject({
      winnerPlayerId: PLAYER_A,
      loserPlayerId: PLAYER_B,
    });
  });
});

import { createHash } from "node:crypto";
import { canonicalize } from "./canonical-state";
import { COMPETITIVE_CATALOG_HASH } from "./competitive-catalog.generated";
import { COMPETITIVE_RULESET_HASH, COMPETITIVE_RULESET_V2 } from "./competitive-ruleset-config";
import { createInitialBattleState } from "./ruleset";
import { normalizeCompetitiveParty, type CompetitivePartyInput } from "./competitive-party";

const IVS = {
  hp: 31,
  attack: 30,
  defense: 29,
  specialAttack: 28,
  specialDefense: 27,
  speed: 26,
};

function party(input: { slotIndex: number; speciesId: number; level: number; moveIds: number[] }) {
  const normalized = normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex: input.slotIndex,
    members: [
      {
        ...input,
        currentHp: 1,
        status: "normal",
        individualValues: IVS,
        moves: input.moveIds.map(function mapItem(moveId) {
          return { moveId, pp: 1 };
        }),
      },
    ],
  } satisfies CompetitivePartyInput);
  return {
    ...normalized,
    members: normalized.members.map(function mapItem(member) {
      return { ...member, currentHp: member.maxHp };
    }),
  };
}

describe("competitive ruleset V2", function testSuite() {
  it("preserves each normalized grown party with its original slots and levels", function testCase() {
    const squirtle = party({ slotIndex: 0, speciesId: 7, level: 11, moveIds: [55] });
    const totodile = party({ slotIndex: 2, speciesId: 158, level: 13, moveIds: [55, 44] });

    const state = createInitialBattleState([
      { playerId: "player-b", party: totodile },
      { playerId: "player-a", party: squirtle },
    ]);

    expect(state.participantIds).toEqual(["player-a", "player-b"]);
    expect(state.playersById["player-a"]?.team[0]).toMatchObject({
      slotIndex: 0,
      speciesId: 7,
      level: 11,
      moves: [{ moveId: 55, pp: 1 }],
    });
    expect(state.playersById["player-b"]?.team[0]).toMatchObject({
      slotIndex: 2,
      speciesId: 158,
      level: 13,
      moves: [
        { moveId: 55, pp: 1 },
        { moveId: 44, pp: 1 },
      ],
    });
    expect(state.playersById["player-a"]?.team[0]?.statStages).toEqual({
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    });
  });

  it("binds the ruleset hash to the canonical V2 config and generated catalog hash", function testCase() {
    const expected = createHash("sha256")
      .update(
        canonicalize({
          catalogHash: COMPETITIVE_CATALOG_HASH,
          ruleset: COMPETITIVE_RULESET_V2,
        }),
        "utf8",
      )
      .digest("hex");

    expect(COMPETITIVE_RULESET_HASH).toBe(expected);
    expect(COMPETITIVE_RULESET_HASH).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["blank", "", "player-b", "Initial-state participant IDs must be non-empty"],
    ["duplicate", "same", "same", "Initial-state participant IDs must be distinct"],
  ])("rejects %s participant IDs", function callback(_case, first, second, message) {
    const validParty = party({ slotIndex: 0, speciesId: 7, level: 11, moveIds: [55] });
    expect(function callback() {
      return createInitialBattleState([
        { playerId: first, party: validParty },
        { playerId: second, party: validParty },
      ]);
    }).toThrow(message);
  });
});

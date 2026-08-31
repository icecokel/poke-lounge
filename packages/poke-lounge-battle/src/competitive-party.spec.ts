import {
  canUseCompetitiveStruggle,
  COMPETITIVE_CATALOG_HASH,
  COMPETITIVE_CATALOG_MOVE_COUNT,
  COMPETITIVE_CATALOG_SPECIES_COUNT,
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
  CompetitivePartyValidationError,
  isCompetitiveMoveSelectable,
  normalizeCompetitiveParty,
  restoreCompetitiveParty,
  type CompetitivePartyInput,
} from "./index";

const IVS = {
  hp: 31,
  attack: 31,
  defense: 31,
  specialAttack: 31,
  specialDefense: 31,
  speed: 31,
};

function input(overrides: Partial<CompetitivePartyInput> = {}): CompetitivePartyInput {
  return {
    version: 2,
    activeSlotIndex: 0,
    members: [
      {
        slotIndex: 0,
        speciesId: 7,
        level: 11,
        currentHp: 1,
        status: "normal",
        individualValues: IVS,
        moves: [{ moveId: 55, pp: 25 }],
      },
    ],
    ...overrides,
  };
}

describe("competitive party normalization", () => {
  it("keeps the generated catalog boundaries, counts and hash stable", () => {
    expect(Object.keys(COMPETITIVE_SPECIES_CATALOG)).toHaveLength(493);
    expect(Object.keys(COMPETITIVE_MOVE_CATALOG)).toHaveLength(467);
    expect(COMPETITIVE_CATALOG_SPECIES_COUNT).toBe(493);
    expect(COMPETITIVE_CATALOG_MOVE_COUNT).toBe(467);
    expect(COMPETITIVE_CATALOG_HASH).toBe(
      "29ef3804084c8ebbc2014c0799835f71667db37f3d1b620b1007b3014a78e952",
    );
    expect(COMPETITIVE_SPECIES_CATALOG[1]?.speciesId).toBe(1);
    expect(COMPETITIVE_SPECIES_CATALOG[493]?.speciesId).toBe(493);
    expect(COMPETITIVE_MOVE_CATALOG[1]?.moveId).toBe(1);
    expect(COMPETITIVE_MOVE_CATALOG[467]?.moveId).toBe(467);
    expect(COMPETITIVE_MOVE_CATALOG[95]?.accuracy).toBe(60);
  });

  it("derives stats, types and move limits from the generated server catalog", () => {
    const normalized = normalizeCompetitiveParty(input());
    expect(normalized.members[0]).toMatchObject({
      speciesId: 7,
      level: 11,
      maxHp: 34,
      attack: 18,
      defense: 22,
      specialAttack: 19,
      specialDefense: 22,
      speed: 17,
      typeIds: [11],
      moves: [{ moveId: 55, pp: 25 }],
    });
    expect(COMPETITIVE_SPECIES_CATALOG[494]).toBeUndefined();
    expect(COMPETITIVE_MOVE_CATALOG[0]).toBeUndefined();
    expect(COMPETITIVE_MOVE_CATALOG[55]).toMatchObject({
      typeId: 11,
      category: "special",
      power: 40,
      accuracy: 100,
      maxPp: 25,
    });
  });

  it("preserves parties with different levels and non-contiguous physical slots", () => {
    const members = [
      { ...input().members[0], slotIndex: 5, speciesId: 158, level: 13 },
      { ...input().members[0], slotIndex: 0, speciesId: 7, level: 11 },
      { ...input().members[0], slotIndex: 2, speciesId: 152, level: 17 },
    ];

    const normalized = normalizeCompetitiveParty(input({ activeSlotIndex: 2, members }));

    expect(normalized.members.map(member => member.slotIndex)).toEqual([0, 2, 5]);
    expect(normalized.members.map(member => member.level)).toEqual([11, 17, 13]);
    expect(normalized.members.map(member => member.speciesId)).toEqual([7, 152, 158]);
  });

  it("accepts a six-member party without changing its size", () => {
    const members = Array.from({ length: 6 }, (_, slotIndex) => ({
      ...input().members[0],
      slotIndex,
    }));

    expect(normalizeCompetitiveParty(input({ members })).members).toHaveLength(6);
  });

  it("restores HP, PP and persistent status before a tournament battle", () => {
    const normalized = normalizeCompetitiveParty(
      input({
        members: [
          {
            ...input().members[0],
            currentHp: 7,
            status: "paralyzed",
            moves: [{ moveId: 55, pp: 1 }],
          },
        ],
      }),
    );

    expect(restoreCompetitiveParty(normalized).members[0]).toMatchObject({
      currentHp: normalized.members[0]?.maxHp,
      status: "normal",
      moves: [{ moveId: 55, pp: 25 }],
    });
    expect(normalized.members[0]).toMatchObject({
      currentHp: 7,
      status: "paralyzed",
      moves: [{ moveId: 55, pp: 1 }],
    });
  });

  it.each([
    ["party-empty", { members: [] }],
    [
      "party-too-large",
      {
        members: Array.from({ length: 7 }, (_, slotIndex) => ({
          ...input().members[0],
          slotIndex,
        })),
      },
    ],
    ["slot-out-of-range", { members: [{ ...input().members[0], slotIndex: -1 }] }],
    ["duplicate-slot", { members: [...input().members, { ...input().members[0] }] }],
    ["active-slot-missing", { activeSlotIndex: 2 }],
    [
      "active-pokemon-fainted",
      { members: [{ ...input().members[0], currentHp: 0, status: "fainted" as const }] },
    ],
    ["species-unsupported", { members: [{ ...input().members[0], speciesId: 494 }] }],
    ["level-out-of-range", { members: [{ ...input().members[0], level: 0 }] }],
    [
      "iv-out-of-range",
      {
        members: [
          {
            ...input().members[0],
            individualValues: { ...IVS, specialAttack: 32 },
          },
        ],
      },
    ],
    ["hp-out-of-range", { members: [{ ...input().members[0], currentHp: 35 }] }],
    [
      "status-hp-mismatch",
      { members: [{ ...input().members[0], currentHp: 0, status: "normal" as const }] },
    ],
    ["move-count-out-of-range", { members: [{ ...input().members[0], moves: [] }] }],
    [
      "duplicate-move",
      {
        members: [
          {
            ...input().members[0],
            moves: [
              { moveId: 55, pp: 1 },
              { moveId: 55, pp: 1 },
            ],
          },
        ],
      },
    ],
    ["move-unsupported", { members: [{ ...input().members[0], moves: [{ moveId: 471, pp: 1 }] }] }],
    ["pp-out-of-range", { members: [{ ...input().members[0], moves: [{ moveId: 55, pp: 26 }] }] }],
  ])("rejects invalid input with reason %s", (reason, overrides) => {
    try {
      normalizeCompetitiveParty(input(overrides as Partial<CompetitivePartyInput>));
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(CompetitivePartyValidationError);
      expect((error as CompetitivePartyValidationError).reason).toBe(reason);
      expect((error as Error).message).not.toContain("55");
    }
  });

  it("allows struggle only when no selectable move has PP", () => {
    expect(isCompetitiveMoveSelectable(55)).toBe(true);
    expect(isCompetitiveMoveSelectable(86)).toBe(true);
    expect(isCompetitiveMoveSelectable(111)).toBe(true);
    expect(isCompetitiveMoveSelectable(97)).toBe(false);
    expect(canUseCompetitiveStruggle([{ moveId: 97, pp: 30 }])).toBe(true);
    expect(canUseCompetitiveStruggle([{ moveId: 55, pp: 1 }])).toBe(false);
  });
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = "../../../packages/poke-lounge-battle/dist/";
const { canonicalize } = require(`${dist}canonical-json.js`);
const { COMPETITIVE_SPECIES_CATALOG, COMPETITIVE_MOVE_CATALOG } = require(
  `${dist}competitive-catalog.generated.js`,
);
const { GEN4_ROM_SPECIES, GEN4_ROM_ITEMS } = require(`${dist}gen4/rom-catalog.generated.js`);
const { ROM_TRAINERS } = require(`${dist}league/roster/rom-trainers.js`);
const { ELITE_FOUR_SUPPLEMENTS } = require(`${dist}league/roster/supplements.js`);
const { GYM_TRAINERS, GYM_LEVEL_PLANS } = require(`${dist}league/roster/gym-level-plans.js`);
const {
  NPC_SEEDS,
  DEFAULT_GYM_LEVEL_PLAN,
  LEAGUE_ROSTER_VERSION,
  npcSeedCompositions,
  badgeNpcCompositions,
  seasonRoster,
} = require(`${dist}league/roster/index.js`);
const learnsets = JSON.parse(
  readFileSync(
    new URL("../../../apps/web/public/game-data/level-up-move-table.json", import.meta.url),
  ),
).species;

// f4-opponents.md 4.1·4.3절 기대값: ROM 데이터에서 계산하지 않는다.
// [한국 이름, 분류 ID, 성별, 난이도, [[종족, 레벨, 기술, 아이템, +0x01], ...]]
const expectedRom = {
  244: [
    "목호",
    86,
    "male",
    250,
    [
      [130, 46, [175, 406, 127, 423], 0, 0],
      [149, 49, [86, 407, 87, 63], 0, 0],
      [149, 49, [86, 407, 59, 63], 0, 0],
      [142, 48, [332, 242, 157, 422], 0, 32],
      [6, 48, [421, 403, 337, 424], 0, 0],
      [149, 50, [126, 219, 200, 63], 158, 0],
    ],
  ],
  245: [
    "일목",
    87,
    "male",
    250,
    [
      [178, 40, [369, 382, 109, 94], 0, 0],
      [124, 41, [3, 142, 8, 94], 0, 0],
      [103, 41, [115, 95, 121, 94], 0, 0],
      [80, 41, [174, 133, 352, 94], 0, 32],
      [178, 42, [332, 466, 109, 94], 158, 32],
    ],
  ],
  246: [
    "카렌",
    88,
    "female",
    250,
    [
      [197, 42, [104, 109, 185, 371], 0, 0],
      [45, 42, [78, 51, 236, 80], 0, 0],
      [94, 45, [122, 180, 411, 194], 0, 0],
      [198, 44, [365, 18, 389, 185], 0, 32],
      [229, 47, [417, 399, 53, 242], 158, 0],
    ],
  ],
  247: [
    "독수",
    89,
    "male",
    250,
    [
      [168, 40, [398, 169, 226, 202], 0, 32],
      [49, 41, [48, 16, 94, 92], 0, 0],
      [205, 43, [182, 129, 153, 390], 0, 0],
      [89, 42, [107, 103, 441, 92], 281, 32],
      [169, 44, [104, 98, 17, 305], 158, 0],
    ],
  ],
  418: [
    "시바",
    112,
    "male",
    250,
    [
      [237, 42, [68, 98, 91, 167], 0, 32],
      [106, 42, [207, 116, 136, 299], 0, 32],
      [107, 42, [9, 8, 7, 418], 0, 32],
      [95, 43, [225, 89, 201, 157], 0, 32],
      [68, 46, [157, 193, 279, 238], 158, 32],
    ],
  ],
  20: [
    "비상",
    66,
    "male",
    50,
    [
      [16, 9, [33, 28], 0, 0],
      [17, 13, [33, 355, 16], 0, 0],
    ],
  ],
  21: [
    "호일",
    67,
    "male",
    80,
    [
      [123, 17, [98, 43, 369, 116], 158, 32],
      [14, 15, [40], 0, 0],
      [11, 15, [33], 0, 0],
    ],
  ],
  30: [
    "꼭두",
    70,
    "female",
    100,
    [
      [35, 17, [3, 102, 227, 118], 0, 0],
      [241, 19, [205, 213, 23, 208], 157, 32],
    ],
  ],
  31: [
    "유빈",
    72,
    "male",
    100,
    [
      [92, 21, [122, 180, 212, 174], 0, 0],
      [93, 21, [95, 138, 174, 171], 0, 0],
      [94, 25, [95, 247, 212, 389], 158, 0],
      [93, 23, [174, 212, 389, 101], 0, 0],
    ],
  ],
  34: [
    "사도",
    75,
    "male",
    150,
    [
      [57, 29, [43, 104, 264, 157], 0, 0],
      [62, 31, [95, 57, 264, 34], 158, 0],
    ],
  ],
  33: [
    "규리",
    74,
    "female",
    150,
    [
      [81, 30, [85, 48, 49, 86], 0, 0],
      [81, 30, [85, 48, 49, 86], 0, 32],
      [208, 35, [103, 201, 88, 231], 158, 32],
    ],
  ],
  32: [
    "류옹",
    73,
    "male",
    150,
    [
      [86, 30, [173, 258, 196, 156], 0, 0],
      [87, 32, [214, 420, 62, 156], 0, 0],
      [221, 34, [258, 423, 426, 59], 158, 32],
    ],
  ],
  35: [
    "이향",
    76,
    "female",
    200,
    [
      [130, 38, [239, 82, 44, 406], 0, 0],
      [148, 38, [86, 126, 21, 406], 0, 0],
      [148, 38, [86, 401, 21, 406], 0, 0],
      [230, 41, [108, 56, 63, 406], 158, 32],
    ],
  ],
};
assert.deepEqual(Object.keys(ROM_TRAINERS), Object.keys(expectedRom));
for (const [id, [displayName, trainerClass, gender, difficulty, rows]] of Object.entries(
  expectedRom,
)) {
  assert.deepEqual(
    ROM_TRAINERS[id],
    {
      trainerId: Number(id),
      displayName,
      trainerClass,
      gender,
      className: id === "244" ? "챔피언" : difficulty === 250 ? "사천왕" : "체육관 관장",
      partyCount: rows.length,
      members: rows.map(([speciesId, level, moveIds, heldItemId, genderAbilityOverride]) => ({
        speciesId,
        level,
        moveIds,
        heldItemId,
        difficulty,
        genderAbilityOverride,
      })),
    },
    `ROM trainer ${id}`,
  );
}

assert.deepEqual(
  NPC_SEEDS.map(s => [s.npcKey, s.displayName, s.order, s.trainerId]),
  [
    ["lance", "목호", 1, 244],
    ["karen", "카렌", 2, 246],
    ["bruno", "시바", 3, 418],
    ["koga", "독수", 4, 247],
    ["will", "일목", 5, 245],
  ],
);
const expectedExtras = {
  lance: [],
  will: [[282, 41, [94, 345, 347, 104]]],
  koga: [[454, 43, [398, 279, 389, 207]]],
  bruno: [[297, 43, [358, 395, 265, 282]]],
  karen: [[359, 45, [389, 44, 163, 14]]],
};
assert.deepEqual(Object.keys(ELITE_FOUR_SUPPLEMENTS).sort(), Object.keys(expectedExtras).sort());
for (const { npcKey, trainerId } of NPC_SEEDS) {
  const extras = ELITE_FOUR_SUPPLEMENTS[npcKey];
  assert.deepEqual(
    extras,
    expectedExtras[npcKey].map(([speciesId, level, moveIds]) => ({
      speciesId,
      level,
      moveIds,
      heldItemId: 0,
    })),
  );
  for (const extra of extras) {
    assert.equal(
      extra.level,
      ROM_TRAINERS[trainerId].members.map(m => m.level).sort((a, b) => b - a)[1],
    );
    for (const moveId of extra.moveIds) {
      assert(
        learnsets[extra.speciesId].some(m => m.moveId === moveId && m.level <= extra.level),
        `Supplement ${extra.speciesId}: move ${moveId} unavailable at level ${extra.level}`,
      );
    }
  }
}

assert.equal(DEFAULT_GYM_LEVEL_PLAN, "curve-v1");
assert.deepEqual(
  GYM_TRAINERS.map(t => [t.npcKey, t.trainerId]),
  [
    ["falkner", 20],
    ["bugsy", 21],
    ["whitney", 30],
    ["morty", 31],
    ["chuck", 34],
    ["jasmine", 33],
    ["pryce", 32],
    ["clair", 35],
  ],
);
assert.deepEqual(GYM_LEVEL_PLANS.original, [
  [9, 13],
  [17, 15, 15],
  [17, 19],
  [21, 21, 25, 23],
  [29, 31],
  [30, 30, 35],
  [30, 32, 34],
  [38, 38, 38, 41],
]);
assert.deepEqual(GYM_LEVEL_PLANS["curve-v1"], [
  [10, 12],
  [17, 15, 15],
  [20, 22],
  [24, 24, 27, 25],
  [30, 32],
  [34, 34, 37],
  [39, 40, 42],
  [44, 44, 44, 46],
]);

// 구성은 정적 로스터 데이터로만 검사한다. 전투 엔진·AI·게임 상태를 실행하지 않는다.
function checkComposition(composition, trainer, rows, levels) {
  assert.equal(composition.version, 1);
  assert.equal(composition.leadSlot, 0);
  assert.equal(composition.members.length, rows.length);
  composition.members.forEach((m, slot) => {
    const row = rows[slot];
    const species = GEN4_ROM_SPECIES[m.speciesId];
    assert(COMPETITIVE_SPECIES_CATALOG[m.speciesId] && species);
    assert.equal(m.slotIndex, slot);
    assert.equal(m.speciesId, row.speciesId);
    assert.equal(m.level, levels[slot]);
    assert(Number.isInteger(m.level) && m.level >= 1 && m.level <= 50);
    assert.equal(m.heldItemId, row.heldItemId);
    assert(m.heldItemId === 0 || GEN4_ROM_ITEMS[m.heldItemId]);
    const override = row.genderAbilityOverride ?? 0;
    const abilityOverride = override >> 4;
    const genderOverride = override & 0xf;
    assert([0, 1, 2].includes(abilityOverride));
    assert([0, 1, 2].includes(genderOverride));
    const abilitySlot = abilityOverride === 2 ? 1 : 0;
    assert(
      species.abilities[abilitySlot],
      `ROM trainer ${trainer.trainerId}/${slot}: ability slot ${abilitySlot + 1} missing`,
    );
    assert.equal(
      m.abilityId,
      species.abilities[abilitySlot],
      `ROM trainer ${trainer.trainerId}/${slot}: +0x01 ability slot mismatch`,
    );
    assert(species.abilities.includes(m.abilityId) && m.abilityId >= 1 && m.abilityId <= 123);
    assert.equal(
      m.gender,
      species.genderRatio === 255
        ? "genderless"
        : species.genderRatio === 254
          ? "female"
          : species.genderRatio === 0
            ? "male"
            : genderOverride === 1
              ? "male"
              : genderOverride === 2
                ? "female"
                : species.genderRatio > (trainer.gender === "female" ? 0x78 : 0x88)
                  ? "female"
                  : "male",
    );
    assert.equal(m.natureId, 0);
    assert.equal(m.happiness, 70);
    assert(!Object.hasOwn(m, "monId"));
    const statKeys = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"];
    assert.deepEqual(
      m.individualValues,
      Object.fromEntries(
        statKeys.map(k => [
          k,
          Math.floor(((row.difficulty ?? trainer.members[0].difficulty) * 31) / 255),
        ]),
      ),
    );
    assert.deepEqual(m.effortValues, Object.fromEntries(statKeys.map(k => [k, 0])));
    assert(m.moves.length >= 1 && m.moves.length <= 4);
    assert.equal(new Set(m.moves.map(move => move.moveId)).size, m.moves.length);
    assert.deepEqual(
      m.moves,
      row.moveIds.map(moveId => {
        assert(COMPETITIVE_MOVE_CATALOG[moveId]);
        return { moveId, maxPp: COMPETITIVE_MOVE_CATALOG[moveId].maxPp };
      }),
    );
  });
}
const npcSeeds = npcSeedCompositions();
assert.equal(npcSeeds.length, 5);
assert.equal(new Set(npcSeeds.map(s => s.npcKey)).size, 5);
assert.equal(new Set(npcSeeds.map(s => s.order)).size, 5);
for (const [index, seed] of npcSeeds.entries()) {
  const { trainerId, ...meta } = NPC_SEEDS[index];
  const { composition, publicParty, ...actualMeta } = seed;
  assert.deepEqual(actualMeta, meta);
  assert.equal(composition.members.length, 6);
  const trainer = ROM_TRAINERS[trainerId];
  const rows = [...trainer.members, ...ELITE_FOUR_SUPPLEMENTS[seed.npcKey]];
  checkComposition(
    composition,
    trainer,
    rows,
    rows.map(m => m.level),
  );
  assert.deepEqual(
    publicParty,
    rows.map(m => ({
      speciesId: m.speciesId,
      level: Math.min(m.level, 50),
      moveIds: [...m.moveIds],
    })),
  );
}
for (const plan of Object.keys(GYM_LEVEL_PLANS)) {
  const badges = badgeNpcCompositions(plan);
  assert.equal(badges.length, 8);
  assert.deepEqual(
    badges.map(b => b.displayName),
    ["비상", "호일", "꼭두", "유빈", "사도", "규리", "류옹", "이향"],
  );
  assert.deepEqual(
    badges.map(b => b.composition.members.length),
    [2, 3, 2, 4, 2, 3, 3, 4],
  );
  badges.forEach((badge, index) => {
    assert.equal(badge.badgeIndex, index);
    assert.equal(badge.npcKey, GYM_TRAINERS[index].npcKey);
    const trainer = ROM_TRAINERS[GYM_TRAINERS[index].trainerId];
    assert.equal(GYM_LEVEL_PLANS[plan][index].length, trainer.partyCount);
    checkComposition(badge.composition, trainer, trainer.members, GYM_LEVEL_PLANS[plan][index]);
  });
}
const badgeNpcs = badgeNpcCompositions();
const expectedVersion = `roster1:${createHash("sha256").update(canonicalize({ npcSeeds, badgeNpcs })).digest("hex").slice(0, 12)}`;
assert.equal(
  LEAGUE_ROSTER_VERSION,
  expectedVersion,
  `Update LEAGUE_ROSTER_VERSION to ${expectedVersion}`,
);
assert.deepEqual(seasonRoster(), { rosterVersion: expectedVersion, npcSeeds, badgeNpcs });
console.log(
  `League roster static data OK: 13 ROM trainers, 49 originals + 4 supplements, ${expectedVersion}`,
);

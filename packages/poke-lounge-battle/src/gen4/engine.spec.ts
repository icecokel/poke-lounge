import {
  advanceGen4Battle,
  createGen4Battle,
  defaultGen4Action,
  readGen4Battle,
  validateGen4Action,
} from "./engine";
import { parseGen4ActionRequest } from "./request";
import { hgssCaptureValue, hgssShakeThreshold } from "./capture";
import { calculateGen4BattleStats } from "../gen4-pokemon-stats";
import { normalizeGen4Traits, awardGen4EffortValues } from "./traits";
import { GEN4_ROM_MOVE_NAMES, GEN4_ROM_SPECIES } from "./rom-catalog.generated";
import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
import type { Gen4Member, Gen4Party, Gen4Action, Gen4Frame } from "./types";

const IVS = { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 };
const SEED = () => 0.371;
function member(moveIds: number[], patch: Partial<Gen4Member> = {}): Gen4Member {
  return {
    slotIndex: 0,
    speciesId: 151,
    name: "뮤",
    level: 50,
    maxHp: 1000,
    currentHp: 1000,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    speed: 150,
    individualValues: IVS,
    moves: moveIds.map(id => ({ moveId: id, pp: COMPETITIVE_MOVE_CATALOG[id]!.maxPp })),
    ...patch,
  };
}
function party(...members: Gen4Member[]): Gen4Party {
  return { activeSlotIndex: members[0]!.slotIndex, members };
}
function start(
  own: Gen4Member,
  foe: Gen4Member = member([150], { speciesId: 143, name: "잠만보", speed: 50 }),
  reserve?: Gen4Member,
): Gen4Frame {
  return createGen4Battle([party(own, ...(reserve ? [reserve] : [])), party(foe)], SEED);
}
function turn(frame: Gen4Frame, own?: Gen4Action, foe?: Gen4Action): Gen4Frame {
  return advanceGen4Battle(frame.session, [
    own ?? defaultGen4Action(frame.requests[0]),
    foe ?? defaultGen4Action(frame.requests[1]),
  ]);
}
const hp = (f: Gen4Frame, side: 0 | 1, slot = 0) =>
  f.parties[side].members.find(m => m.slotIndex === slot)!.currentHp!;

it("all 467 Korean-ROM moves execute through Gen4 and round-trip their bounded requests", () => {
  for (let id = 1; id <= 467; id++) {
    try {
      let state = start(
        member([id]),
        member([150], { speciesId: 143, speed: 25 }),
        member([150], { slotIndex: 4 }),
      );
      for (let step = 0; step < 3 && !state.ended; step++) {
        state = turn(state);
        for (const request of state.requests)
          expect(parseGen4ActionRequest(request)).toEqual(request);
        for (const p of state.parties)
          for (const m of p.members) {
            expect(Number.isInteger(m.currentHp)).toBe(true);
            expect(m.currentHp).toBeGreaterThanOrEqual(0);
            expect(m.currentHp).toBeLessThanOrEqual(m.maxHp!);
            for (const move of m.moves) {
              expect(move.pp).toBeGreaterThanOrEqual(0);
              expect(move.pp).toBeLessThanOrEqual(move.maxPp!);
            }
          }
        expect(readGen4Battle(state.session).requests).toEqual(state.requests);
      }
    } catch (error) {
      throw new Error(`ROM move ${id} ${GEN4_ROM_MOVE_NAMES[id]}: ${String(error)}`, {
        cause: error,
      });
    }
  }
}, 60000);

it("False Swipe leaves 1 HP and never ends the encounter", () => {
  const before = start(member([206]), member([150], { speciesId: 143, currentHp: 1 }));
  const after = turn(before);
  expect(hp(after, 1)).toBe(1);
  expect(after.ended).toBe(false);
});
it.each([71, 202])("drain move %i restores half of actual inflicted damage", id => {
  const before = start(member([id], { currentHp: 100 }));
  const after = turn(before);
  expect(hp(after, 0) - 100).toBe(Math.max(1, Math.floor((hp(before, 1) - hp(after, 1)) / 2)));
});
it.each([
  [36, 4],
  [38, 3],
] as const)("recoil move %i inflicts its cartridge recoil fraction", (id, divisor) => {
  const before = start(member([id]));
  const after = turn(before);
  const damage = hp(before, 1) - hp(after, 1);
  expect(damage).toBeGreaterThan(0);
  expect(1000 - hp(after, 0)).toBe(Math.max(1, Math.round(damage / divisor)));
});
it("Self-Destruct faints its user and requires replacement while a reserve remains", () => {
  const after = turn(start(member([120]), undefined, member([150], { slotIndex: 4 })));
  expect(hp(after, 0)).toBe(0);
  expect(after.ended).toBe(false);
  expect(after.requests[0].kind).toBe("switch");
  expect(after.requests[1].kind).toBe("wait");
});
it("Dream Eater fails without sleep and drains a sleeping target", () => {
  const awake = turn(start(member([138], { currentHp: 100 })));
  expect(hp(awake, 1)).toBe(1000);
  expect(hp(awake, 0)).toBe(100);
  const asleep = turn(
    start(
      member([138], { currentHp: 100 }),
      member([150], { speciesId: 143, status: "asleep", statusTurns: 3, speed: 50 }),
    ),
  );
  expect(hp(asleep, 1)).toBeLessThan(1000);
  expect(hp(asleep, 0)).toBeGreaterThan(100);
});
it.each([19, 91])(
  "two-turn move %i consumes PP once and blocks normal incoming attacks while hidden",
  id => {
    let state = start(member([id]), member([33], { speciesId: 143, speed: 50 }));
    const pp = state.parties[0].members[0]!.moves[0]!.pp;
    state = turn(state);
    expect(hp(state, 1)).toBe(1000);
    expect(hp(state, 0)).toBe(1000);
    expect(state.requests[0].forcedMoveId).toBe(id);
    expect(() =>
      validateGen4Action(state.requests[0], { kind: "item", itemId: 17, slotIndex: 0 }),
    ).toThrow();
    state = turn(state);
    expect(hp(state, 1)).toBeLessThan(1000);
    expect(state.parties[0].members[0]!.moves[0]!.pp).toBe(pp - 1);
  },
);
it("Hyper Beam requires one recharge turn, not a second attack", () => {
  let state = turn(start(member([63])));
  const afterHit = hp(state, 1);
  expect(state.requests[0].recharge).toBe(true);
  state = turn(state);
  expect(hp(state, 1)).toBe(afterHit);
  expect(state.requests[0].recharge).toBe(false);
});
it("multi-hit moves apply repeated strikes rather than one base-power hit", () => {
  const after = turn(start(member([3])));
  expect(after.steps.some(s => /번 맞았다/.test(s.text))).toBe(true);
  const count = after.steps.find(s => /번 맞았다/.test(s.text))!.text.match(/\d+/)![0];
  expect(Number(count)).toBeGreaterThanOrEqual(2);
  expect(Number(count)).toBeLessThanOrEqual(5);
});
it("U-turn pauses mid-turn and resumes the already chosen opponent attack once against the replacement", () => {
  let state = turn(
    start(
      member([369]),
      member([33], { speciesId: 143, speed: 50 }),
      member([150], { slotIndex: 4 }),
    ),
  );
  expect(state.requests[0].kind).toBe("switch");
  expect(state.requests[1].kind).toBe("wait");
  expect(state.turn).toBe(1);
  expect(hp(state, 0, 4)).toBe(1000);
  state = turn(state, { kind: "switch", slotIndex: 4 });
  expect(state.turn).toBe(2);
  expect(state.parties[0].activeSlotIndex).toBe(4);
  expect(hp(state, 0, 4)).toBeLessThan(1000);
  expect(state.parties[1].members[0]!.moves[0]!.pp).toBe(COMPETITIVE_MOVE_CATALOG[33]!.maxPp - 1);
});
it("voluntary switching clears stages instead of carrying them back into battle", () => {
  let state = start(member([14]), undefined, member([150], { slotIndex: 4 }));
  state = turn(state);
  expect(state.parties[0].members[0]!.statStages!.attack).toBe(2);
  state = turn(state, { kind: "switch", slotIndex: 4 });
  state = turn(state, { kind: "switch", slotIndex: 0 });
  expect(state.parties[0].members[0]!.statStages!.attack).toBe(0);
});
it("a faint replacement is not another full turn and does not repeat residual damage", () => {
  let state = start(
    member([150], { currentHp: 1, status: "poisoned" }),
    undefined,
    member([150], { slotIndex: 4 }),
  );
  state = turn(state);
  expect(state.requests[0].kind).toBe("switch");
  const count = state.turn,
    pp = state.parties[1].members[0]!.moves[0]!.pp;
  state = turn(state, { kind: "switch", slotIndex: 4 });
  expect(hp(state, 0, 4)).toBe(1000);
  expect(state.parties[1].members[0]!.moves[0]!.pp).toBe(pp);
  expect(state.turn).toBe(count + 1);
});
it("bag targeting heals a reserve and never spends active Pokémon PP", () => {
  const initial = start(
    member([150], { currentHp: 100 }),
    undefined,
    member([150], { slotIndex: 4, currentHp: 100 }),
  );
  const after = turn(initial, { kind: "item", itemId: 17, slotIndex: 4 });
  expect(hp(after, 0, 4)).toBe(120);
  expect(hp(after, 0)).toBe(100);
  expect(after.parties[0].members[0]!.moves[0]!.pp).toBe(40);
  expect(after.steps.every(s => s.playerHp === 100)).toBe(true);
});
it("Revive can target a fainted reserve, including after snapshot deserialization", () => {
  let state = start(
    member([150]),
    undefined,
    member([150], { slotIndex: 4, currentHp: 0, status: "fainted" }),
  );
  state = turn(state, { kind: "item", itemId: 28, slotIndex: 4 });
  expect(hp(state, 0, 4)).toBe(500);
  state = turn(state, { kind: "switch", slotIndex: 4 });
  expect(state.parties[0].activeSlotIndex).toBe(4);
});
it("Paralyze Heal recognizes the ROM paralysisHeal bit", () => {
  const after = turn(start(member([150], { status: "paralyzed" })), {
    kind: "item",
    itemId: 22,
    slotIndex: 0,
  });
  expect(after.parties[0].members[0]!.status).toBe("normal");
});
it("ineffective items reject atomically without advancing either choice or spending PP", () => {
  const before = start(member([150]));
  const json = JSON.stringify(before);
  expect(() => turn(before, { kind: "item", itemId: 17, slotIndex: 0 })).toThrow();
  expect(JSON.stringify(before)).toBe(json);
});
it("Levitate blocks Ground and Intimidate activates only when entering", () => {
  const immune = turn(
    start(member([89]), member([150], { speciesId: 94, abilityId: 26, speed: 50 })),
  );
  expect(hp(immune, 1)).toBe(1000);
  const entry = start(member([150]), member([150], { speciesId: 130, abilityId: 22, speed: 50 }));
  expect(entry.parties[0].members[0]!.statStages!.attack).toBe(-1);
  const next = turn(entry);
  expect(next.parties[0].members[0]!.statStages!.attack).toBe(-1);
});
it("Toxic increases per-turn damage and switching resets its escalation counter", () => {
  let state = start(
    member([150], { speciesId: 143, abilityId: 47, status: "badlyPoisoned" }),
    undefined,
    member([150], { slotIndex: 4 }),
  );
  state = turn(state);
  expect(hp(state, 0)).toBe(938);
  state = turn(state);
  expect(hp(state, 0)).toBe(814);
  state = turn(state, { kind: "switch", slotIndex: 4 });
  state = turn(state, { kind: "switch", slotIndex: 0 });
  expect(hp(state, 0)).toBe(752);
});
it("Protect blocks an incoming damaging move without damaging its user", () => {
  const after = turn(start(member([182]), member([33], { speciesId: 143, speed: 50 })));
  expect(hp(after, 0)).toBe(1000);
});
it("nature and EV stat math uses Gen4 flooring and the 510/255 cap", () => {
  const base = {
    hp: 100,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    speed: 100,
  };
  const neutral = calculateGen4BattleStats(base, 50, IVS),
    adamant = calculateGen4BattleStats(base, 50, IVS, undefined, 3);
  expect(adamant.attack).toBe(Math.floor(neutral.attack * 1.1));
  expect(adamant.specialAttack).toBe(Math.floor(neutral.specialAttack * 0.9));
  const ev = { hp: 255, attack: 254, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  const next = awardGen4EffortValues(ev, 68);
  expect(Object.values(next).reduce((a, b) => a + b, 0)).toBe(510);
  expect(next.attack).toBe(255);
  expect(normalizeGen4Traits(1).natureId).toBe(0);
  expect(GEN4_ROM_SPECIES[1]!.abilities).toContain(normalizeGen4Traits(1).abilityId);
});
it("capture math floors ball bonus before HP and status modifiers, then uses integer square roots", () => {
  expect(hgssCaptureValue({ maxHp: 100, currentHp: 10, catchRate: 45 })).toBe(42);
  expect(hgssCaptureValue({ maxHp: 100, currentHp: 10, catchRate: 45, statusBonus: 1.5 })).toBe(63);
  expect(hgssCaptureValue({ maxHp: 100, currentHp: 10, catchRate: 45, statusBonus: 2 })).toBe(84);
  expect(hgssCaptureValue({ maxHp: 37, currentHp: 13, catchRate: 45, ballBonus: 1.5 })).toBe(
    Math.floor((Math.floor((45 * 15) / 10) * (111 - 26)) / 111),
  );
  for (let a = 1; a < 255; a++)
    expect(hgssShakeThreshold(a)).toBe(
      Math.floor(0xffff0 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(0xff0000 / a)))))),
    );
});
it("seeded saves survive serialization without re-rolling effects or wall-clock differences", () => {
  const first = start(member([85]), member([150], { speciesId: 143 }));
  const same = start(member([85]), member([150], { speciesId: 143 }));
  expect(first.session.snapshot).toBe(same.session.snapshot);
  const a = turn(first),
    b = turn(JSON.parse(JSON.stringify(same)) as Gen4Frame);
  expect(a.session.snapshot).toBe(b.session.snapshot);
  expect(a.steps).toEqual(b.steps);
});

it.each([
  [14, "공격", "올라갔다", 0],
  [106, "방어", "올라갔다", 0],
  [74, "특수공격", "올라갔다", 0],
  [133, "특수방어", "올라갔다", 0],
  [97, "스피드", "올라갔다", 0],
  [104, "회피율", "올라갔다", 0],
  [28, "명중률", "떨어졌다", 1],
  [39, "방어", "떨어졌다", 1],
] as const)("Korean stat message uses 이(가): move %i / %s", (moveId, stat, verb, side) => {
  const before = start(
    member([moveId], { name: "지그제구리" }),
    member([150], { speciesId: 4, name: "파이리", speed: 50 }),
  );
  const after = turn(before);
  const name = side === 0 ? "지그제구리" : "파이리";
  expect(after.steps.map(step => step.text)).toContain(`${name}의 ${stat}이(가) ${verb}!`);
  expect(hp(after, 0)).toBe(hp(before, 0));
  expect(hp(after, 1)).toBe(hp(before, 1));
});

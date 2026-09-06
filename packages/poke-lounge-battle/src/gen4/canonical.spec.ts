import { createInitialBattleState } from "../ruleset";
import { normalizeCompetitiveParty } from "../competitive-party";
import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
import { createSeededRandom } from "../prng";
import { getCompetitiveActionPlayerIds } from "../actions";
import { hashCanonicalState } from "../canonical-state";
import { resolveTurn, validateCompetitiveAction } from "../resolve-turn";
import { initializeGen4Canonical } from "./canonical";
import { advanceGen4Battle, readGen4Battle } from "./engine";
import { parseGen4ActionRequest, isGen4ActionLegal } from "./request";
import type { CanonicalCompetitiveAction } from "../actions";
import type { CanonicalBattleState } from "../canonical-state";

const ivs = { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 };
function initial(moveId: number, foeMoveId = 150): CanonicalBattleState {
  const party = (id: number) =>
    normalizeCompetitiveParty({
      version: 2,
      activeSlotIndex: 0,
      members: [0, 4].map(slotIndex => ({
        slotIndex,
        speciesId: slotIndex ? 143 : 151,
        level: 50,
        currentHp: 1,
        status: "normal",
        individualValues: ivs,
        moves: [
          {
            moveId: slotIndex ? 150 : id,
            pp: COMPETITIVE_MOVE_CATALOG[slotIndex ? 150 : id]!.maxPp,
          },
        ],
      })),
    });
  const state = createInitialBattleState([
    { playerId: "a", party: party(moveId) },
    { playerId: "b", party: party(foeMoveId) },
  ]);
  for (const p of Object.values(state.playersById)) for (const m of p.team) m.currentHp = m.maxHp;
  state.playersById.a.team[0].speed = 200;
  state.playersById.b.team[0].speed = 20;
  return initializeGen4Canonical(state, createSeededRandom("hgss-v3-canonical"));
}
function run(
  state: CanonicalBattleState,
  actionsByPlayerId: Record<string, CanonicalCompetitiveAction>,
) {
  return resolveTurn({
    state,
    actionsByPlayerId,
    random: createSeededRandom(`revision-${state.turn}`),
  });
}

it("server and the shared local executor produce the same party HP/PP, status, request and saved state", () => {
  const state = initial(71, 33);
  const actual = run(state, { a: { kind: "move", moveId: 71 }, b: { kind: "move", moveId: 33 } });
  const expected = advanceGen4Battle(state.gen4Session!, [
    { kind: "move", moveId: 71 },
    { kind: "move", moveId: 33 },
  ]);
  for (const [index, id] of ["a", "b"].entries()) {
    expect(actual.state.playersById[id].actionRequest).toEqual(expected.requests[index]);
    expect(
      actual.state.playersById[id].team.map(m => ({
        hp: m.currentHp,
        status: m.status,
        moves: m.moves,
      })),
    ).toEqual(
      expected.parties[index].members.map(m => ({
        hp: m.currentHp,
        status: m.status,
        moves: m.moves.map(x => ({ moveId: x.moveId, pp: x.pp })),
      })),
    );
  }
  expect(actual.state.gen4Session).toEqual(expected.session);
  expect(actual.stateHash).toBe(hashCanonicalState(actual.state));
});
it("forced continuation cannot be swapped for an arbitrary move or switch, and recharge spends no PP", () => {
  let state = initial(63);
  state = run(state, { a: { kind: "move", moveId: 63 }, b: { kind: "move", moveId: 150 } }).state;
  expect(state.playersById.a.actionRequest!.recharge).toBe(true);
  expect(() =>
    validateCompetitiveAction({ state, playerId: "a", action: { kind: "move", moveId: 63 } }),
  ).toThrow();
  expect(() =>
    validateCompetitiveAction({ state, playerId: "a", action: { kind: "switch", slotIndex: 4 } }),
  ).toThrow();
  expect(() =>
    validateCompetitiveAction({ state, playerId: "a", action: { kind: "continue" } }),
  ).not.toThrow();
  const pp = state.playersById.a.team[0].moves[0].pp,
    hp = state.playersById.b.team[0].currentHp;
  state = run(state, { a: { kind: "continue" }, b: { kind: "move", moveId: 150 } }).state;
  expect(state.playersById.a.team[0].moves[0].pp).toBe(pp);
  expect(state.playersById.b.team[0].currentHp).toBe(hp);
});
it("U-turn asks only its owner for a mid-turn switch, then resolves the stored enemy action once", () => {
  let state = initial(369, 33);
  const turn = state.gen4Turn;
  state = run(state, { a: { kind: "move", moveId: 369 }, b: { kind: "move", moveId: 33 } }).state;
  expect(state.gen4Turn).toBe(turn);
  expect(getCompetitiveActionPlayerIds(state)).toEqual(["a"]);
  expect(state.playersById.a.actionRequest!.kind).toBe("switch");
  expect(state.playersById.b.actionRequest!.kind).toBe("wait");
  expect(() =>
    run(state, { a: { kind: "switch", slotIndex: 4 }, b: { kind: "move", moveId: 33 } }),
  ).toThrow();
  const hp = state.playersById.a.team[1].currentHp;
  state = run(state, { a: { kind: "switch", slotIndex: 4 } }).state;
  expect(state.gen4Turn).toBe(turn! + 1);
  expect(state.playersById.a.activeSlotIndex).toBe(4);
  expect(state.playersById.a.team[1].currentHp).toBeLessThan(hp);
  expect(state.playersById.b.team[0].moves[0].pp).toBe(COMPETITIVE_MOVE_CATALOG[33]!.maxPp - 1);
});
it("reconnect/replay uses saved RNG and pending action queues rather than reseeding by wall time", () => {
  const state = initial(19, 33);
  const a = run(state, { a: { kind: "move", moveId: 19 }, b: { kind: "move", moveId: 33 } });
  const b = run(JSON.parse(JSON.stringify(state)) as CanonicalBattleState, {
    a: { kind: "move", moveId: 19 },
    b: { kind: "move", moveId: 33 },
  });
  expect(a.stateHash).toBe(b.stateHash);
  expect(a.state.gen4Session).toEqual(b.state.gen4Session);
  const resumed = run(JSON.parse(JSON.stringify(a.state)) as CanonicalBattleState, {
    a: { kind: "continue" },
    b: { kind: "move", moveId: 33 },
  });
  const expected = run(b.state, { a: { kind: "continue" }, b: { kind: "move", moveId: 33 } });
  expect(resumed.stateHash).toBe(expected.stateHash);
});
it("unrelated actors and malformed public requests never become legal actions", () => {
  const state = initial(33);
  expect(() => run(state, { intruder: { kind: "move", moveId: 33 } })).toThrow();
  const req = state.playersById.a.actionRequest!;
  expect(parseGen4ActionRequest(req)).toEqual(req);
  for (const value of [
    { ...req, snapshot: "seed" },
    { ...req, moves: Array(5).fill(req.moves[0]) },
    { ...req, switchSlots: [4, 4] },
    { ...req, forcedMoveId: 999 },
    { ...req, trapped: "no" },
  ])
    expect(() => parseGen4ActionRequest(value)).toThrow();
  expect(isGen4ActionLegal(req, { kind: "move", moveId: 63 })).toBe(false);
  expect(isGen4ActionLegal(req, { kind: "continue" })).toBe(false);
  expect(readGen4Battle(state.gen4Session!).requests[0]).toEqual(req);
});

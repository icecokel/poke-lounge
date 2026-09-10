import assert from "node:assert/strict";
import test from "node:test";
import { createOpponentPartySummary } from "@/features/poke-lounge/presentation/battle/opponent-party";
import { createDefaultBattleStatStages } from "@poke-lounge/battle/battle-stat-stages";
import type { CompetitiveProjection } from "../network/local-preview-room";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { toAuthoritativeBattleState } from "./authoritative-battle-adapter";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

function projection(): CompetitiveProjection {
  return {
    matchId: "test-match",
    bracketMatchId: "test-bracket",
    kind: "tournament-unranked",
    assignmentRevision: 1,
    rulesetVersion: 3,
    rulesetHash: "fixture",
    currentTurn: 2,
    turnEndsAtMs: 30000,
    status: "active",
    playerIds: ["left", "right"],
    stateHash: "fixture",
    submittedPlayerIds: [],
    terminal: null,
    currentState: {
      rulesetVersion: 3,
      turn: 2,
      participantIds: ["left", "right"],
      terminal: null,
      playersById: Object.fromEntries(
        ["left", "right"].map(playerId => [
          playerId,
          {
            playerId,
            activeSlotIndex: 1,
            team: Array.from({ length: playerId === "left" ? 2 : 4 }, (_, slotIndex) => ({
              slotIndex,
              speciesId: playerId === "left" ? 7 : 158,
              level: 10,
              maxHp: 40,
              currentHp: slotIndex === 0 ? 0 : 20,
              status: slotIndex === 0 ? ("fainted" as const) : ("normal" as const),
              statStages: createDefaultBattleStatStages(),
              moves: [{ moveId: 33, pp: 25 }],
            })),
          },
        ]),
      ),
    },
  };
}

function summary(p: CompetitiveProjection, viewPlayerId: string, displayedHp = 20) {
  const state = toAuthoritativeBattleState(p, viewPlayerId);
  return createOpponentPartySummary({
    battleKind: state.battleKind,
    opponent: state.opponent,
    visibleSlotIndex: state.opponent.activePartySlotIndex,
    displayedHp,
    displayedStatus: displayedHp > 0 ? "normal" : "fainted",
  })!;
}

test("서버 토너먼트·관전 방향에 맞는 상대 팀을 집계한다", () => {
  const p = projection();
  const leftView = summary(p, "left");
  assert.equal(leftView.total, 4);
  assert.equal(leftView.remaining, 3);
  assert.equal(leftView.slots[0].fainted, true);
  assert.equal(leftView.slots[1].active, true);
  const rightView = summary(p, "right");
  assert.equal(rightView.total, 2);
  assert.equal(rightView.remaining, 1);
});

test("서버 KO 확정·중복 수신·강제 교체 동안 HP 연출과 잔여 수가 일치한다", () => {
  const p = projection();
  const opponent = p.currentState.playersById.right;
  opponent.team[1].currentHp = 0;
  opponent.team[1].status = "fainted";
  // The server result is already final, but the visible HP animation is not.
  assert.equal(summary(p, "left", 20).remaining, 3);
  assert.equal(summary(p, "left", 1).remaining, 3);
  assert.equal(summary(p, "left", 0).remaining, 2);
  assert.equal(summary(structuredClone(p), "left", 0).remaining, 2);
  opponent.activeSlotIndex = 2;
  const switched = summary(p, "left", 20);
  assert.equal(switched.remaining, 2);
  assert.equal(switched.total, 4);
  assert.deepEqual(
    switched.slots.filter(s => s.active).map(s => s.slotIndex),
    [2],
  );
  assert.equal(switched.slots[1].fainted, true);
});

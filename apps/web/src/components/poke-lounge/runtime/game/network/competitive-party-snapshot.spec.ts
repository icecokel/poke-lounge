import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerSnapshot } from "./localPreviewRoom";
import { createCompetitivePartySnapshot } from "./competitive-party-snapshot";

function createPlayerSnapshot(): PlayerSnapshot {
  return {
    sessionId: "session-1",
    playerId: "player-1",
    displayName: "Player 1",
    map: "new-bark-town",
    x: 656,
    y: 446,
    facing: "front",
    activePartySlotIndex: 2,
    party: [
      {
        slotIndex: 0,
        pokemon: {
          speciesId: 7,
          name: "꼬부기",
          level: 11,
          maxHp: 34,
          currentHp: 19,
          attack: 18,
          defense: 22,
          speed: 17,
          status: "poisoned",
          individualValues: {
            hp: 31,
            attack: 30,
            defense: 29,
            specialAttack: 28,
            specialDefense: 27,
            speed: 26,
          },
          moves: [
            { id: 55, name: "물대포", pp: 7, maxPp: 25 },
            { id: 33, name: "몸통박치기", pp: 21, maxPp: 35 },
          ],
        },
      },
      {
        slotIndex: 2,
        pokemon: {
          speciesId: 158,
          name: "리아코",
          level: 13,
          currentHp: 1,
          status: "normal",
          individualValues: {
            hp: 25,
            attack: 24,
            defense: 23,
            specialAttack: 22,
            specialDefense: 21,
            speed: 20,
          },
          moves: [{ id: 10, name: "할퀴기", pp: 31, maxPp: 35 }],
        },
      },
    ],
  };
}

test("육성 파티를 서버가 신뢰하는 최소 V2 입력으로만 변환한다", () => {
  const result = createCompetitivePartySnapshot(createPlayerSnapshot());

  assert.deepEqual(result, {
    version: 2,
    activeSlotIndex: 2,
    members: [
      {
        slotIndex: 0,
        speciesId: 7,
        level: 11,
        currentHp: 19,
        status: "poisoned",
        individualValues: {
          hp: 31,
          attack: 30,
          defense: 29,
          specialAttack: 28,
          specialDefense: 27,
          speed: 26,
        },
        moves: [
          { moveId: 55, pp: 7 },
          { moveId: 33, pp: 21 },
        ],
      },
      {
        slotIndex: 2,
        speciesId: 158,
        level: 13,
        currentHp: 1,
        status: "normal",
        individualValues: {
          hp: 25,
          attack: 24,
          defense: 23,
          specialAttack: 22,
          specialDefense: 21,
          speed: 20,
        },
        moves: [{ moveId: 10, pp: 31 }],
      },
    ],
  });
  assert.equal("name" in result.members[0], false);
  assert.equal("maxHp" in result.members[0], false);
  assert.equal("maxPp" in result.members[0].moves[0], false);
});

test("전투 저장값이 빠진 파티는 조용히 대체하지 않고 거절한다", () => {
  const snapshot = createPlayerSnapshot();
  const member = snapshot.party?.[0]?.pokemon;
  assert.ok(member);
  member.individualValues = undefined;

  assert.throws(() => createCompetitivePartySnapshot(snapshot), /missing persisted battle state/);
});

test("선두 슬롯이 없는 접속 스냅샷은 거절한다", () => {
  const snapshot = createPlayerSnapshot();
  snapshot.activePartySlotIndex = undefined;

  assert.throws(() => createCompetitivePartySnapshot(snapshot), /requires an active party slot/);
});

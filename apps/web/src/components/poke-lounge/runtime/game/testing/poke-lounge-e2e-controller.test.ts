import assert from "node:assert/strict";
import test from "node:test";
import { readPokeLoungeBattleLaunchSnapshot } from "./poke-lounge-e2e-controller";

test("서버 권위 전투 시작만 renderer-neutral launch snapshot으로 기록한다", () => {
  assert.equal(readPokeLoungeBattleLaunchSnapshot({ battleKind: "wild", projection: {} }), null);
  assert.deepEqual(
    readPokeLoungeBattleLaunchSnapshot({
      battleKind: "authoritative",
      projection: {
        matchId: "match-1",
        bracketMatchId: "bracket-1",
        assignmentRevision: 7,
      },
    }),
    {
      matchId: "match-1",
      bracketMatchId: "bracket-1",
      assignmentRevision: 7,
    },
  );
});

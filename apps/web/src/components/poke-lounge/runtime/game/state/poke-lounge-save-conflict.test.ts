import assert from "node:assert/strict";
import test from "node:test";
import { createGameStateStore } from "./gameStateStore";
import { hasSamePokeLoungeLocalProgress } from "./poke-lounge-save-conflict";
import { buildPokeLoungeSaveSnapshot } from "./poke-lounge-save-snapshot";

test("jsonb가 record key 순서를 바꿔도 같은 로컬 진행으로 판정한다", () => {
  const snapshot = buildPokeLoungeSaveSnapshot(createGameStateStore());
  const reordered = reverseRecordKeys(snapshot);

  assert.equal(hasSamePokeLoungeLocalProgress(snapshot, reordered), true);
});

test("실제 로컬 진행 값이 다르면 저장 충돌로 판정한다", () => {
  const snapshot = buildPokeLoungeSaveSnapshot(createGameStateStore());
  const changed = structuredClone(snapshot);
  changed.state.playersById[changed.state.currentPlayerId].wallet.pokeDollars += 1;

  assert.equal(hasSamePokeLoungeLocalProgress(snapshot, changed), false);
});

function reverseRecordKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(reverseRecordKeys) as T;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reverseRecordKeys(entry)]),
  ) as T;
}

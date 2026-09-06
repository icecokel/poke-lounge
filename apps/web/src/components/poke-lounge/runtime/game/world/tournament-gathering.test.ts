import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getTournamentGatherPosition,
  isTournamentGatheringDue,
} from "@poke-lounge/battle/tournament-gathering";
import { createWorldMapModel } from "./world-map-model";
import { moveWorldPlayer } from "./world-runtime-motion";

test("대진표가 열리는 5초 전부터 집결하고 다음 탐험 라운드에는 해제한다", () => {
  const round = { phase: "round-started", endsAtMs: 20_000 };
  assert.equal(isTournamentGatheringDue("round-started", round, 14_999), false);
  assert.equal(isTournamentGatheringDue("round-started", round, 15_000), true);
  assert.equal(isTournamentGatheringDue("tournament", round, 15_000), true);
  assert.equal(isTournamentGatheringDue("round-result", round, 21_000), false);
  assert.equal(
    isTournamentGatheringDue("round-started", { ...round, endsAtMs: 320_000 }, 21_000),
    false,
  );
});

test("집결 슬롯은 사람·AI 모두 순서에 무관하게 동일하고 NPC와 충돌하지 않는다", () => {
  const map = createWorldMapModel(
    JSON.parse(
      readFileSync(
        new URL("../../../../../../public/maps/pokemmo-reference/town.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const ids = ["user-a", "ai-b", "user-c", "ai-d", "user-e", "ai-f", "user-g", "ai-h"];
  const slots = ids.map(id => getTournamentGatherPosition(id, ids));
  assert.equal(new Set(slots.map(p => `${p.x},${p.y}`)).size, 8);
  for (const [index, position] of slots.entries()) {
    assert.deepEqual(getTournamentGatherPosition(ids[index], [...ids].reverse()), position);
    assert.equal(
      map.collisionCoordinates.has(`${Math.floor(position.x / 32)},${Math.floor(position.y / 32)}`),
      false,
    );
    for (const npc of map.npcs) assert.ok(Math.hypot(position.x - npc.x, position.y - npc.y) >= 32);
  }
  const nurse = map.npcs.find(n => n.name === "nurse")!;
  const pc = map.npcs.find(n => n.name === "storagePc")!;
  assert.equal(pc.x - nurse.x, 2 * 32);
  assert.equal(pc.y, nurse.y);
  assert.deepEqual({ x: pc.x, y: pc.y }, { x: 704, y: 256 });
  assert.equal(map.collisionCoordinates.has("11,12"), false);
  assert.equal(map.collisionCoordinates.has("18,3"), false);
  // The boundary/side decorations and their collision are intentionally retained.
  assert.equal(map.collisionCoordinates.has("2,3"), true);
  assert.ok(moveWorldPlayer({ x: 704, y: 304 }, { x: 0, y: -104 }, 1000, map).y >= 266);
});

test("로컬 대회도 준비 종료에 집결하며 일반 싱글 플레이는 영향을 받지 않는다", async () => {
  const { createGameStateStore } = await import("../state/game-state-store");
  const { getTournamentGatheringContext } = await import("./tournament-gathering");
  const state = createGameStateStore().getState();
  assert.equal(getTournamentGatheringContext(state, 5000), null);
  const preparing = {
    ...state,
    round: {
      ...state.round,
      roundIndex: 1,
      phase: "preparation" as const,
      preparationEndsAtMs: 10000,
    },
  };
  assert.equal(getTournamentGatheringContext(preparing, 9999), null);
  assert.equal(getTournamentGatheringContext(preparing, 10000)?.key, "local:1");
  assert.equal(
    getTournamentGatheringContext(
      { ...preparing, round: { ...preparing.round, phase: "round-result" } },
      11000,
    ),
    null,
  );
});

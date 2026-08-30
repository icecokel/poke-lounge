import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerPosition } from "../player/playerTypes";
import { resolvePersistedWorldSpawn, shouldPersistSoloWorldPosition } from "./world-scene-spawn";

const mapBounds = { width: 1_280, height: 1_600 };

test("저장된 월드 위치와 방향이 현재 맵 범위 안이면 복원한다", () => {
  assert.deepEqual(
    resolvePersistedWorldSpawn(
      {
        mapKey: "town",
        x: 720,
        y: 980,
        facing: "left",
      },
      "town",
      mapBounds,
    ),
    {
      facing: "left",
      x: 720,
      y: 980,
    },
  );
});

test("다른 맵이나 범위 밖 위치와 잘못된 방향은 기본 스폰을 사용하도록 거부한다", () => {
  const invalidPositions: PlayerPosition[] = [
    { mapKey: "another-map", x: 720, y: 980, facing: "front" },
    { mapKey: "town", x: -1, y: 980, facing: "front" },
    { mapKey: "town", x: mapBounds.width, y: 980, facing: "front" },
    { mapKey: "town", x: 720, y: mapBounds.height, facing: "front" },
    { mapKey: "town", x: 720.5, y: 980, facing: "front" },
    { mapKey: "town", x: 720, y: 980, facing: "diagonal" as PlayerPosition["facing"] },
  ];

  for (const position of invalidPositions) {
    assert.equal(resolvePersistedWorldSpawn(position, "town", mapBounds), null);
  }
});

test("월드 위치는 싱글 진행에서만 저장해 경쟁 모드 이동과 분리한다", () => {
  assert.equal(shouldPersistSoloWorldPosition(false), true);
  assert.equal(shouldPersistSoloWorldPosition(true), false);
});

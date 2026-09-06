import assert from "node:assert/strict";
import test from "node:test";
import { moveBattleBagSelection as move, BATTLE_BAG_PAGE_SIZE } from "./battle-bag-selection";

test("웹 가방은 2열 배치와 같은 방향으로 이동하며 다음 페이지로 넘어간다", () => {
  assert.equal(BATTLE_BAG_PAGE_SIZE, 4);
  assert.equal(move(0, "right", 7, 2), 1);
  assert.equal(move(1, "right", 7, 2), 1);
  assert.equal(move(1, "down", 7, 2), 3);
  assert.equal(move(3, "left", 7, 2), 2);
  assert.equal(move(2, "up", 7, 2), 0);
  assert.equal(move(2, "down", 7, 2), 4);
  assert.equal(move(5, "down", 7, 2), 6);
  assert.equal(move(6, "right", 7, 2), 6);
});
test("모바일 1열은 상하 한 칸씩 이동하며 좌우 입력은 선택을 바꾸지 않는다", () => {
  assert.equal(move(1, "down", 7, 1), 2);
  assert.equal(move(1, "up", 7, 1), 0);
  assert.equal(move(1, "right", 7, 1), 1);
  assert.equal(move(1, "left", 7, 1), 1);
});
test("빈 가방·소진된 목록·끝 행에서도 범위 밖 인덱스를 생성하지 않는다", () => {
  for (const dir of ["up", "down", "left", "right"] as const) {
    assert.equal(move(0, dir, 0, 2), 0);
    assert.equal(move(4, dir, 1, 2), 0);
  }
});

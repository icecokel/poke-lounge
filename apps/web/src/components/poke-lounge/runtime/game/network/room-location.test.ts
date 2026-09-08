import assert from "node:assert/strict";
import test from "node:test";
import { createJoinedRoomLocation } from "./room-location";
import { readRoomEntryFromLocation } from "./room-entry";

test("비공개 방 생성 완료는 코드를 노출하지 않고 저장된 방 복원이 가능한 URL로 바꾼다", () => {
  const current = new URL(
    "https://example.test/ko-KR/game/poke-lounge?network=server&create=1&roundMs=180000#game",
  );
  const original = current.href;
  const next = createJoinedRoomLocation(current, "ROOM01", false);
  assert.deepEqual(readRoomEntryFromLocation(next), { mode: "unset", roomCode: null });
  assert.equal(next.searchParams.get("roundMs"), "180000");
  assert.equal(next.hash, "#game");
  assert.equal(next.searchParams.has("create"), false);
  assert.equal(next.searchParams.has("quick"), false);
  assert.equal(next.href.includes("ROOM01"), false);
  assert.equal(current.href, original);
});

test("일반 생성과 빠른 참가도 생성 의도를 제거하고 올바른 방 주소를 사용한다", () => {
  for (const flag of ["create", "quick"]) {
    const next = createJoinedRoomLocation(
      new URL(`https://example.test/en-US/game/poke-lounge?network=server&${flag}=1&source=test`),
      "ROOM02",
    );
    assert.deepEqual(readRoomEntryFromLocation(next), { mode: "server-room", roomCode: "ROOM02" });
    assert.equal(next.searchParams.has(flag), false);
    assert.equal(next.searchParams.get("source"), "test");
    assert.equal(next.pathname, "/en-US/game/poke-lounge");
  }
});

test("비공개 완료 URL은 기존 방 코드와 quick 플래그도 지우고 반복해도 변하지 않는다", () => {
  const input = new URL(
    "https://example.test/ja-JP/game/poke-lounge?network=server&quick=1&create=1&room=OLD001",
  );
  const next = createJoinedRoomLocation(input, "ROOM03", false);
  assert.equal(next.search, "?network=server");
  assert.equal(createJoinedRoomLocation(next, "ROOM03", false).href, next.href);
});

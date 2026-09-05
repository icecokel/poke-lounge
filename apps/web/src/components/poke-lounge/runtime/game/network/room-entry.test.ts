import assert from "node:assert/strict";
import test from "node:test";
import { getPokeLoungeCopy } from "../../../poke-lounge-copy";
import {
  createRoomShareUrl,
  createTemporaryPassword,
  deriveTemporaryRoomCode,
  normalizeTemporaryPassword,
  readRoomEntryFromSearchParams,
  readRoomRoundDurationMs,
} from "./room-entry";
import {
  createRandomMultiplayerDisplayName,
  normalizeMultiplayerDisplayName,
  resolveInitialMultiplayerDisplayName,
  shouldResetRoomEntrySession,
} from "./room-entry-screen";

test("명시적으로 선택한 솔로 새 게임만 저장 세션을 초기화한다", function testCase() {
  assert.equal(
    shouldResetRoomEntrySession({
      mode: "solo",
      roomCode: null,
      inviteUrl: null,
      resetSession: true,
    }),
    true,
  );
  assert.equal(
    shouldResetRoomEntrySession({
      mode: "solo",
      roomCode: null,
      inviteUrl: null,
    }),
    false,
  );
});

test("방 생성 선택에 초기화 플래그가 있어도 저장 세션을 유지한다", function testCase() {
  for (const mode of ["local-room", "server-room", "webrtc"] as const) {
    assert.equal(
      shouldResetRoomEntrySession({
        mode,
        roomCode: "ABC123",
        inviteUrl: "https://example.com/room/ABC123",
        createRoom: true,
        resetSession: true,
      }),
      false,
    );
  }
});

test("서버 방 URL은 선택 화면 없이 생성과 코드 입장을 유지한다", function testCase() {
  assert.deepEqual(readRoomEntryFromSearchParams(new URLSearchParams("network=server&quick=1")), {
    mode: "server-room",
    roomCode: null,
    quickPlay: true,
  });
  assert.deepEqual(readRoomEntryFromSearchParams(new URLSearchParams("network=server&create=1")), {
    mode: "server-room",
    roomCode: null,
    createRoom: true,
  });
  assert.deepEqual(
    readRoomEntryFromSearchParams(new URLSearchParams("network=server&room=ABC123")),
    {
      mode: "server-room",
      roomCode: "ABC123",
    },
  );
  for (const duration of [90_000, 180_000, 300_000]) {
    assert.equal(readRoomRoundDurationMs(new URLSearchParams(`roundMs=${duration}`)), duration);
  }
  assert.equal(readRoomRoundDurationMs(new URLSearchParams("roundMs=600000")), null);
  assert.equal(readRoomRoundDurationMs(new URLSearchParams("roundMs=123")), null);
});

test("멀티플레이 닉네임은 공백을 제거하고 최대 12자로 정리한다", function testCase() {
  assert.equal(normalizeMultiplayerDisplayName("  레드  "), "레드");
  assert.equal(normalizeMultiplayerDisplayName("abcdefghijklmn"), "abcdefghijkl");
});

test("기본 멀티플레이 닉네임은 로케일별 5×5 조합 중 하나를 사용한다", function testCase() {
  for (const locale of ["ko-KR", "en-US", "ja-JP"] as const) {
    const { multiplayerNameModifiers, multiplayerNameNouns } = getPokeLoungeCopy(locale).roomEntry;
    const names = Array.from({ length: 25 }, function callback(_, index) {
      return createRandomMultiplayerDisplayName(
        multiplayerNameModifiers,
        multiplayerNameNouns,
        function callback() {
          return (index + 0.5) / 25;
        },
      );
    });

    assert.equal(new Set(names).size, 25);
    assert.ok(
      names.every(function testItem(name) {
        return Array.from(name).length <= 12;
      }),
    );
    assert.equal(
      resolveInitialMultiplayerDisplayName(
        "Player 1",
        multiplayerNameModifiers,
        multiplayerNameNouns,
        function callback() {
          return 0;
        },
      ),
      names[0],
    );
    assert.equal(
      resolveInitialMultiplayerDisplayName(
        "레드",
        multiplayerNameModifiers,
        multiplayerNameNouns,
        function callback() {
          return 0;
        },
      ),
      "레드",
    );
  }
});

test("임시 비밀번호는 원문 대신 동일한 6자리 방 키로 파생한다", async function testCase() {
  assert.equal(normalizeTemporaryPassword(" １２３ａｂｃ "), "123ABC");

  const normalizedCode = await deriveTemporaryRoomCode(" １２３ａｂｃ ");
  const sameCode = await deriveTemporaryRoomCode("123ABC");
  const differentCode = await deriveTemporaryRoomCode("123ABD");

  assert.match(normalizedCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizedCode, sameCode);
  assert.notEqual(normalizedCode, differentCode);
  await assert.rejects(function callback() {
    return deriveTemporaryRoomCode("ABC12");
  });
});

test("랜덤 임시 비밀번호는 혼동하기 어려운 영문·숫자 6자리로 생성한다", function testCase() {
  assert.match(createTemporaryPassword(), /^[A-HJ-NP-Z2-9]{6}$/);
});

test("공유 링크는 생성된 방 코드를 담고 생성·테스트·사용자 식별값을 제거한다", function testCase() {
  const shareUrl = createRoomShareUrl(
    new URL(
      "https://example.test/ko-KR/game/poke-lounge?network=server&create=1&e2e=1&scene=world&serverPlayerId=p1&serverSessionId=s1",
    ),
    "ROOM01",
  );

  assert.ok(shareUrl);
  const parsedUrl = new URL(shareUrl);
  assert.equal(parsedUrl.searchParams.get("network"), "server");
  assert.equal(parsedUrl.searchParams.get("room"), "ROOM01");
  assert.equal(parsedUrl.searchParams.has("create"), false);
  assert.equal(parsedUrl.searchParams.has("e2e"), false);
  assert.equal(parsedUrl.searchParams.has("scene"), false);
  assert.equal(parsedUrl.searchParams.has("serverPlayerId"), false);
  assert.equal(parsedUrl.searchParams.has("serverSessionId"), false);
});

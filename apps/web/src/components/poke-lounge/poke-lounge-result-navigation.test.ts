import assert from "node:assert/strict";
import test from "node:test";
import {
  createPokeLoungeRoomEntryUrl,
  isPokeLoungeMultiplayerResultUrl,
} from "./poke-lounge-result-navigation";

test("로컬·서버·WebRTC 결과는 새 방 선택 흐름으로 분류한다", () => {
  for (const network of ["local", "server", "webrtc"]) {
    assert.equal(
      isPokeLoungeMultiplayerResultUrl(
        new URL(`https://example.test/ko-KR/game/poke-lounge?network=${network}`),
      ),
      true,
    );
  }

  assert.equal(
    isPokeLoungeMultiplayerResultUrl(new URL("https://example.test/ko-KR/game/poke-lounge?e2e=1")),
    false,
  );
  assert.equal(
    isPokeLoungeMultiplayerResultUrl(
      new URL("https://example.test/ko-KR/game/poke-lounge?room=ABC123"),
    ),
    true,
  );
});

test("방 입장 URL은 멀티플레이 신원만 지우고 테스트와 설정 파라미터는 보존한다", () => {
  const roomEntryUrl = createPokeLoungeRoomEntryUrl(
    new URL(
      "https://example.test/en-US/game/poke-lounge?network=server&room=ABC123&create=1&serverPlayerId=p1&serverSessionId=s1&e2e=1&roundMs=300000",
    ),
  );

  assert.equal(roomEntryUrl.pathname, "/en-US/game/poke-lounge");
  assert.equal(roomEntryUrl.searchParams.has("network"), false);
  assert.equal(roomEntryUrl.searchParams.has("room"), false);
  assert.equal(roomEntryUrl.searchParams.has("create"), false);
  assert.equal(roomEntryUrl.searchParams.has("serverPlayerId"), false);
  assert.equal(roomEntryUrl.searchParams.has("serverSessionId"), false);
  assert.equal(roomEntryUrl.searchParams.get("e2e"), "1");
  assert.equal(roomEntryUrl.searchParams.get("roundMs"), "300000");
});

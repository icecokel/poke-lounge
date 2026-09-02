import assert from "node:assert/strict";
import test from "node:test";
import type { PokeLoungeLocale } from "../../poke-lounge-copy";
import type { PokeLoungeServerRoomErrorDetail } from "./network/server-room";
import { getServerRoomErrorMessage } from "./server-room-error-copy";

const LOCALES = ["ko-KR", "en-US", "ja-JP"] as const satisfies readonly PokeLoungeLocale[];
const ERROR_CODES = [
  "ROOM_CREATE_FAILED",
  "ROOM_JOIN_FAILED",
  "ROOM_PARTY_SYNC_FAILED",
  "ROOM_READY_FAILED",
  "ROOM_TRANSPORT_FAILED",
  "ROOM_FULL",
  "CURSOR_REGRESSION",
] as const satisfies readonly PokeLoungeServerRoomErrorDetail["code"][];

test("server room 오류 코드는 모든 지원 locale에서 안정적인 안내문으로 변환된다", function testCase() {
  for (const code of ERROR_CODES) {
    const messages = LOCALES.map(function mapItem(locale) {
      return getServerRoomErrorMessage(locale, code);
    });

    assert.equal(
      messages.every(function testItem(message) {
        return message.length > 0;
      }),
      true,
    );
    assert.equal(new Set(messages).size, LOCALES.length);
  }

  assert.match(getServerRoomErrorMessage("en-US", "ROOM_TRANSPORT_FAILED"), /server room/i);
  assert.match(getServerRoomErrorMessage("ko-KR", "ROOM_FULL"), /8명/);
  assert.match(getServerRoomErrorMessage("ja-JP", "CURSOR_REGRESSION"), /入室画面/);
});

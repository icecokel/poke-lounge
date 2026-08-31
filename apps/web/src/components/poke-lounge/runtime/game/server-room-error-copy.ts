import type { PokeLoungeLocale } from "../../poke-lounge-copy";
import type { PokeLoungeServerRoomErrorDetail } from "./network/server-room";

type ServerRoomErrorCode = PokeLoungeServerRoomErrorDetail["code"];

const SERVER_ROOM_ERROR_MESSAGES = {
  "ko-KR": {
    ROOM_CREATE_FAILED: "서버 방을 만들지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_JOIN_FAILED:
      "서버 방에 참가하지 못했습니다. 방 코드와 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_PARTY_SYNC_FAILED: "파티 정보를 서버와 동기화하지 못했습니다. 다시 시도해 주세요.",
    ROOM_READY_FAILED: "준비 상태를 서버에 반영하지 못했습니다. 다시 시도해 주세요.",
    ROOM_TRANSPORT_FAILED: "서버 방 연결에 문제가 생겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_FULL: "방에 6명이 접속 중입니다. 한 명이 나간 뒤 다시 시도해 주세요.",
    CURSOR_REGRESSION: "방 연결 정보가 만료되었습니다. 입장 화면에서 다시 참가해 주세요.",
  },
  "en-US": {
    ROOM_CREATE_FAILED: "Couldn't create the server room. Check your connection and try again.",
    ROOM_JOIN_FAILED:
      "Couldn't join the server room. Check the room code and your connection, then try again.",
    ROOM_PARTY_SYNC_FAILED: "Couldn't sync your party with the server. Try again.",
    ROOM_READY_FAILED: "Couldn't update your ready status on the server. Try again.",
    ROOM_TRANSPORT_FAILED:
      "There was a problem connecting to the server room. Check your connection and try again.",
    ROOM_FULL: "This room already has 6 players. Try again after someone leaves.",
    CURSOR_REGRESSION:
      "Your room connection has expired. Join the room again from the entry screen.",
  },
  "ja-JP": {
    ROOM_CREATE_FAILED:
      "サーバールームを作成できませんでした。接続を確認して、もう一度お試しください。",
    ROOM_JOIN_FAILED:
      "サーバールームに参加できませんでした。ルームコードと接続を確認して、もう一度お試しください。",
    ROOM_PARTY_SYNC_FAILED:
      "パーティー情報をサーバーと同期できませんでした。もう一度お試しください。",
    ROOM_READY_FAILED: "準備状態をサーバーに反映できませんでした。もう一度お試しください。",
    ROOM_TRANSPORT_FAILED:
      "サーバールームとの接続に問題が発生しました。接続を確認して、もう一度お試しください。",
    ROOM_FULL: "このルームには6人が接続中です。誰かが退出してから、もう一度お試しください。",
    CURSOR_REGRESSION:
      "ルームの接続情報の有効期限が切れました。入室画面からもう一度参加してください。",
  },
} satisfies Record<PokeLoungeLocale, Record<ServerRoomErrorCode, string>>;

export function getServerRoomErrorMessage(
  locale: PokeLoungeLocale,
  code: ServerRoomErrorCode,
): string {
  return SERVER_ROOM_ERROR_MESSAGES[locale][code];
}

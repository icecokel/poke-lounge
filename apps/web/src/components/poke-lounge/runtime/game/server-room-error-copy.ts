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
    ROOM_TRANSPORT_FAILED: "서버의 최신 상태를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.",
    ROOM_FULL: "방에 8명이 접속 중입니다. 한 명이 나간 뒤 다시 시도해 주세요.",
    ROOM_EXPIRED: "방이 만료되어 입장 화면으로 돌아왔습니다. 새 방을 만들어 주세요.",
    CURSOR_REGRESSION: "방 연결 정보가 만료되었습니다. 입장 화면에서 다시 참가해 주세요.",
  },
  "en-US": {
    ROOM_CREATE_FAILED: "Couldn't create the server room. Check your connection and try again.",
    ROOM_JOIN_FAILED:
      "Couldn't join the server room. Check the room code and your connection, then try again.",
    ROOM_PARTY_SYNC_FAILED: "Couldn't sync your party with the server. Try again.",
    ROOM_READY_FAILED: "Couldn't update your ready status on the server. Try again.",
    ROOM_TRANSPORT_FAILED:
      "Couldn't retrieve the latest room state. Check your network connection.",
    ROOM_FULL: "This room already has 8 players. Try again after someone leaves.",
    ROOM_EXPIRED: "This room has expired. You are back at the entry screen. Create a new room.",
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
      "ルームの最新状態を確認できませんでした。ネットワーク接続を確認してください。",
    ROOM_FULL: "このルームには8人が接続中です。誰かが退出してから、もう一度お試しください。",
    ROOM_EXPIRED:
      "ルームの有効期限が切れたため、入室画面に戻りました。新しいルームを作成してください。",
    CURSOR_REGRESSION:
      "ルームの接続情報の有効期限が切れました。入室画面からもう一度参加してください。",
  },
} satisfies Record<PokeLoungeLocale, Record<ServerRoomErrorCode, string>>;

const SERVER_ROOM_ERROR_TITLES = {
  "ko-KR": {
    ROOM_CREATE_FAILED: "방을 만들지 못했습니다",
    ROOM_JOIN_FAILED: "방에 참가하지 못했습니다",
    ROOM_PARTY_SYNC_FAILED: "파티 정보를 동기화하지 못했습니다",
    ROOM_READY_FAILED: "준비 상태를 반영하지 못했습니다",
    ROOM_TRANSPORT_FAILED: "서버 상태를 동기화하지 못했습니다",
    ROOM_FULL: "방에 빈자리가 없습니다",
    ROOM_EXPIRED: "방이 만료되었습니다",
    CURSOR_REGRESSION: "방 참가 정보를 확인할 수 없습니다",
    DISCONNECTED: "연결이 끊겼습니다",
  },
  "en-US": {
    ROOM_CREATE_FAILED: "Couldn't create the room",
    ROOM_JOIN_FAILED: "Couldn't join the room",
    ROOM_PARTY_SYNC_FAILED: "Couldn't sync your party",
    ROOM_READY_FAILED: "Couldn't update your readiness",
    ROOM_TRANSPORT_FAILED: "Couldn't sync the room state",
    ROOM_FULL: "The room is full",
    ROOM_EXPIRED: "The room has expired",
    CURSOR_REGRESSION: "Your room participation is no longer valid",
    DISCONNECTED: "Connection lost",
  },
  "ja-JP": {
    ROOM_CREATE_FAILED: "ルームを作成できませんでした",
    ROOM_JOIN_FAILED: "ルームに参加できませんでした",
    ROOM_PARTY_SYNC_FAILED: "パーティーを同期できませんでした",
    ROOM_READY_FAILED: "準備状態を更新できませんでした",
    ROOM_TRANSPORT_FAILED: "ルームの状態を同期できませんでした",
    ROOM_FULL: "ルームが満員です",
    ROOM_EXPIRED: "ルームの有効期限が切れました",
    CURSOR_REGRESSION: "ルームへの参加情報が無効です",
    DISCONNECTED: "接続が切れました",
  },
} satisfies Record<PokeLoungeLocale, Record<ServerRoomErrorCode | "DISCONNECTED", string>>;

export function getServerRoomErrorTitle(
  locale: PokeLoungeLocale,
  code: ServerRoomErrorCode,
  disconnected = false,
): string {
  return SERVER_ROOM_ERROR_TITLES[locale][
    code === "ROOM_TRANSPORT_FAILED" && disconnected ? "DISCONNECTED" : code
  ];
}

export function getServerRoomErrorMessage(
  locale: PokeLoungeLocale,
  code: ServerRoomErrorCode,
): string {
  return SERVER_ROOM_ERROR_MESSAGES[locale][code];
}

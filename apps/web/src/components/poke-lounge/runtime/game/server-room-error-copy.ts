import type { PokeLoungeLocale } from "../../poke-lounge-copy";
import type { PokeLoungeServerRoomErrorDetail } from "./network/server-room";

type ServerRoomErrorCode = PokeLoungeServerRoomErrorDetail["code"];

const SERVER_ROOM_ERROR_MESSAGES = {
  "ko-KR": {
    ROOM_ALREADY_STARTED:
      "이미 게임이 시작된 방에는 새로 참가할 수 없습니다. 대기 중인 다른 방을 선택해 주세요.",
    ROOM_NOT_FOUND:
      "입력한 방이 없거나 이미 정리되었습니다. 방 코드를 확인하거나 새 방을 선택해 주세요.",
    ROOM_SESSION_INVALID:
      "참가 세션을 확인할 수 없습니다. 입장 화면으로 돌아가 다시 참가해 주세요.",
    ROOM_ACCESS_DENIED:
      "이 방에 접근할 권한을 확인할 수 없습니다. 초대 정보와 참가 신원을 확인해 주세요.",
    ROOM_IDENTITY_MISMATCH:
      "저장된 참가 신원이 이 방의 참가 정보와 일치하지 않습니다. 처음 참가한 브라우저에서 다시 접속해 주세요.",
    ROOM_REJOIN_BLOCKED:
      "접속이 종료된 참가자는 이미 시작된 방에 다시 참가할 수 없습니다. 대기 중인 다른 방을 선택해 주세요.",
    ROOM_REQUEST_INVALID:
      "서버가 참가 요청 형식을 거절했습니다. 페이지를 새로고침한 뒤 다시 참가해 주세요.",
    ROOM_REQUEST_CONFLICT:
      "방 상태나 이전 참가 요청과 충돌했습니다. 최신 상태를 확인한 뒤 다시 참가해 주세요.",
    ROOM_SERVER_BUSY: "서버가 참가 요청을 처리할 여유가 없습니다. 잠시 후 다시 시도해 주세요.",
    ROOM_SERVER_UNAVAILABLE:
      "서버에서 참가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    ROOM_REQUEST_TIMEOUT:
      "제한 시간 안에 서버 응답을 받지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_NETWORK_FAILED:
      "참가 요청을 보내거나 응답을 받는 중 연결에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
    ROOM_RESPONSE_INVALID:
      "서버 응답이 예상한 형식과 다릅니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
    ROOM_CREATE_FAILED: "서버 방을 만들지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_CODE_IN_USE: "이미 사용 중인 방 코드입니다. 다른 코드를 입력해 주세요.",
    ROOM_JOIN_FAILED:
      "서버 방에 참가하지 못했습니다. 방 코드와 연결을 확인한 뒤 다시 시도해 주세요.",
    ROOM_PARTY_SYNC_FAILED: "파티 정보를 서버와 동기화하지 못했습니다. 다시 시도해 주세요.",
    ROOM_READY_FAILED: "준비 상태를 서버에 반영하지 못했습니다. 다시 시도해 주세요.",
    ROOM_TRANSPORT_FAILED: "서버의 최신 상태를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.",
    ROOM_FULL: "방에 8명이 접속 중입니다. 한 명이 나간 뒤 다시 시도해 주세요.",
    ROOM_EXPIRED: "방이 종료되었거나 만료되어 더 이상 참가할 수 없습니다. 새 방을 선택해 주세요.",
    CURSOR_REGRESSION: "방 연결 정보가 만료되었습니다. 입장 화면에서 다시 참가해 주세요.",
  },
  "en-US": {
    ROOM_ALREADY_STARTED:
      "New players cannot join after the game starts. Choose another room that is waiting.",
    ROOM_NOT_FOUND:
      "This room does not exist or has been removed. Check the room code or choose another room.",
    ROOM_SESSION_INVALID:
      "Your participant session could not be verified. Return to the entry screen and join again.",
    ROOM_ACCESS_DENIED:
      "Your access to this room could not be verified. Check your invitation and participant identity.",
    ROOM_IDENTITY_MISMATCH:
      "Your saved identity does not match this room. Reconnect using the browser you originally joined with.",
    ROOM_REJOIN_BLOCKED:
      "A disconnected participant cannot rejoin a game that has already started. Choose another room that is waiting.",
    ROOM_REQUEST_INVALID:
      "The server rejected the join request. Reload the page and try joining again.",
    ROOM_REQUEST_CONFLICT:
      "The request conflicted with the room state or a previous request. Check the latest state and join again.",
    ROOM_SERVER_BUSY: "The server cannot handle the join request right now. Try again shortly.",
    ROOM_SERVER_UNAVAILABLE: "The server could not process the join request. Try again shortly.",
    ROOM_REQUEST_TIMEOUT:
      "The server did not respond within the time limit. Check your connection and try again.",
    ROOM_NETWORK_FAILED:
      "The connection failed while sending the join request or receiving its response. Check your network and try again.",
    ROOM_RESPONSE_INVALID:
      "The server response did not match the expected format. Reload the page and try again.",
    ROOM_CREATE_FAILED: "Couldn't create the server room. Check your connection and try again.",
    ROOM_CODE_IN_USE: "This room code is already in use. Enter a different code.",
    ROOM_JOIN_FAILED:
      "Couldn't join the server room. Check the room code and your connection, then try again.",
    ROOM_PARTY_SYNC_FAILED: "Couldn't sync your party with the server. Try again.",
    ROOM_READY_FAILED: "Couldn't update your ready status on the server. Try again.",
    ROOM_TRANSPORT_FAILED:
      "Couldn't retrieve the latest room state. Check your network connection.",
    ROOM_FULL: "This room already has 8 players. Try again after someone leaves.",
    ROOM_EXPIRED: "This room has ended or expired. Choose another room to join.",
    CURSOR_REGRESSION:
      "Your room connection has expired. Join the room again from the entry screen.",
  },
  "ja-JP": {
    ROOM_ALREADY_STARTED:
      "ゲーム開始後は新しく参加できません。待機中の別のルームを選んでください。",
    ROOM_NOT_FOUND:
      "ルームが存在しないか削除されました。コードを確認するか、別のルームを選んでください。",
    ROOM_SESSION_INVALID:
      "参加セッションを確認できません。入室画面に戻って、もう一度参加してください。",
    ROOM_ACCESS_DENIED:
      "ルームへのアクセス権限を確認できません。招待情報と参加者情報を確認してください。",
    ROOM_IDENTITY_MISMATCH:
      "保存された参加者情報がルームの情報と一致しません。最初に参加したブラウザーで再接続してください。",
    ROOM_REJOIN_BLOCKED:
      "接続が終了した参加者はゲーム開始後に再参加できません。待機中の別のルームを選んでください。",
    ROOM_REQUEST_INVALID:
      "サーバーが参加リクエストを拒否しました。ページを再読み込みして、もう一度参加してください。",
    ROOM_REQUEST_CONFLICT:
      "ルームの状態または以前のリクエストと競合しました。最新の状態を確認して、もう一度参加してください。",
    ROOM_SERVER_BUSY:
      "現在、参加リクエストを処理できません。少し待ってから、もう一度お試しください。",
    ROOM_SERVER_UNAVAILABLE:
      "サーバーが参加リクエストを処理できませんでした。少し待ってから、もう一度お試しください。",
    ROOM_REQUEST_TIMEOUT:
      "制限時間内にサーバーから応答がありませんでした。接続を確認して、もう一度お試しください。",
    ROOM_NETWORK_FAILED:
      "参加リクエストの送信または応答の受信中に接続に失敗しました。接続を確認して、もう一度お試しください。",
    ROOM_RESPONSE_INVALID:
      "サーバーの応答が想定した形式と異なります。ページを再読み込みして、もう一度お試しください。",
    ROOM_CREATE_FAILED:
      "サーバールームを作成できませんでした。接続を確認して、もう一度お試しください。",
    ROOM_CODE_IN_USE: "このルームコードは使用中です。別のコードを入力してください。",
    ROOM_JOIN_FAILED:
      "サーバールームに参加できませんでした。ルームコードと接続を確認して、もう一度お試しください。",
    ROOM_PARTY_SYNC_FAILED:
      "パーティー情報をサーバーと同期できませんでした。もう一度お試しください。",
    ROOM_READY_FAILED: "準備状態をサーバーに反映できませんでした。もう一度お試しください。",
    ROOM_TRANSPORT_FAILED:
      "ルームの最新状態を確認できませんでした。ネットワーク接続を確認してください。",
    ROOM_FULL: "このルームには8人が接続中です。誰かが退出してから、もう一度お試しください。",
    ROOM_EXPIRED: "ルームが終了したか、有効期限が切れました。別のルームを選んでください。",
    CURSOR_REGRESSION:
      "ルームの接続情報の有効期限が切れました。入室画面からもう一度参加してください。",
  },
} satisfies Record<PokeLoungeLocale, Record<ServerRoomErrorCode, string>>;

const SERVER_ROOM_ERROR_TITLES = {
  "ko-KR": {
    ROOM_ALREADY_STARTED: "이미 시작된 방입니다",
    ROOM_NOT_FOUND: "방을 찾을 수 없습니다",
    ROOM_SESSION_INVALID: "참가 세션이 유효하지 않습니다",
    ROOM_ACCESS_DENIED: "이 방에 접근할 수 없습니다",
    ROOM_IDENTITY_MISMATCH: "참가 신원이 일치하지 않습니다",
    ROOM_REJOIN_BLOCKED: "이 방에 다시 참가할 수 없습니다",
    ROOM_REQUEST_INVALID: "참가 요청이 올바르지 않습니다",
    ROOM_REQUEST_CONFLICT: "참가 요청이 충돌했습니다",
    ROOM_SERVER_BUSY: "서버가 혼잡합니다",
    ROOM_SERVER_UNAVAILABLE: "서버를 사용할 수 없습니다",
    ROOM_REQUEST_TIMEOUT: "참가 요청 시간이 초과됐습니다",
    ROOM_NETWORK_FAILED: "서버 응답을 받지 못했습니다",
    ROOM_RESPONSE_INVALID: "서버 응답을 해석할 수 없습니다",
    ROOM_CREATE_FAILED: "방을 만들지 못했습니다",
    ROOM_CODE_IN_USE: "이미 사용 중인 방 코드입니다",
    ROOM_JOIN_FAILED: "방에 참가하지 못했습니다",
    ROOM_PARTY_SYNC_FAILED: "파티 정보를 동기화하지 못했습니다",
    ROOM_READY_FAILED: "준비 상태를 반영하지 못했습니다",
    ROOM_TRANSPORT_FAILED: "서버 상태를 동기화하지 못했습니다",
    ROOM_FULL: "방에 빈자리가 없습니다",
    ROOM_EXPIRED: "방이 종료되었습니다",
    CURSOR_REGRESSION: "방 참가 정보를 확인할 수 없습니다",
    DISCONNECTED: "연결이 끊겼습니다",
  },
  "en-US": {
    ROOM_ALREADY_STARTED: "This room has already started",
    ROOM_NOT_FOUND: "Room not found",
    ROOM_SESSION_INVALID: "Your session is invalid",
    ROOM_ACCESS_DENIED: "Access to this room was denied",
    ROOM_IDENTITY_MISMATCH: "Your participant identity does not match",
    ROOM_REJOIN_BLOCKED: "You cannot rejoin this room",
    ROOM_REQUEST_INVALID: "The join request is invalid",
    ROOM_REQUEST_CONFLICT: "The join request conflicted",
    ROOM_SERVER_BUSY: "The server is busy",
    ROOM_SERVER_UNAVAILABLE: "The server is unavailable",
    ROOM_REQUEST_TIMEOUT: "The join request timed out",
    ROOM_NETWORK_FAILED: "Could not receive the server response",
    ROOM_RESPONSE_INVALID: "The server response is invalid",
    ROOM_CREATE_FAILED: "Couldn't create the room",
    ROOM_CODE_IN_USE: "Room code already in use",
    ROOM_JOIN_FAILED: "Couldn't join the room",
    ROOM_PARTY_SYNC_FAILED: "Couldn't sync your party",
    ROOM_READY_FAILED: "Couldn't update your readiness",
    ROOM_TRANSPORT_FAILED: "Couldn't sync the room state",
    ROOM_FULL: "The room is full",
    ROOM_EXPIRED: "The room has ended",
    CURSOR_REGRESSION: "Your room participation is no longer valid",
    DISCONNECTED: "Connection lost",
  },
  "ja-JP": {
    ROOM_ALREADY_STARTED: "ゲームが始まっています",
    ROOM_NOT_FOUND: "ルームが見つかりません",
    ROOM_SESSION_INVALID: "参加セッションが無効です",
    ROOM_ACCESS_DENIED: "このルームにアクセスできません",
    ROOM_IDENTITY_MISMATCH: "参加者情報が一致しません",
    ROOM_REJOIN_BLOCKED: "このルームには再参加できません",
    ROOM_REQUEST_INVALID: "参加リクエストが無効です",
    ROOM_REQUEST_CONFLICT: "参加リクエストが競合しました",
    ROOM_SERVER_BUSY: "サーバーが混雑しています",
    ROOM_SERVER_UNAVAILABLE: "サーバーを利用できません",
    ROOM_REQUEST_TIMEOUT: "参加リクエストがタイムアウトしました",
    ROOM_NETWORK_FAILED: "サーバーの応答を受信できませんでした",
    ROOM_RESPONSE_INVALID: "サーバーの応答を読み取れません",
    ROOM_CREATE_FAILED: "ルームを作成できませんでした",
    ROOM_CODE_IN_USE: "使用中のルームコードです",
    ROOM_JOIN_FAILED: "ルームに参加できませんでした",
    ROOM_PARTY_SYNC_FAILED: "パーティーを同期できませんでした",
    ROOM_READY_FAILED: "準備状態を更新できませんでした",
    ROOM_TRANSPORT_FAILED: "ルームの状態を同期できませんでした",
    ROOM_FULL: "ルームが満員です",
    ROOM_EXPIRED: "ルームが終了しました",
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

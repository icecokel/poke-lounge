import type { RoomMessage } from "./local-preview-room";
import type { TournamentRoomMessageType } from "./tournament-room-protocol";

export const ROOM_MESSAGES: ReadonlySet<RoomMessage> = new Set([
  "CURRENT_PLAYERS",
  "PLAYER_JOINED",
  "PLAYER_MOVED",
  "PLAYER_MOVEMENT_ENDED",
  "PLAYER_CHANGED_MAP",
  "PLAYER_LEFT",
  "TOURNAMENT_STARTED",
  "TOURNAMENT_STATE",
  "TOURNAMENT_MATCH_RESULT",
  "TOURNAMENT_COMPLETED",
  "ROUND_SCORE_UPDATED",
  "COMPETITIVE_ASSIGNMENT",
  "COMPETITIVE_STATE",
  "COMPETITIVE_ACTION",
  "COMPETITIVE_ACTION_FAILED",
] as const satisfies readonly RoomMessage[]);

// TOURNAMENT_STATE·COMPETITIVE_* 는 서버 방이 스키마 검증 후에만 내보내는 권한 이벤트다.
// P2P 피어가 주입하지 못하도록 WebRTC는 이 목록만 받는다.
export const PEER_RELAYED_ROOM_MESSAGES: ReadonlySet<RoomMessage> = new Set([
  "CURRENT_PLAYERS",
  "PLAYER_JOINED",
  "PLAYER_MOVED",
  "PLAYER_MOVEMENT_ENDED",
  "PLAYER_CHANGED_MAP",
  "PLAYER_LEFT",
  "TOURNAMENT_STARTED",
  "TOURNAMENT_MATCH_RESULT",
  "TOURNAMENT_COMPLETED",
  "ROUND_SCORE_UPDATED",
] as const satisfies readonly RoomMessage[]);

export const TOURNAMENT_ROOM_MESSAGES: ReadonlySet<TournamentRoomMessageType> = new Set([
  "TOURNAMENT_STARTED",
  "TOURNAMENT_MATCH_RESULT",
  "TOURNAMENT_COMPLETED",
  "ROUND_SCORE_UPDATED",
]);

export function isTournamentRoomMessage(type: RoomMessage): type is TournamentRoomMessageType {
  return TOURNAMENT_ROOM_MESSAGES.has(type as TournamentRoomMessageType);
}

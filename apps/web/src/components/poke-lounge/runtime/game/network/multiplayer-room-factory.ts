import { createLocalPreviewRoom, type MultiplayerRoom } from "./local-preview-room";
import { readRoomEntryFromSearchParams, readRoomRoundDurationMs } from "./room-entry";
import { createServerRoom } from "./server-room";

export interface MultiplayerRoomFactoryOptions {
  searchParams: Pick<URLSearchParams, "get">;
  accountId?: string;
  roomId?: string;
  roomRunId?: string;
  persistRoomCodeInUrl?: boolean;
  resumeRoom?: boolean;
  sharedWorldOnly?: boolean;
  competitiveRoundsEnabled?: boolean;
  createWebRtcRoom?: () => MultiplayerRoom;
  idToken?: string;
  getIdToken?: () => string | undefined;
}

export function createMultiplayerRoom(options: MultiplayerRoomFactoryOptions): MultiplayerRoom {
  const roomEntry = readRoomEntryFromSearchParams(options.searchParams);

  if (roomEntry.mode === "webrtc") {
    if (!options.createWebRtcRoom) {
      throw new Error("Missing createWebRtcRoom dependency for ?network=webrtc.");
    }

    return options.createWebRtcRoom();
  }

  if (roomEntry.mode === "server-room") {
    return createServerRoom({
      accountId: options.accountId,
      roomId: options.roomId ?? roomEntry.roomCode ?? undefined,
      roomRunId: options.roomRunId,
      sessionId: options.searchParams.get("serverSessionId") ?? undefined,
      playerId: options.searchParams.get("serverPlayerId") ?? undefined,
      createRoom: roomEntry.createRoom === true,
      quickPlay: roomEntry.quickPlay === true,
      roundDurationMs: readRoomRoundDurationMs(options.searchParams) ?? undefined,
      idToken: options.idToken,
      getIdToken: options.getIdToken,
      persistRoomCodeInUrl: options.persistRoomCodeInUrl,
      resumeRoom: options.resumeRoom,
      sharedWorldOnly: options.sharedWorldOnly,
      competitiveRoundsEnabled: options.competitiveRoundsEnabled,
    });
  }

  return createLocalPreviewRoom({
    roomId: roomEntry.roomCode ?? undefined,
  });
}

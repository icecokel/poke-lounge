import { createLocalPreviewRoom, type MultiplayerRoom } from "./local-preview-room";
import type { RoomEntryIntent } from "./room-entry";
import { createServerRoom } from "./server-room";

export interface MultiplayerRoomFactoryOptions {
  roomEntry: RoomEntryIntent;
  accountId?: string;
  roomId?: string;
  roomRunId?: string;
  resumeRoom?: boolean;
  initialOpenCommandId?: string;
  sharedWorldOnly?: boolean;
  competitiveRoundsEnabled?: boolean;
  createWebRtcRoom?: () => MultiplayerRoom;
  idToken?: string;
  getIdToken?: () => string | undefined;
}

export function createMultiplayerRoom(options: MultiplayerRoomFactoryOptions): MultiplayerRoom {
  const { roomEntry } = options;

  if (roomEntry.mode === "webrtc") {
    if (!options.createWebRtcRoom) {
      throw new Error("Missing createWebRtcRoom dependency for WebRTC entry.");
    }

    return options.createWebRtcRoom();
  }

  if (roomEntry.mode === "server-room") {
    return createServerRoom({
      accountId: options.accountId,
      roomId: options.roomId ?? roomEntry.roomCode ?? undefined,
      roomInstanceId: roomEntry.roomInstanceId,
      roomRunId: options.roomRunId,
      createRoom: roomEntry.createRoom === true,
      quickPlay: roomEntry.quickPlay === true,
      visibility: roomEntry.visibility,
      roundDurationMs: roomEntry.roundDurationMs,
      idToken: options.idToken,
      getIdToken: options.getIdToken,
      resumeRoom: options.resumeRoom,
      initialOpenCommandId: options.initialOpenCommandId,
      sharedWorldOnly: options.sharedWorldOnly,
      competitiveRoundsEnabled: options.competitiveRoundsEnabled,
    });
  }

  return createLocalPreviewRoom({
    roomId: roomEntry.roomCode ?? undefined,
  });
}

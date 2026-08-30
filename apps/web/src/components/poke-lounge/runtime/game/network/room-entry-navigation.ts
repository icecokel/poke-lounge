import { applyRoomRoundDurationSearchParam, type RoomEntryMode } from "./roomEntry";
import type { RoomEntrySelection } from "./roomEntryScreen";

export function isLocalE2eUrl(url: URL): boolean {
  return (
    url.searchParams.has("e2e") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
  );
}

export function isCompetitiveRoomEntryMode(mode: RoomEntryMode): boolean {
  return mode === "local-room" || mode === "server-room" || mode === "webrtc";
}

export function applyRoomEntrySelection(url: URL, selection: RoomEntrySelection): void {
  if (selection.mode === "solo") {
    url.searchParams.delete("create");
    url.searchParams.delete("network");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "webrtc") {
    url.searchParams.delete("create");
    url.searchParams.set("network", "webrtc");
    url.searchParams.delete("room");
    applyRoomRoundDurationSearchParam(url);
    return;
  }

  if (selection.mode === "server-room") {
    url.searchParams.set("network", "server");
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);

    if (selection.createRoom) {
      url.searchParams.set("create", "1");
      url.searchParams.delete("room");
      return;
    }

    url.searchParams.delete("create");
    if (selection.roomCode) {
      url.searchParams.set("room", selection.roomCode);
    }
    return;
  }

  if (selection.roomCode) {
    url.searchParams.delete("create");
    url.searchParams.set("network", "local");
    url.searchParams.set("room", selection.roomCode);
    applyRoomRoundDurationSearchParam(url, selection.roundDurationMs);
  }
}

export function clearRoomEntrySearchParams(url: URL): void {
  url.searchParams.delete("create");
  url.searchParams.delete("network");
  url.searchParams.delete("room");
  url.searchParams.delete("serverPlayerId");
  url.searchParams.delete("serverSessionId");
}

export function replaceBrowserUrl(url: URL): void {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

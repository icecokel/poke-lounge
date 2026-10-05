import {
  isSupportedRoomEntryQueryVersion,
  ROOM_ENTRY_QUERY_VERSION_PARAM,
} from "./runtime/game/network/room-entry";

const MULTIPLAYER_NETWORKS = new Set(["local", "server", "webrtc"]);

export function isPokeLoungeMultiplayerResultUrl(url: URL): boolean {
  if (!isSupportedRoomEntryQueryVersion(url.searchParams)) {
    return false;
  }
  const network = url.searchParams.get("network");

  return MULTIPLAYER_NETWORKS.has(network ?? "") || (!network && url.searchParams.has("room"));
}

export function createPokeLoungeRoomEntryUrl(url: URL): URL {
  const roomEntryUrl = new URL(url.href);

  roomEntryUrl.searchParams.delete(ROOM_ENTRY_QUERY_VERSION_PARAM);
  roomEntryUrl.searchParams.delete("create");
  roomEntryUrl.searchParams.delete("network");
  roomEntryUrl.searchParams.delete("room");
  roomEntryUrl.searchParams.delete("serverPlayerId");
  roomEntryUrl.searchParams.delete("serverSessionId");

  return roomEntryUrl;
}

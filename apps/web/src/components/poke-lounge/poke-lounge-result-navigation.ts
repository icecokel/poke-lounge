const MULTIPLAYER_NETWORKS = new Set(["local", "server", "webrtc"]);

export function isPokeLoungeMultiplayerResultUrl(url: URL): boolean {
  const network = url.searchParams.get("network");

  return MULTIPLAYER_NETWORKS.has(network ?? "") || (!network && url.searchParams.has("room"));
}

export function createPokeLoungeRoomEntryUrl(url: URL): URL {
  const roomEntryUrl = new URL(url.href);

  roomEntryUrl.searchParams.delete("create");
  roomEntryUrl.searchParams.delete("network");
  roomEntryUrl.searchParams.delete("room");
  roomEntryUrl.searchParams.delete("serverPlayerId");
  roomEntryUrl.searchParams.delete("serverSessionId");

  return roomEntryUrl;
}

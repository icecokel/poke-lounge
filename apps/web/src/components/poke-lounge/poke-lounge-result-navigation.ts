import { clearRoomEntrySearchParams } from "./runtime/game/network/room-entry";

export function createPokeLoungeRoomEntryUrl(url: URL): URL {
  const roomEntryUrl = new URL(url.href);
  clearRoomEntrySearchParams(roomEntryUrl);
  return roomEntryUrl;
}

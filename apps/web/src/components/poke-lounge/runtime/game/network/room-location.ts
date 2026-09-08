/** Consume a successful create/join intent without exposing private room codes. */
export function createJoinedRoomLocation(
  current: URL,
  roomCode: string,
  persistRoomCode = true,
): URL {
  const url = new URL(current.href);
  url.searchParams.delete("create");
  url.searchParams.delete("quick");
  url.searchParams.set("network", "server");
  if (persistRoomCode) {
    url.searchParams.set("room", roomCode);
  } else {
    // An ordinary entry URL resumes the active room from the stored identity.
    // Leaving create=1 here requests a NEW room instead of resuming this one.
    url.searchParams.delete("room");
  }
  return url;
}

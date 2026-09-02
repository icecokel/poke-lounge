export const ROOM_CODE_LENGTH = 6;
export const ROOM_ROUND_DURATION_QUERY_PARAM = "roundMs";
export const ROOM_ROUND_DURATION_OPTIONS_MS = [180_000, 300_000, 600_000, 900_000] as const;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_TEMPORARY_PASSWORD_LENGTH = 64;

export type RoomEntryMode = "unset" | "solo" | "local-room" | "server-room" | "webrtc";
export type RoomRoundDurationMs = (typeof ROOM_ROUND_DURATION_OPTIONS_MS)[number];

export interface RoomEntryIntent {
  mode: RoomEntryMode;
  roomCode: string | null;
  createRoom?: boolean;
  quickPlay?: boolean;
}

export function normalizeRoomCode(value: string): string | null {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);

  return normalized.length > 0 ? normalized : null;
}

export function createRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, function callback() {
    const index = Math.min(
      ROOM_CODE_ALPHABET.length - 1,
      Math.floor(Math.max(0, Math.min(0.999999, random())) * ROOM_CODE_ALPHABET.length),
    );

    return ROOM_CODE_ALPHABET[index];
  }).join("");
}

export function normalizeTemporaryPassword(value: string): string {
  return Array.from(value.normalize("NFKC").trim())
    .slice(0, MAX_TEMPORARY_PASSWORD_LENGTH)
    .join("");
}

export async function deriveTemporaryRoomCode(password: string): Promise<string> {
  const normalizedPassword = normalizeTemporaryPassword(password);

  if (!normalizedPassword) {
    throw new Error("Temporary password is required.");
  }

  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`poke-lounge-room:${normalizedPassword}`),
    ),
  );

  return Array.from(digest.slice(0, ROOM_CODE_LENGTH), function callback(byte) {
    return ROOM_CODE_ALPHABET[byte & (ROOM_CODE_ALPHABET.length - 1)];
  }).join("");
}

export function createInviteUrl(baseUrl: URL, roomCode: string, roundDurationMs?: number): URL {
  const url = new URL(baseUrl.href);
  url.searchParams.set("network", "local");
  url.searchParams.set("room", roomCode);
  applyRoomRoundDurationSearchParam(url, roundDurationMs);

  return url;
}

export function createServerInviteUrl(
  baseUrl: URL,
  roomCode: string,
  roundDurationMs?: number,
): URL {
  const url = new URL(baseUrl.href);
  url.searchParams.set("network", "server");
  url.searchParams.set("room", roomCode);
  applyRoomRoundDurationSearchParam(url, roundDurationMs);

  return url;
}

export function normalizeRoomRoundDurationMs(value: unknown): RoomRoundDurationMs | null {
  const numericValue = typeof value === "string" ? Number(value) : value;

  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return null;
  }

  const durationMs = Math.trunc(numericValue);

  return (
    ROOM_ROUND_DURATION_OPTIONS_MS.find(function findItem(option) {
      return option === durationMs;
    }) ?? null
  );
}

export function readRoomRoundDurationMs(
  searchParams: Pick<URLSearchParams, "get">,
): RoomRoundDurationMs | null {
  return normalizeRoomRoundDurationMs(searchParams.get(ROOM_ROUND_DURATION_QUERY_PARAM));
}

export function applyRoomRoundDurationSearchParam(url: URL, roundDurationMs?: number): void {
  const normalizedDurationMs = normalizeRoomRoundDurationMs(roundDurationMs);

  if (normalizedDurationMs === null) {
    url.searchParams.delete(ROOM_ROUND_DURATION_QUERY_PARAM);
    return;
  }

  url.searchParams.set(ROOM_ROUND_DURATION_QUERY_PARAM, String(normalizedDurationMs));
}

export function readRoomEntryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): RoomEntryIntent {
  const network = searchParams.get("network");

  if (network === "webrtc") {
    return {
      mode: "webrtc",
      roomCode: null,
    };
  }

  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");

  if (network === "server" && searchParams.get("quick") === "1") {
    return {
      mode: "server-room",
      roomCode: null,
      quickPlay: true,
    };
  }

  if (network === "server" && roomCode) {
    return {
      mode: "server-room",
      roomCode,
    };
  }

  if (network === "server" && searchParams.get("create") === "1") {
    return {
      mode: "server-room",
      roomCode: null,
      createRoom: true,
    };
  }

  if (roomCode) {
    return {
      mode: "local-room",
      roomCode,
    };
  }

  return {
    mode: "unset",
    roomCode: null,
  };
}

export function readRoomEntryFromLocation(location: URL): RoomEntryIntent {
  return readRoomEntryFromSearchParams(location.searchParams);
}

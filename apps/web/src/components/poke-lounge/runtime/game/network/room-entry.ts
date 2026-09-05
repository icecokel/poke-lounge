export const ROOM_CODE_LENGTH = 6;
export const TEMPORARY_PASSWORD_LENGTH = 6;
export const ROOM_ROUND_DURATION_QUERY_PARAM = "roundMs";
export { ROUND_DURATION_OPTIONS_MS as ROOM_ROUND_DURATION_OPTIONS_MS } from "@poke-lounge/battle/round-settings";
import { ROUND_DURATION_OPTIONS_MS as ROOM_ROUND_DURATION_OPTIONS_MS } from "@poke-lounge/battle/round-settings";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, TEMPORARY_PASSWORD_LENGTH);
}

export function createTemporaryPassword(): string {
  const randomValues = globalThis.crypto.getRandomValues(new Uint8Array(TEMPORARY_PASSWORD_LENGTH));

  return Array.from(randomValues, function callback(byte) {
    return ROOM_CODE_ALPHABET[byte & (ROOM_CODE_ALPHABET.length - 1)];
  }).join("");
}

export async function deriveTemporaryRoomCode(password: string): Promise<string> {
  const normalizedPassword = normalizeTemporaryPassword(password);

  if (normalizedPassword.length !== TEMPORARY_PASSWORD_LENGTH) {
    throw new Error("Temporary password must be 6 alphanumeric characters.");
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

export function createRoomShareUrl(currentUrl: URL, roomCode?: string | null): string | null {
  const network = currentUrl.searchParams.get("network");
  const normalizedRoomCode = normalizeRoomCode(
    roomCode ?? currentUrl.searchParams.get("room") ?? "",
  );

  if ((network !== "local" && network !== "server") || !normalizedRoomCode) {
    return null;
  }

  const shareUrl = new URL(currentUrl.href);
  shareUrl.searchParams.set("network", network);
  shareUrl.searchParams.set("room", normalizedRoomCode);
  shareUrl.searchParams.delete("create");
  shareUrl.searchParams.delete("quick");
  shareUrl.searchParams.delete("e2e");
  shareUrl.searchParams.delete("e2eBattle");
  shareUrl.searchParams.delete("localTest");
  shareUrl.searchParams.delete("scene");
  shareUrl.searchParams.delete("serverPlayerId");
  shareUrl.searchParams.delete("serverSessionId");

  return shareUrl.href;
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

import { routing } from "@/i18n/routing";

export const ROOM_CODE_LENGTH = 6;
export const TEMPORARY_PASSWORD_LENGTH = 6;
export const ROOM_ROUND_DURATION_QUERY_PARAM = "roundMs";
export const ROOM_VISIBILITY_QUERY_PARAM = "visibility";
export const ROOM_INSTANCE_QUERY_PARAM = "roomInstance";
export const ROOM_ENTRY_QUERY_VERSION_PARAM = "roomV";
export const ROOM_ENTRY_QUERY_VERSION = "2";
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
  visibility?: "private" | "public";
  roomInstanceId?: string;
  roundDurationMs?: RoomRoundDurationMs;
}

export function normalizeRoomCode(value: string): string | null {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);

  return normalized.length > 0 ? normalized : null;
}

export function normalizeRoomInstanceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
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

const roomEntrySearchParams = [
  ROOM_ENTRY_QUERY_VERSION_PARAM,
  "network",
  "room",
  ROOM_INSTANCE_QUERY_PARAM,
  "create",
  "quick",
  ROOM_VISIBILITY_QUERY_PARAM,
  ROOM_ROUND_DURATION_QUERY_PARAM,
  "localTest",
  "serverPlayerId",
  "serverSessionId",
  "e2e",
  "e2eBattle",
  "scene",
] as const;

export function clearRoomEntrySearchParams(url: URL): void {
  for (const param of roomEntrySearchParams) url.searchParams.delete(param);
}

export function createRoomShareUrl(currentUrl: URL, entry: RoomEntryIntent): string | null {
  const roomCode = normalizeRoomCode(entry.roomCode ?? "");
  if ((entry.mode !== "local-room" && entry.mode !== "server-room") || !roomCode) {
    return null;
  }

  const shareUrl = new URL(currentUrl.href);
  const routeLocale = currentUrl.pathname.split("/")[1];
  shareUrl.pathname = `/${routing.locales.find(locale => locale === routeLocale) ?? routing.defaultLocale}`;
  clearRoomEntrySearchParams(shareUrl);
  shareUrl.searchParams.set(ROOM_ENTRY_QUERY_VERSION_PARAM, ROOM_ENTRY_QUERY_VERSION);
  shareUrl.searchParams.set("room", roomCode);
  if (entry.mode === "local-room") {
    shareUrl.searchParams.set("network", "local");
    // Local rooms have no authoritative server settings to read after reloading.
    const duration = normalizeRoomRoundDurationMs(entry.roundDurationMs);
    if (duration !== null)
      shareUrl.searchParams.set(ROOM_ROUND_DURATION_QUERY_PARAM, String(duration));
  }
  const instanceId = normalizeRoomInstanceId(entry.roomInstanceId);
  if (entry.mode === "server-room" && instanceId) {
    shareUrl.searchParams.set(ROOM_INSTANCE_QUERY_PARAM, instanceId);
  }
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

export function isSupportedRoomEntryQueryVersion(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  const version = searchParams.get(ROOM_ENTRY_QUERY_VERSION_PARAM);
  return version === null || version === "1" || version === ROOM_ENTRY_QUERY_VERSION;
}

export function readRoomEntryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): RoomEntryIntent {
  if (!isSupportedRoomEntryQueryVersion(searchParams)) {
    return { mode: "unset", roomCode: null };
  }
  // Version 2 invite links use the server by default. Preserve legacy local links.
  const currentVersion =
    searchParams.get(ROOM_ENTRY_QUERY_VERSION_PARAM) === ROOM_ENTRY_QUERY_VERSION;
  const network = searchParams.get("network") ?? (currentVersion ? "server" : null);
  const roundDurationMs =
    currentVersion && network === "server"
      ? undefined
      : (normalizeRoomRoundDurationMs(searchParams.get(ROOM_ROUND_DURATION_QUERY_PARAM)) ??
        undefined);

  if (network === "webrtc") {
    return {
      mode: "webrtc",
      roomCode: null,
      roundDurationMs,
    };
  }

  const roomCode = normalizeRoomCode(searchParams.get("room") ?? "");
  const roomInstanceId = normalizeRoomInstanceId(searchParams.get(ROOM_INSTANCE_QUERY_PARAM));

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
      ...(roomInstanceId ? { roomInstanceId } : {}),
      ...(searchParams.get(ROOM_VISIBILITY_QUERY_PARAM) === "public"
        ? { visibility: "public" as const }
        : {}),
    };
  }

  if (network === "server" && searchParams.get("create") === "1") {
    return {
      mode: "server-room",
      roomCode: null,
      createRoom: true,
      roundDurationMs,
      visibility: searchParams.get(ROOM_VISIBILITY_QUERY_PARAM) === "public" ? "public" : "private",
    };
  }

  if (roomCode) {
    return {
      mode: "local-room",
      roomCode,
      roundDurationMs,
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

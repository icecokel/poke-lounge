import { createRoomRunId, isRoomRunId } from "../room-run-id";
import {
  clearPendingRoomEntry,
  clearRoomResumeCookie,
  readRoomResumeCookie,
} from "./room-entry-cookie";
import type { ServerRoomOptions } from "./server-room";

const SERVER_IDENTITY_STORAGE_KEY = "poke-lounge:rust-room-identity:v3";

const USAGE_VISITOR_STORAGE_KEY = "poke-lounge:usage-visitor:v1";

let memoryUsageVisitorId: string | null = null;

const LEGACY_RUST_IDENTITY_STORAGE_KEY = "poke-lounge:rust-room-identity:v2";

const RUST_IDENTITY_STORAGE_VERSION = 3;

const RUST_IDENTITY_UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const RUST_USAGE_VISITOR_PATTERN = new RegExp(`^${RUST_IDENTITY_UUID_PATTERN}$`, "i");

const RUST_SESSION_ID_PATTERN = new RegExp(`^server-session-${RUST_IDENTITY_UUID_PATTERN}$`, "i");

const RUST_PLAYER_ID_PATTERN = new RegExp(`^server-player-${RUST_IDENTITY_UUID_PATTERN}$`, "i");

const SERVER_ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

interface StoredServerRoomIdentity {
  version?: number;
  sessionId: string;
  playerId: string;
  activeRoom?: {
    roomCode: string;
    roomInstanceId?: string;
    expiresAtMs: number;
    cookieVersion?: 1;
    runId: string;
  };
}

export interface StoredServerRoomResume {
  roomCode: string;
  roomInstanceId?: string;
  runId: string;
}

export function clearStoredServerRoomResume(accountId?: string): void {
  clearRoomResumeCookie();
  clearPendingRoomEntry();
  const identity = readStoredIdentity(accountId);
  if (!identity) {
    return;
  }

  writeStoredIdentity(
    {
      sessionId: identity.sessionId,
      playerId: identity.playerId,
    },
    accountId,
  );
}

export function clearStoredServerRoomSession(accountId?: string): void {
  clearRoomResumeCookie();
  clearPendingRoomEntry();
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage?.removeItem(getServerIdentityStorageKey(accountId));
      if (accountId?.trim()) {
        storage?.removeItem(SERVER_IDENTITY_STORAGE_KEY);
      }
    }
  } catch {
    // A fresh identity is still generated when storage is unavailable.
  }
}

export function consumeLegacyServerRoomIdentity(accountId?: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    // v2 could contain URL-selected credentials, so only retire it; never copy it into v3.
    const hadCurrentIdentity = readStoredIdentity(accountId) !== null;
    const legacyKeys = new Set([
      getServerIdentityStorageKeyFor(LEGACY_RUST_IDENTITY_STORAGE_KEY, accountId),
      LEGACY_RUST_IDENTITY_STORAGE_KEY,
    ]);
    let hadLegacyIdentity = false;
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of legacyKeys) {
        if (storage.getItem(key) !== null) {
          storage.removeItem(key);
          hadLegacyIdentity = true;
        }
      }
    }
    return hadLegacyIdentity && !hadCurrentIdentity;
  } catch {
    return false;
  }
}

export function resolveServerIdentity(options: ServerRoomOptions): {
  sessionId: string;
  playerId: string;
} {
  const stored = readStoredIdentity(options.accountId);
  const identity = {
    sessionId: stored?.sessionId ?? `server-session-${createIdentityToken()}`,
    playerId: stored?.playerId ?? `server-player-${createIdentityToken()}`,
  };

  writeStoredIdentity(stored ? { ...stored, ...identity } : identity, options.accountId);

  return identity;
}

export function readStoredIdentity(accountId?: string): StoredServerRoomIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storageKey = getServerIdentityStorageKey(accountId);
    const sources: Array<{ storage: Storage; key: string }> = [
      { storage: window.localStorage, key: storageKey },
      { storage: window.sessionStorage, key: storageKey },
      ...(accountId?.trim()
        ? [
            { storage: window.localStorage, key: SERVER_IDENTITY_STORAGE_KEY },
            { storage: window.sessionStorage, key: SERVER_IDENTITY_STORAGE_KEY },
          ]
        : []),
    ];

    for (const source of sources) {
      const identity = parseStoredIdentity(source.storage.getItem(source.key));
      if (!identity) {
        continue;
      }
      if (source.storage !== window.localStorage || source.key !== storageKey) {
        writeStoredIdentity(identity, accountId);
        try {
          const migrated = parseStoredIdentity(window.localStorage.getItem(storageKey));
          if (
            migrated?.sessionId === identity.sessionId &&
            migrated.playerId === identity.playerId
          ) {
            source.storage.removeItem(source.key);
            if (accountId?.trim()) {
              window.localStorage.removeItem(SERVER_IDENTITY_STORAGE_KEY);
              window.sessionStorage.removeItem(SERVER_IDENTITY_STORAGE_KEY);
            }
          }
        } catch {
          // The source identity is still usable when old storage cannot be removed.
        }
      }
      return identity;
    }
  } catch {
    return null;
  }

  return null;
}

function parseStoredIdentity(stored: string | null): StoredServerRoomIdentity | null {
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredServerRoomIdentity>;
    if (typeof parsed.sessionId !== "string" || typeof parsed.playerId !== "string") {
      return null;
    }
    // Earlier v3 builds did not write a version field, but did generate UUID v4 credentials.
    if (
      (parsed.version !== undefined && parsed.version !== RUST_IDENTITY_STORAGE_VERSION) ||
      !RUST_SESSION_ID_PATTERN.test(parsed.sessionId) ||
      !RUST_PLAYER_ID_PATTERN.test(parsed.playerId)
    ) {
      return null;
    }

    const activeRoom = parseStoredActiveRoom(parsed.activeRoom);
    return {
      sessionId: parsed.sessionId,
      playerId: parsed.playerId,
      ...(activeRoom ? { activeRoom } : {}),
    };
  } catch {
    return null;
  }
}

/** Returns the stored JSON, or null when it could not be written. */
export function writeStoredIdentity(
  identity: StoredServerRoomIdentity,
  accountId?: string,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serialized = JSON.stringify({ ...identity, version: RUST_IDENTITY_STORAGE_VERSION });
    window.localStorage.setItem(getServerIdentityStorageKey(accountId), serialized);
    return serialized;
  } catch {
    // Ignore storage failures; generated identities still work for the current page lifetime.
    return null;
  }
}

export function isStoredIdentityJson(serialized: string, accountId?: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(getServerIdentityStorageKey(accountId)) === serialized;
  } catch {
    return false;
  }
}

export function readStoredServerRoomResume(accountId?: string): StoredServerRoomResume | null {
  const identity = readStoredIdentity(accountId);
  if (!identity) return null;
  const resumeCookie = readRoomResumeCookie();
  if (resumeCookie?.playerId === identity.playerId) {
    return {
      roomCode: resumeCookie.roomCode,
      runId: resumeCookie.runId,
      ...(resumeCookie.roomInstanceId ? { roomInstanceId: resumeCookie.roomInstanceId } : {}),
    };
  }

  const activeRoom = identity.activeRoom;
  // The cookie owns expiry for new sessions; another tab's localStorage must not revive it.
  if (!activeRoom || activeRoom.cookieVersion === 1) return null;
  if (activeRoom.expiresAtMs <= Date.now()) {
    writeStoredIdentity({ sessionId: identity.sessionId, playerId: identity.playerId }, accountId);
    return null;
  }
  return {
    roomCode: activeRoom.roomCode,
    runId: activeRoom.runId,
    ...(activeRoom.roomInstanceId ? { roomInstanceId: activeRoom.roomInstanceId } : {}),
  };
}

function parseStoredActiveRoom(value: unknown): StoredServerRoomIdentity["activeRoom"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const activeRoom = value as Record<string, unknown>;

  if (
    typeof activeRoom.roomCode !== "string" ||
    !SERVER_ROOM_CODE_PATTERN.test(activeRoom.roomCode) ||
    typeof activeRoom.expiresAtMs !== "number" ||
    !Number.isFinite(activeRoom.expiresAtMs) ||
    !isRoomRunId(activeRoom.runId)
  ) {
    return null;
  }

  return {
    roomCode: activeRoom.roomCode,
    expiresAtMs: activeRoom.expiresAtMs,
    runId: activeRoom.runId,
    ...(activeRoom.cookieVersion === 1 ? { cookieVersion: 1 as const } : {}),
    ...(typeof activeRoom.roomInstanceId === "string" && isRoomRunId(activeRoom.roomInstanceId)
      ? { roomInstanceId: activeRoom.roomInstanceId }
      : {}),
  };
}

export function resolveServerRoomRunId(options: ServerRoomOptions): string {
  if (options.roomRunId !== undefined) {
    if (!isRoomRunId(options.roomRunId)) {
      throw new Error("Poke Lounge server room requires a room run UUID");
    }
    return options.roomRunId;
  }

  if (options.resumeRoom) {
    const activeRoom = readStoredIdentity(options.accountId)?.activeRoom;
    if (activeRoom && (!options.roomId || activeRoom.roomCode === options.roomId)) {
      return activeRoom.runId;
    }
  }

  return createRoomRunId();
}

function getServerIdentityStorageKey(accountId?: string): string {
  return getServerIdentityStorageKeyFor(SERVER_IDENTITY_STORAGE_KEY, accountId);
}

function getServerIdentityStorageKeyFor(baseKey: string, accountId?: string): string {
  const normalizedAccountId = accountId?.trim();

  return normalizedAccountId ? `${baseKey}:${encodeURIComponent(normalizedAccountId)}` : baseKey;
}

function createIdentityToken(): string {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("crypto.randomUUID is required for Poke Lounge room identity");
  }
  return crypto.randomUUID();
}

export function resolveUsageVisitorId(playerId: string): string {
  if (memoryUsageVisitorId) return memoryUsageVisitorId;
  const previousPlayerId = playerId.slice("server-player-".length);
  const visitorId = RUST_USAGE_VISITOR_PATTERN.test(previousPlayerId)
    ? previousPlayerId
    : createIdentityToken();
  try {
    const stored = window.localStorage.getItem(USAGE_VISITOR_STORAGE_KEY);
    if (stored && RUST_USAGE_VISITOR_PATTERN.test(stored)) return (memoryUsageVisitorId = stored);
    window.localStorage.setItem(USAGE_VISITOR_STORAGE_KEY, visitorId);
    return (memoryUsageVisitorId = visitorId);
  } catch {
    return (memoryUsageVisitorId = visitorId);
  }
}

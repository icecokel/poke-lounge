import { createRoomRunId, isRoomRunId } from "../room-run-id";
import { POKE_LOUNGE_SESSION_MAX_LIFETIME_MS } from "@poke-lounge/battle/timing";
import { normalizeRoomInstanceId, normalizeRoomRoundDurationMs } from "./room-entry";
import { normalizeMultiplayerDisplayName, type RoomEntrySelection } from "./room-entry-screen";
import { RUST_BACKEND_ENABLED } from "./rust-room-socket";

export const PENDING_ROOM_ENTRY_MAX_AGE_SECONDS = 120;
const TAB_STORAGE_KEY = "poke-lounge:room-cookie-tab";
const COOKIE_PREFIX = RUST_BACKEND_ENABLED ? "poke_rust_entry" : "poke_server_entry";
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export interface PendingRoomEntry {
  selection: RoomEntrySelection;
  runId: string;
  commandId: string;
  accountId?: string;
}

export interface RoomResumeCookie {
  playerId: string;
  roomCode: string;
  roomInstanceId?: string;
  runId: string;
  expiresAtMs: number;
}

function cookieName(kind: "pending" | "resume"): string | null {
  if (typeof window === "undefined") return null;
  try {
    let tabId = window.sessionStorage.getItem(TAB_STORAGE_KEY);
    if (!isRoomRunId(tabId)) {
      tabId = createRoomRunId();
      window.sessionStorage.setItem(TAB_STORAGE_KEY, tabId);
    }
    return `${COOKIE_PREFIX}_${kind}_${tabId}`;
  } catch {
    return null;
  }
}

function readCookie(kind: "pending" | "resume"): unknown {
  const name = cookieName(kind);
  if (!name) return null;
  try {
    const value = document.cookie.split("; ").find(item => item.startsWith(`${name}=`));
    return value ? JSON.parse(decodeURIComponent(value.slice(name.length + 1))) : null;
  } catch {
    return null;
  }
}

function writeCookie(kind: "pending" | "resume", value: unknown, maxAge: number): boolean {
  const name = cookieName(kind);
  if (!name) return false;
  try {
    // These cookies carry an entry intent, never session credentials; the API authorizes every request.
    const encoded = value === null ? "" : encodeURIComponent(JSON.stringify(value));
    document.cookie = `${name}=${encoded}; Max-Age=${Math.max(0, Math.floor(maxAge))}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    return (
      value === null || document.cookie.split("; ").some(item => item === `${name}=${encoded}`)
    );
  } catch {
    return false;
  }
}

export function writePendingRoomEntry(entry: PendingRoomEntry): void {
  const selection = entry.selection;
  writeCookie(
    "pending",
    {
      ...entry,
      selection: {
        mode: selection.mode,
        roomCode: selection.roomCode,
        displayName: selection.displayName,
        createRoom: selection.createRoom,
        quickPlay: selection.quickPlay,
        visibility: selection.visibility,
        roundDurationMs: selection.roundDurationMs,
        roomInstanceId: selection.roomInstanceId,
      },
    },
    PENDING_ROOM_ENTRY_MAX_AGE_SECONDS,
  );
}

export function readPendingRoomEntry(accountId?: string): PendingRoomEntry | null {
  const value = readCookie("pending");
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<PendingRoomEntry>;
  const selection = entry.selection;
  if (
    entry.accountId !== accountId ||
    !isRoomRunId(entry.runId) ||
    !isRoomRunId(entry.commandId) ||
    !selection ||
    selection.mode !== "server-room" ||
    (selection.roomCode !== null &&
      (typeof selection.roomCode !== "string" || !ROOM_CODE_PATTERN.test(selection.roomCode))) ||
    (selection.createRoom !== undefined && typeof selection.createRoom !== "boolean") ||
    (selection.quickPlay !== undefined && typeof selection.quickPlay !== "boolean") ||
    (selection.createRoom && selection.quickPlay) ||
    (!selection.createRoom && !selection.quickPlay && !selection.roomCode) ||
    (selection.quickPlay && selection.roomCode) ||
    (selection.visibility !== undefined &&
      selection.visibility !== "public" &&
      selection.visibility !== "private") ||
    (selection.roundDurationMs !== undefined &&
      normalizeRoomRoundDurationMs(selection.roundDurationMs) === null) ||
    (selection.roomInstanceId !== undefined &&
      !normalizeRoomInstanceId(selection.roomInstanceId)) ||
    typeof selection.displayName !== "string" ||
    !normalizeMultiplayerDisplayName(selection.displayName)
  )
    return null;
  return {
    runId: entry.runId,
    commandId: entry.commandId,
    accountId,
    selection: {
      mode: "server-room",
      roomCode: selection.roomCode,
      displayName: normalizeMultiplayerDisplayName(selection.displayName),
      createRoom: selection.createRoom,
      quickPlay: selection.quickPlay,
      visibility: selection.visibility,
      roundDurationMs: selection.roundDurationMs,
      roomInstanceId: selection.roomInstanceId,
    },
  };
}

export function clearPendingRoomEntry(commandId?: string): void {
  if (commandId && (readCookie("pending") as PendingRoomEntry | null)?.commandId !== commandId)
    return;
  writeCookie("pending", null, 0);
}

export function writeRoomResumeCookie(entry: RoomResumeCookie, serverNowMs: number): boolean {
  const maxAge =
    Math.min(POKE_LOUNGE_SESSION_MAX_LIFETIME_MS, entry.expiresAtMs - serverNowMs) / 1_000;
  return writeCookie("resume", maxAge > 0 ? entry : null, maxAge);
}

export function readRoomResumeCookie(): RoomResumeCookie | null {
  const value = readCookie("resume") as Partial<RoomResumeCookie> | null;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.roomCode !== "string" ||
    !ROOM_CODE_PATTERN.test(value.roomCode) ||
    typeof value.playerId !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(value.playerId) ||
    !isRoomRunId(value.runId) ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    (value.expiresAtMs as number) <= 0 ||
    (value.roomInstanceId !== undefined && !normalizeRoomInstanceId(value.roomInstanceId))
  )
    return null;
  return value as RoomResumeCookie;
}

export function clearRoomResumeCookie(): void {
  writeCookie("resume", null, 0);
}

import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { RoomEntryIntent, RoomEntryMode } from "./room-entry";

const MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH = 12;
const DISPLAY_NAME_COOKIE = "poke_lounge_display_name";
const DISPLAY_NAME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export interface RoomEntrySelection extends RoomEntryIntent {
  mode: Exclude<RoomEntryMode, "unset">;
  privateRoomAccessCode?: string;
  displayName?: string;
  resetSession?: boolean;
}

export function shouldResetRoomEntrySession(selection: RoomEntrySelection): boolean {
  return selection.mode === "solo" && selection.resetSession === true;
}

export function normalizeMultiplayerDisplayName(value: string): string {
  return Array.from(value.trim()).slice(0, MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH).join("");
}

function readSavedMultiplayerDisplayName(): string {
  if (typeof document === "undefined") return "";
  try {
    const cookie = document.cookie
      .split(";")
      .map(value => value.trim())
      .find(value => value.startsWith(`${DISPLAY_NAME_COOKIE}=`));
    return cookie
      ? normalizeMultiplayerDisplayName(
          decodeURIComponent(cookie.slice(DISPLAY_NAME_COOKIE.length + 1)),
        )
      : "";
  } catch {
    return "";
  }
}

export function saveMultiplayerDisplayName(value: string): void {
  if (typeof document === "undefined") return;
  const name = normalizeMultiplayerDisplayName(value);
  if (!name) return;
  try {
    document.cookie = `${DISPLAY_NAME_COOKIE}=${encodeURIComponent(name)}; Max-Age=${DISPLAY_NAME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // Cookie restrictions must not prevent room entry.
  }
}

export function createRandomMultiplayerDisplayName(
  modifiers: PokeLoungeCopy["roomEntry"]["multiplayerNameModifiers"],
  nouns: PokeLoungeCopy["roomEntry"]["multiplayerNameNouns"],
  random: () => number = Math.random,
): string {
  const combinationCount = modifiers.length * nouns.length;
  const index = Math.floor(Math.max(0, Math.min(0.999999, random())) * combinationCount);

  return `${modifiers[Math.floor(index / nouns.length)]} ${nouns[index % nouns.length]}`;
}

export function resolveInitialMultiplayerDisplayName(
  initialDisplayName: string | undefined,
  modifiers: PokeLoungeCopy["roomEntry"]["multiplayerNameModifiers"],
  nouns: PokeLoungeCopy["roomEntry"]["multiplayerNameNouns"],
  random: () => number = Math.random,
): string {
  const savedName = readSavedMultiplayerDisplayName();
  if (savedName) return savedName;
  const normalizedName = normalizeMultiplayerDisplayName(initialDisplayName ?? "");

  return normalizedName && !/^player \d+$/i.test(normalizedName)
    ? normalizedName
    : createRandomMultiplayerDisplayName(modifiers, nouns, random);
}

import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { RoomEntryIntent, RoomEntryMode } from "./room-entry";

const MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH = 12;

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
  const normalizedName = normalizeMultiplayerDisplayName(initialDisplayName ?? "");

  return normalizedName && !/^player \d+$/i.test(normalizedName)
    ? normalizedName
    : createRandomMultiplayerDisplayName(modifiers, nouns, random);
}

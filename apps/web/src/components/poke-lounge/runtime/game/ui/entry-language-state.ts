import { useLayoutEffect, useState } from "react";

const STORAGE_KEY = "poke-lounge:entry-language-draft";
const MAX_AGE_MS = 5 * 60 * 1000;

export interface EntryLanguageProfile {
  mode: "recommended" | "custom";
  customName: string;
}

interface EntryLanguageDraft {
  destination: string;
  savedAt: number;
  displayName: string;
  scrollY: number;
  profile?: EntryLanguageProfile;
}

const locationKey = (url: URL) => `${url.pathname}${url.search}${url.hash}`;
const isName = (value: unknown): value is string =>
  typeof value === "string" && Array.from(value).length <= 12;

function readDraft(): EntryLanguageDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const draft: Partial<EntryLanguageDraft> | null = JSON.parse(value);
    if (
      !draft ||
      draft.destination !== locationKey(new URL(window.location.href)) ||
      typeof draft.savedAt !== "number" ||
      !Number.isFinite(draft.savedAt) ||
      Date.now() - draft.savedAt < 0 ||
      Date.now() - draft.savedAt > MAX_AGE_MS ||
      !isName(draft.displayName) ||
      typeof draft.scrollY !== "number" ||
      !Number.isFinite(draft.scrollY) ||
      draft.scrollY < 0 ||
      (draft.profile !== undefined &&
        (!draft.profile ||
          (draft.profile.mode !== "recommended" && draft.profile.mode !== "custom") ||
          !isName(draft.profile.customName)))
    )
      return null;
    return draft as EntryLanguageDraft;
  } catch {
    return null;
  }
}

export function saveEntryLanguageDraft(
  destination: URL,
  displayName: string,
  profile?: EntryLanguageProfile,
) {
  try {
    const draft: EntryLanguageDraft = {
      destination: locationKey(destination),
      savedAt: Date.now(),
      displayName,
      scrollY: window.scrollY,
      profile,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage restrictions must not prevent language navigation.
  }
}

export function useEntryLanguageDraft() {
  const [draft] = useState(readDraft);
  useLayoutEffect(() => {
    // Consume after mounting, so Strict Mode's repeated initializer reads stay pure.
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Language navigation still works when session storage is unavailable.
    }
    if (!draft) return;
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: draft.scrollY, left: 0, behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [draft]);
  return draft;
}

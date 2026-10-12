import { useRef, useState } from "react";
import { routing } from "@/i18n/routing";
import type { PokeLoungeCopy, PokeLoungeLocale } from "../../../poke-lounge-copy";
import { PixelButton } from "../../../ui/poke-lounge-ui-primitives";
import { saveMultiplayerDisplayName } from "../network/room-entry-screen";
import { saveEntryLanguageDraft, type EntryLanguageProfile } from "./entry-language-state";

const LANGUAGE_NAMES = {
  "ko-KR": "한국어",
  "en-US": "English",
  "ja-JP": "日本語",
} as const;

const LANGUAGE_SWITCHING = {
  "ko-KR": "언어를 변경하는 중...",
  "en-US": "Changing language...",
  "ja-JP": "言語を切り替えています...",
} satisfies Record<PokeLoungeLocale, string>;

export function EntryLanguageSelector({
  copy,
  displayName,
  disabled,
  profile,
  onLanguageSwitch,
}: {
  copy: PokeLoungeCopy;
  displayName: string;
  disabled: boolean;
  profile?: EntryLanguageProfile;
  onLanguageSwitch(): void;
}) {
  const [switchingLocale, setSwitchingLocale] = useState<PokeLoungeLocale | null>(null);
  const submitted = useRef(false);
  return (
    <fieldset
      className="m-0 grid gap-2 border-0 p-0"
      disabled={disabled || Boolean(switchingLocale)}
      aria-busy={Boolean(switchingLocale)}
    >
      <legend className="mb-2 text-xs font-black" aria-live="polite">
        {switchingLocale ? LANGUAGE_SWITCHING[copy.locale] : copy.roomEntry.languageLabel}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {routing.locales.map(locale => (
          <PixelButton
            key={locale}
            className="min-h-11 px-2 py-2 text-sm"
            selected={(switchingLocale ?? copy.locale) === locale}
            aria-pressed={(switchingLocale ?? copy.locale) === locale}
            lang={locale}
            disabled={disabled || Boolean(switchingLocale)}
            onClick={() => {
              if (disabled || submitted.current || locale === copy.locale) return;
              submitted.current = true;
              saveMultiplayerDisplayName(displayName);
              const url = new URL(window.location.href);
              const segments = url.pathname.split("/");
              segments[1] = locale;
              url.pathname = segments.join("/");
              saveEntryLanguageDraft(url, displayName, profile);
              setSwitchingLocale(locale);
              onLanguageSwitch();
              // Runtime controllers capture their locale at startup, so start a new document.
              requestAnimationFrame(() => window.location.replace(url.href));
            }}
            data-room-entry-language={locale}
          >
            {LANGUAGE_NAMES[locale]}
          </PixelButton>
        ))}
      </div>
    </fieldset>
  );
}

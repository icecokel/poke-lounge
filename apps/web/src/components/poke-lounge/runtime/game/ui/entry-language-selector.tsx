import { routing } from "@/i18n/routing";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { PixelButton } from "../../../ui/poke-lounge-ui-primitives";
import { saveMultiplayerDisplayName } from "../network/room-entry-screen";

const LANGUAGE_NAMES = {
  "ko-KR": "한국어",
  "en-US": "English",
  "ja-JP": "日本語",
} as const;

export function EntryLanguageSelector({
  copy,
  displayName,
  disabled,
}: {
  copy: PokeLoungeCopy;
  displayName: string;
  disabled: boolean;
}) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0" disabled={disabled}>
      <legend className="mb-2 text-xs font-black">{copy.roomEntry.languageLabel}</legend>
      <div className="grid grid-cols-3 gap-2">
        {routing.locales.map(locale => (
          <PixelButton
            key={locale}
            className="min-h-11 px-2 py-2 text-sm"
            selected={copy.locale === locale}
            aria-pressed={copy.locale === locale}
            lang={locale}
            disabled={disabled}
            onClick={() => {
              if (locale === copy.locale) return;
              saveMultiplayerDisplayName(displayName);
              const url = new URL(window.location.href);
              const segments = url.pathname.split("/");
              segments[1] = locale;
              url.pathname = segments.join("/");
              // Runtime controllers capture their locale at startup, so start a new document.
              window.location.assign(url.href);
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

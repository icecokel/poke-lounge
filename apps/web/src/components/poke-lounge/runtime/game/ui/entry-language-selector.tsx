import { useRef, useState } from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [open, setOpen] = useState(false);
  const [switchingLocale, setSwitchingLocale] = useState<PokeLoungeLocale | null>(null);
  const submitted = useRef(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="size-11! shrink-0 touch-manipulation rounded-md border-2 border-[#304c3a] bg-[#fffef3] px-0! text-[#17201a] shadow-none hover:bg-[#fff4c2] focus-visible:border-[#304c3a] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffcf55] disabled:cursor-default disabled:opacity-60"
          disabled={disabled || Boolean(switchingLocale)}
          aria-label={copy.roomEntry.languageLabel}
          title={copy.roomEntry.languageLabel}
          data-room-entry-language-trigger
        >
          <Languages className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-32px)] overflow-auto rounded-[var(--pl-panel-radius)] border-[length:var(--pl-panel-border)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] font-[var(--pl-font-game)] text-[var(--pl-color-ink)] shadow-[var(--pl-panel-shadow)] sm:max-w-xs"
        aria-describedby={undefined}
        aria-busy={Boolean(switchingLocale)}
      >
        <DialogTitle className="text-base font-black" aria-live="polite">
          {switchingLocale ? LANGUAGE_SWITCHING[copy.locale] : copy.roomEntry.languageLabel}
        </DialogTitle>
        <div className="grid gap-2">
          {routing.locales.map(locale => (
            <PixelButton
              key={locale}
              className="min-h-11 px-2 py-2 text-sm"
              selected={(switchingLocale ?? copy.locale) === locale}
              aria-pressed={(switchingLocale ?? copy.locale) === locale}
              lang={locale}
              disabled={disabled || Boolean(switchingLocale)}
              onClick={() => {
                if (disabled || submitted.current) return;
                if (locale === copy.locale) {
                  setOpen(false);
                  return;
                }
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
      </DialogContent>
    </Dialog>
  );
}

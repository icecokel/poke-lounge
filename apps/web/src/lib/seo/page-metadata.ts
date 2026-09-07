import type { Metadata } from "next";
import { routing, type Locale } from "../../i18n/routing";

export const POKE_LOUNGE_SITE_ORIGIN = "https://poke-lounge.icecoke.kr";
export const POKE_LOUNGE_SITE_NAME = "Poke Lounge";
export type MetadataPage = "root" | "intro" | "game";
const pagePaths = { intro: "/game", game: "/game/poke-lounge" } as const;
const openGraphLocales = { "ko-KR": "ko_KR", "en-US": "en_US", "ja-JP": "ja_JP" } satisfies Record<
  Locale,
  string
>;

export function resolveMetadataLocale(locale: string): Locale {
  return routing.locales.find(candidate => candidate === locale) ?? routing.defaultLocale;
}

/** Canonical paths are derived from routes, never from request hosts or room/invite queries. */
export function createPokeLoungeMetadata({
  locale,
  page,
  description,
}: {
  locale: Locale;
  page: MetadataPage;
  description: string;
}) {
  const pathname = page === "root" ? "/" : `/${locale}${pagePaths[page]}`;
  const alternates: { canonical: string; languages: Record<string, string> } | undefined =
    page === "root"
      ? undefined
      : {
          canonical: pathname,
          languages: {
            ...Object.fromEntries(
              routing.locales.map(candidate => [candidate, `/${candidate}${pagePaths[page]}`]),
            ),
            "x-default": `/${routing.defaultLocale}${pagePaths[page]}`,
          },
        };
  // Each segment returns the full nested OG/Twitter objects; Next replaces, rather than deep-merges, them.
  return {
    metadataBase: new URL(POKE_LOUNGE_SITE_ORIGIN),
    title: POKE_LOUNGE_SITE_NAME,
    description,
    alternates,
    openGraph: {
      title: POKE_LOUNGE_SITE_NAME,
      description,
      siteName: POKE_LOUNGE_SITE_NAME,
      type: "website",
      url: pathname,
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter(candidate => candidate !== locale)
        .map(candidate => openGraphLocales[candidate]),
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          type: "image/png",
          alt: POKE_LOUNGE_SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: POKE_LOUNGE_SITE_NAME,
      description,
      images: [{ url: "/og-image.png", alt: POKE_LOUNGE_SITE_NAME }],
    },
  } satisfies Metadata;
}

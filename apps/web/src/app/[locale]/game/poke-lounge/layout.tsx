import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

const openGraphLocales = { "ko-KR": "ko_KR", "en-US": "en_US", "ja-JP": "ja_JP" } as const;

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const resolvedLocale = routing.locales.includes(locale as (typeof routing.locales)[number])
    ? (locale as (typeof routing.locales)[number])
    : routing.defaultLocale;
  const t = await getTranslations({ locale: resolvedLocale, namespace: "Game" });
  const pathname = `/${resolvedLocale}/game/poke-lounge`;

  return {
    title: "Poke Lounge",
    description: t("pokeLoungeDesc"),
    alternates: {
      canonical: pathname,
      languages: Object.fromEntries(
        routing.locales.map(candidate => [candidate, `/${candidate}/game/poke-lounge`]),
      ),
    },
    openGraph: {
      title: "Poke Lounge",
      description: t("pokeLoungeDesc"),
      type: "website",
      url: pathname,
      locale: openGraphLocales[resolvedLocale],
      alternateLocale: routing.locales
        .filter(candidate => candidate !== resolvedLocale)
        .map(candidate => openGraphLocales[candidate]),
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Poke Lounge" }],
    },
  };
}

export default function PokeLoungeLayout({ children }: Props) {
  return children;
}

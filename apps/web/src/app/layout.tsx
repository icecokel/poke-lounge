import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Game");
  const title = "Poke Lounge";
  const description = t("pokeLoungeDesc");

  return {
    metadataBase: new URL("https://poke-lounge.icecoke.kr"),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: "/",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Game");

  return {
    title: "Poke Lounge",
    description: t("pokeLoungeDesc"),
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

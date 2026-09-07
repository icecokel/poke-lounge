import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { getLocalizedPageMetadata } from "@/lib/seo/localized-metadata";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedPageMetadata(await getLocale(), "root");
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="dark">
      <body>{children}</body>
    </html>
  );
}

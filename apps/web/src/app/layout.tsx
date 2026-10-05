import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { getLocalizedPageMetadata } from "@/lib/seo/localized-metadata";
import { ClientDiagnosticsListener } from "@/components/client-diagnostics-listener";
import "./globals.css";

// Declare the light-only document in the initial response, before hydration.
// This also opts out of automatic darkening in browsers that honor color-scheme.
export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#ffffff",
};

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedPageMetadata(await getLocale(), "root");
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} style={{ colorScheme: "only light" }}>
      <body>
        <ClientDiagnosticsListener />
        {children}
      </body>
    </html>
  );
}

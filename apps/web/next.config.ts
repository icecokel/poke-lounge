import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const monorepoRoot = path.resolve(process.cwd(), "../..");

export function normalizeConnectSource(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function toWebSocketConnectSource(value: string | undefined) {
  const origin = normalizeConnectSource(value);
  if (!origin) return undefined;

  const url = new URL(origin);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.origin;
}

export function createConnectSources(apiUrl: string | undefined) {
  const apiOrigin = normalizeConnectSource(apiUrl);
  return ["'self'", apiOrigin, toWebSocketConnectSource(apiOrigin)].filter(
    function filterItem(source): source is string {
      return Boolean(source);
    },
  );
}

const connectSources = createConnectSources(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // This option replaces Next's list. Extend the installed default so other crawlers retain head metadata.
  // Review the installed default list when upgrading Next.
  htmlLimitedBots: new RegExp(
    `${HTML_LIMITED_BOT_UA_RE.source}|kakaotalk-scrap|kakaostory-og-reader`,
    HTML_LIMITED_BOT_UA_RE.flags,
  ),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: {
    tsconfigPath: process.env.NEXT_TYPESCRIPT_CONFIG_PATH ?? "tsconfig.json",
  },
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@poke-lounge/battle"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `connect-src ${connectSources.join(" ")};`,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

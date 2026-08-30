import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const monorepoRoot = path.resolve(process.cwd(), "../..");

export const normalizeConnectSource = (value: string | undefined) => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

export const toWebSocketConnectSource = (value: string | undefined) => {
  const origin = normalizeConnectSource(value);
  if (!origin) return undefined;

  const url = new URL(origin);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.origin;
};

export const createConnectSources = (apiUrl: string | undefined) => {
  const apiOrigin = normalizeConnectSource(apiUrl);
  return ["'self'", apiOrigin, toWebSocketConnectSource(apiOrigin)].filter(
    (source): source is string => Boolean(source),
  );
};

const connectSources = createConnectSources(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  reactStrictMode: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: {
    tsconfigPath: process.env.NEXT_TYPESCRIPT_CONFIG_PATH ?? "tsconfig.json",
  },
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@poke-lounge/battle"],
  webpack(config) {
    config.resolve.alias["@poke-lounge/battle"] = path.join(
      monorepoRoot,
      "packages/poke-lounge-battle/src/browser.ts",
    );
    return config;
  },
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

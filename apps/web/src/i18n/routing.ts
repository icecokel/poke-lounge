import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ko-KR", "en-US", "ja-JP"],
  defaultLocale: "ko-KR",
  localePrefix: "always",
  pathnames: {
    "/game": "/intro",
    "/game/poke-lounge": "/",
  },
});

export type Locale = (typeof routing.locales)[number];

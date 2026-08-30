import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ko-KR", "en-US", "ja-JP"],
  defaultLocale: "ko-KR",
});

export type Locale = (typeof routing.locales)[number];

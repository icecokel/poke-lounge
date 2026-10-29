import type { LeagueLocale } from "../contract";

export function formatKst(ms: number, locale: LeagueLocale): string {
  return `${new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms)} KST`;
}

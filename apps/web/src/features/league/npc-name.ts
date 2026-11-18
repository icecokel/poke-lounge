import type { LeagueOpponentMeta } from "@poke-lounge/battle/league/contract";
import type { LeagueLocale } from "./contract";

const names = {
  lance: { "en-US": "Lance", "ja-JP": "ワタル" },
  karen: { "en-US": "Karen", "ja-JP": "カリン" },
  bruno: { "en-US": "Bruno", "ja-JP": "シバ" },
  koga: { "en-US": "Koga", "ja-JP": "キョウ" },
  will: { "en-US": "Will", "ja-JP": "イツキ" },
} satisfies Record<
  NonNullable<LeagueOpponentMeta["npcKey"]>,
  Record<Exclude<LeagueLocale, "ko-KR">, string>
>;

export function leagueOpponentName(opponent: LeagueOpponentMeta, locale: LeagueLocale): string {
  return opponent.kind === "npc" && opponent.npcKey && locale !== "ko-KR"
    ? names[opponent.npcKey][locale]
    : opponent.displayName;
}

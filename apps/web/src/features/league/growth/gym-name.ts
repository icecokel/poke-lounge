import { localizeTrainerName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale } from "../contract";

const names: Record<string, Record<Exclude<LeagueLocale, "ko-KR">, string>> = {
  비상: { "en-US": "Falkner", "ja-JP": "ハヤト" },
  호일: { "en-US": "Bugsy", "ja-JP": "ツクシ" },
  꼭두: { "en-US": "Whitney", "ja-JP": "アカネ" },
  유빈: { "en-US": "Morty", "ja-JP": "マツバ" },
  사도: { "en-US": "Chuck", "ja-JP": "シジマ" },
  규리: { "en-US": "Jasmine", "ja-JP": "ミカン" },
  류옹: { "en-US": "Pryce", "ja-JP": "ヤナギ" },
  이향: { "en-US": "Clair", "ja-JP": "イブキ" },
};

export function localizeGymName(name: string, locale: LeagueLocale): string {
  return locale === "ko-KR" ? name : (names[name]?.[locale] ?? localizeTrainerName(name, locale));
}

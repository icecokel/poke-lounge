import type { LeagueLocale } from "../contract";
import { leagueText } from "../shell/copy";

export function leagueRoleLabel(
  position: number,
  kind: "npc" | "player",
  locale: LeagueLocale,
): string {
  const role =
    position === 1
      ? leagueText(locale, "챔피언", "Champion", "チャンピオン")
      : leagueText(locale, "사천왕", "Elite Four", "四天王");
  const party =
    kind === "npc" ? "NPC" : leagueText(locale, "등록 파티", "Registered party", "登録パーティ");
  return `${role} · ${party}`;
}

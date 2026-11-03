import type { LeagueLocale } from "../contract";
import { leagueText } from "../shell/copy";

export function getRecordsCopy(locale: LeagueLocale) {
  return {
    standings: leagueText(locale, "현재 순위", "Current standings", "現在の順位"),
    hall: leagueText(locale, "명예의 전당", "Hall of fame", "殿堂入り"),
    mine: leagueText(locale, "내 기록", "My records", "自分の記録"),
    season: leagueText(locale, "시즌", "Season", "シーズン"),
    bestScore: leagueText(locale, "최고 점수", "Best score", "最高得点"),
    bestRank: leagueText(locale, "최고 순위", "Best rank", "最高順位"),
    finalRank: leagueText(locale, "최종 순위", "Final rank", "最終順位"),
    outside: leagueText(locale, "상위 5 진입 없음", "Never in the top five", "上位5位への到達なし"),
    unsettled: leagueText(locale, "정산 전", "Not settled", "集計前"),
    noSeason: leagueText(
      locale,
      "진행 중인 시즌이 없습니다",
      "No current season.",
      "開催中のシーズンはありません。",
    ),
    noHall: leagueText(
      locale,
      "아직 정산된 시즌이 없습니다",
      "No seasons have been settled yet.",
      "集計済みのシーズンはまだありません。",
    ),
    noRecords: leagueText(
      locale,
      "완주 기록이 없습니다",
      "No completed challenges.",
      "完走記録はありません。",
    ),
    me: leagueText(locale, "나", "Me", "自分"),
    reload: leagueText(locale, "다시 불러오기", "Reload", "再読み込み"),
    namesFailed: leagueText(
      locale,
      "포켓몬·기술 이름을 불러오지 못했습니다",
      "Could not load Pokémon and move names.",
      "ポケモン・技の名前を読み込めませんでした。",
    ),
  };
}

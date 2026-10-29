import { useEffect, useState } from "react";
import { LeagueApiError } from "../api/core";
import type { LeagueLocale } from "../contract";
import { getLeagueCopy, leagueText } from "./copy";

export function errorDetail(error: unknown): Record<string, unknown> {
  return error instanceof LeagueApiError && error.detail && typeof error.detail === "object"
    ? (error.detail as Record<string, unknown>)
    : {};
}
export function leagueErrorMessage(error: unknown, locale: LeagueLocale, retrying = false): string {
  const text = getLeagueCopy(locale);
  const code = error instanceof LeagueApiError ? error.code : "NETWORK";
  switch (code) {
    case "LEAGUE_JUDGE_UNAVAILABLE":
      return leagueText(
        locale,
        retrying
          ? "판정 서버가 바쁩니다. 다시 시도 중…"
          : "판정 서버가 바쁩니다. 다시 시도해 주세요.",
        retrying ? "The judge is busy. Retrying…" : "The judge is busy. Please try again.",
        retrying
          ? "判定サーバーが混雑しています。再試行中…"
          : "判定サーバーが混雑しています。再試行してください。",
      );
    case "NETWORK":
    case "LEAGUE_BUSY":
    case "LEAGUE_UNAVAILABLE":
    case "BACKEND_UNAVAILABLE":
      return leagueText(
        locale,
        "리그 서버가 혼잡합니다",
        "The league server is busy.",
        "リーグサーバーが混雑しています。",
      );
    case "OUTCOME_UNKNOWN":
      return leagueText(
        locale,
        "응답을 확인하지 못했습니다. 같은 요청으로 다시 제출할 수 있습니다.",
        "The response is unknown. You can resubmit the same request.",
        "応答を確認できませんでした。同じリクエストを再送信できます。",
      );
    case "LEAGUE_RATE_LIMITED":
      return leagueText(
        locale,
        "요청이 많습니다. 1분 뒤 다시 시도하세요",
        "Too many requests. Try again in one minute.",
        "リクエストが多すぎます。1分後に再試行してください。",
      );
    case "LEAGUE_UNAUTHORIZED":
      return leagueText(
        locale,
        "다시 로그인해 주세요",
        "Please log in again.",
        "再度ログインしてください。",
      );
    case "LEAGUE_SEASON_NOT_OPEN":
      return leagueText(
        locale,
        "현재 시즌은 입장할 수 없습니다. 홈에서 시즌 단계를 확인하세요.",
        "Entry is closed. Check the season phase at home.",
        "現在は入場できません。ホームでシーズン状況を確認してください。",
      );
    case "LEAGUE_RUN_NOT_ACTIVE":
    case "LEAGUE_BADGES_REQUIRED":
      return leagueText(
        locale,
        "성장 상태와 배지 8개를 확인해 주세요",
        "Check your training status and eight badges.",
        "育成状態とバッジ8個を確認してください。",
      );
    case "LEAGUE_PARTY_INVALID":
    case "LEAGUE_PARTY_IMPLAUSIBLE":
      return `${leagueText(locale, "파티 확인 실패", "Party validation failed", "パーティ確認失敗")} · ${JSON.stringify(errorDetail(error).reasons ?? [])}`;
    case "LEAGUE_ENGINE_VERSION_MISMATCH":
      return text.version;
    case "LEAGUE_ENGINE_RETIRED":
      return text.retired;
    case "LEAGUE_ATTEMPT_EXPIRED":
      return text.expired;
    case "LEAGUE_STATE_MISMATCH":
      return leagueText(
        locale,
        "시작 상태가 달라 서버 상태로 다시 시작합니다",
        "The starting state changed. Restarting from the server state.",
        "開始状態が異なります。サーバーの状態から再開します。",
      );
    case "LEAGUE_INPUT_REJECTED":
      return leagueText(
        locale,
        "제출이 거절되었습니다. 도전 상태를 다시 확인합니다(5회 거절 시 도전 종료).",
        "Submission rejected. Checking challenge status (five rejections end the challenge).",
        "送信が拒否されました。挑戦の状態を再確認します（5回で挑戦終了）。",
      );
    case "LEAGUE_ATTEMPT_ACTIVE":
      return text.resume;
    case "LEAGUE_ATTEMPT_NOT_ACTIVE":
    case "LEAGUE_NOT_FOUND":
      return leagueText(
        locale,
        "도전 상태를 홈에서 다시 확인해 주세요",
        "Check the challenge status at home.",
        "ホームで挑戦の状態を再確認してください。",
      );
    default:
      return leagueText(
        locale,
        "서버 오류가 발생했습니다. 잠시 뒤 다시 시도하세요",
        "A server error occurred. Please try again later.",
        "サーバーエラーが発生しました。しばらくしてから再試行してください。",
      );
  }
}
export function useRateLimitCooldown(error: unknown): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!(error instanceof LeagueApiError) || error.status !== 429) {
      setBlocked(false);
      return;
    }
    setBlocked(true);
    const timer = window.setTimeout(() => setBlocked(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [error]);
  return blocked;
}

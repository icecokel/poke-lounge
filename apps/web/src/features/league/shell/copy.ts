import type { LeagueLocale } from "../contract";

export function leagueText(locale: LeagueLocale, ko: string, en: string, ja: string): string {
  return locale === "ko-KR" ? ko : locale === "ja-JP" ? ja : en;
}
const messages = {
  title: ["리그", "League", "リーグ"],
  loading: ["불러오는 중…", "Loading…", "読み込み中…"],
  closed: ["리그가 열려 있지 않습니다", "The league is not open.", "リーグは開催されていません。"],
  firstScreen: ["첫 화면으로", "Back to start", "最初の画面へ"],
  home: ["홈으로", "League home", "ホームへ"],
  retry: ["다시 시도", "Try again", "再試行"],
  refresh: ["새로 고침", "Refresh", "再読み込み"],
  cancel: ["취소", "Cancel", "キャンセル"],
  confirm: ["확인", "Confirm", "確認"],
  version: [
    "새 버전이 배포되었습니다. 새로 고침해 주세요",
    "A new version is available. Please refresh.",
    "新しいバージョンが公開されました。再読み込みしてください。",
  ],
  resume: ["도전 이어 하기", "Resume challenge", "挑戦を再開"],
  enter: ["리그 입장", "Enter league", "リーグに入場"],
  grow: ["성장 시작", "Start training", "育成を開始"],
  continueGrowth: ["성장 계속", "Continue training", "育成を続ける"],
  unnamed: ["미설정", "Not set", "未設定"],
  badges: ["배지", "Badges", "バッジ"],
  best: [
    "시즌 최고 점수 / 최고 순위",
    "Season best score / best rank",
    "シーズン最高得点 / 最高順位",
  ],
  standings: ["상위 5", "Top five", "上位5人"],
  score: ["점수", "Score", "得点"],
  rank: ["순위", "Rank", "順位"],
  outside: ["순위 밖", "Outside top five", "ランク外"],
  expired: [
    "시즌 마감으로 도전이 만료되었습니다(기록 없음, 성장 유지)",
    "The challenge expired at the season deadline. No record; training is kept.",
    "シーズン締切で挑戦が失効しました。記録なし、育成は維持されます。",
  ],
  retired: [
    "서버 업데이트로 도전이 무효가 되었습니다. 배지가 복구되었습니다",
    "A server update voided the challenge. Your badges were restored.",
    "サーバー更新により挑戦が無効になりました。バッジは復元されました。",
  ],
  disclosure: [
    "경기 조건(시드·상대 파티)이 브라우저에 공개되는 방식입니다. 경기별 급소·빗나감 통계를 기록해 이상치를 검토합니다.",
    "Match conditions (seed and opponent party) are exposed to the browser. Critical hits and misses are recorded per match for anomaly review.",
    "試合条件（シード・相手パーティ）はブラウザーに公開されます。試合ごとの急所・命中失敗を記録し、異常値を確認します。",
  ],
} as const;
export function getLeagueCopy(locale: LeagueLocale) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  return Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof messages, string>;
}

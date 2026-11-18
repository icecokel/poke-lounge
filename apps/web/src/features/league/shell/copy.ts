import type { LeagueLocale } from "../contract";

export function leagueText(locale: LeagueLocale, ko: string, en: string, ja: string): string {
  return locale === "ko-KR" ? ko : locale === "ja-JP" ? ja : en;
}
const messages = {
  title: ["리그", "League", "リーグ"],
  loading: ["불러오는 중…", "Loading…", "読み込み中…"],
  demo: [
    "프리리그 · 마감 없음. 정식 시즌이 시작되면 기록이 초기화됩니다",
    "Pre-league · No deadline. Records will be reset when the official season begins.",
    "プレリーグ · 締切なし。正式シーズンが始まると記録はリセットされます。",
  ],
  guest: ["게스트", "Guest", "ゲスト"],
  guestStart: ["로그인 없이 시작", "Start without logging in", "ログインせずに始める"],
  guestStarting: ["시작하는 중…", "Starting…", "開始中…"],
  guestRegister: [
    "로그인 없이 시작하거나 디스코드로 트레이너 등록을 할 수 있어.",
    "You can start without logging in or register with Discord.",
    "ログインせずに始めるか、Discordでトレーナー登録ができるよ。",
  ],
  guestNotice: [
    "프리리그는 로그인 없이 플레이할 수 있어요. 진행은 이 브라우저에만 저장되어, 브라우저 데이터를 지우거나 다른 기기에서는 이어서 할 수 없어요. 정식 시즌이 시작되면 기록이 초기화됩니다.",
    "You can play the pre-league without logging in. Your progress is tied to this browser, so you cannot continue after clearing browser data or on another device. Records will be reset when the official season begins.",
    "プレリーグはログインせずにプレイできます。進行はこのブラウザーにのみ保存されるため、ブラウザーのデータを削除したり、別の端末を使ったりすると続きからプレイできません。正式シーズンが始まると記録はリセットされます。",
  ],
  guestAccountNotice: [
    "이 브라우저에서만 이어서 할 수 있어요. 데이터 삭제·로그아웃 후에는 복구할 수 없고, 정식 시즌이 시작되면 초기화돼요.",
    "You can continue only in this browser. Clearing browser data or logging out loses access. Records reset when the official season begins.",
    "続きからプレイできるのはこのブラウザーだけです。データの削除やログアウト後は戻れず、正式シーズンが始まると記録はリセットされます。",
  ],
  guestDiscordNotice: [
    "Discord로 로그인하면 별도 진행으로 시작돼요.",
    "Logging in with Discord starts separate progress.",
    "Discordでログインすると、ゲストとは別の進行で始まります。",
  ],
  guestLogoutTitle: [
    "게스트에서 로그아웃할까요?",
    "Log out as a guest?",
    "ゲストからログアウトしますか？",
  ],
  guestLogoutDescription: [
    "로그아웃하면 이 게스트 진행을 다시 이어서 할 수 없어요.",
    "Once you log out, you cannot return to this guest's progress.",
    "ログアウトすると、このゲストの進行には戻れません。",
  ],
  noDeadline: ["마감 없음", "No deadline", "締切なし"],
  preLeagueReset: [
    "정식 시즌이 시작되면 기록이 초기화됩니다",
    "Records will be reset when the official season begins.",
    "正式シーズンが始まると記録はリセットされます。",
  ],
  preLeagueNoSettlement: [
    "프리리그는 정산하지 않아 명예의 전당과 최종 순위를 남기지 않습니다",
    "The pre-league is not settled, so it has no hall of fame or final ranks.",
    "プレリーグは集計を行わないため、殿堂入りと最終順位は記録されません。",
  ],
  demoClose: ["안내 닫기", "Dismiss notice", "お知らせを閉じる"],
  closed: ["리그가 열려 있지 않습니다", "The league is not open.", "リーグは開催されていません。"],
  firstScreen: ["첫 화면으로", "Back to start", "最初の画面へ"],
  home: ["홈으로", "League home", "ホームへ"],
  account: ["계정 / 로그아웃", "Account / log out", "アカウント / ログアウト"],
  logout: ["로그아웃", "Log out", "ログアウト"],
  logoutTitle: [
    "디스코드에서 로그아웃할까요?",
    "Log out of Discord?",
    "Discordからログアウトしますか？",
  ],
  logoutDescription: [
    "이 브라우저의 디스코드 계정 세션을 종료합니다.",
    "This ends your Discord account session in this browser.",
    "このブラウザーのDiscordアカウントセッションを終了します。",
  ],
  loggingOut: ["로그아웃 중…", "Logging out…", "ログアウト中…"],
  logoutFailed: [
    "로그아웃하지 못했습니다. 다시 시도해 주세요.",
    "Could not log out. Please try again.",
    "ログアウトできませんでした。もう一度お試しください。",
  ],
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
  records: ["순위·기록", "Standings & records", "順位・記録"],
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

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
    "프리리그는 로그인 없이 플레이할 수 있어요. 진행은 이 브라우저에 연결되며, 계정 메뉴에서 이어하기 코드를 받아 두면 다른 기기에서도 이어 할 수 있어요. 정식 시즌이 시작되면 기록이 초기화됩니다.",
    "You can play the pre-league without logging in. Your progress is linked to this browser. Save a resume code from the account menu to continue on another device. Records will be reset when the official season begins.",
    "プレリーグはログインせずにプレイできます。進行はこのブラウザーに紐づきます。アカウントメニューで再開コードを控えておくと、別の端末でも続きからプレイできます。正式シーズンが始まると記録はリセットされます。",
  ],
  guestAccountNotice: [
    "이어하기 코드를 받아 두면 다른 기기에서도 최신 진행을 이어 할 수 있어요. 브라우저 데이터와 코드를 모두 잃으면 복구할 수 없고, 정식 시즌이 시작되면 기록과 코드가 초기화돼요.",
    "Save a resume code to continue your latest progress on another device. If you lose both browser data and the code, access cannot be recovered. Records and codes reset when the official season begins.",
    "再開コードを控えておくと、別の端末でも最新の進行から再開できます。ブラウザーのデータとコードを両方失うと復旧できません。正式シーズンが始まると記録とコードはリセットされます。",
  ],
  guestResumeInput: ["이어하기 코드 입력", "Enter resume code", "再開コードを入力"],
  guestResumeHelp: [
    "영문·숫자 12자예요. 하이픈·공백이 있어도 돼요. 최신 진행에서 이어 해요.",
    "12 letters and numbers. Hyphens and spaces are optional. Continue from your latest progress.",
    "英数字12文字です。ハイフンや空白は省略できます。最新の進行から再開します。",
  ],
  guestResumeSubmit: ["이어하기", "Continue", "続きからプレイ"],
  guestResumeInvalid: [
    "코드를 다시 확인해 주세요.",
    "Please check your code and try again.",
    "コードをもう一度確認してください。",
  ],
  guestResumeRateLimited: [
    "이어하기 코드 입력 시도가 너무 많아요. 한 시간 뒤 다시 시도해 주세요.",
    "Too many resume code attempts. Please try again in an hour.",
    "再開コードの入力回数が多すぎます。1時間後にもう一度お試しください。",
  ],
  guestCodeGet: ["이어하기 코드 받기", "Get resume code", "再開コードを取得"],
  guestCodeNew: ["새 코드 받기", "Get new code", "新しいコードを取得"],
  guestCodeLabel: ["이어하기 코드", "Resume code", "再開コード"],
  guestCodeWarning: [
    "이 코드를 아는 사람은 누구나 이 진행으로 플레이할 수 있어요. 다른 사람에게 보여 주지 마세요.",
    "Anyone who knows this code can play with this progress. Do not share it with others.",
    "このコードを知っている人は誰でもこの進行でプレイできます。他の人に見せないでください。",
  ],
  guestCodeRotateNotice: [
    "코드를 새로 받으면 예전 코드는 쓸 수 없어요.",
    "Getting a new code invalidates the previous code.",
    "新しいコードを取得すると、以前のコードは使えなくなります。",
  ],
  guestCodeOnce: [
    "이 화면을 떠나면 코드를 다시 볼 수 없어요. 지금 복사해 안전한 곳에 보관해 주세요.",
    "You cannot view this code again after leaving this screen. Copy it now and store it safely.",
    "この画面を離れるとコードは再表示できません。今コピーして安全な場所に保管してください。",
  ],
  guestCodeConfirm: [
    "새 코드를 받을까요?",
    "Get a new resume code?",
    "新しい再開コードを取得しますか？",
  ],
  guestCodeCopy: ["복사", "Copy", "コピー"],
  guestCodeCopied: ["복사했어요.", "Copied.", "コピーしました。"],
  guestCodeCopyFailed: [
    "복사하지 못했어요. 선택된 코드를 직접 복사해 주세요.",
    "Could not copy. Please copy the selected code manually.",
    "コピーできませんでした。選択されたコードを手動でコピーしてください。",
  ],
  guestDiscordNotice: [
    "Discord로 로그인하면 별도 진행으로 시작돼요.",
    "Logging in with Discord starts separate progress.",
    "Discordでログインすると、ゲストとは別の進行で始まります。",
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
  unnamed: ["이름 없음", "No name", "名前なし"],
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

import type { LeagueLocale } from "../contract";

const messages = {
  warning: [
    "테스트 모드 — 로컬 설정값으로 바꾼 규칙입니다. 운영 조건 확인이 아닙니다.",
    "Test mode — rules use local settings. This does not verify production conditions.",
    "テストモード — ローカル設定で変更したルールです。本番条件の確認ではありません。",
  ],
  serverMismatch: [
    "웹은 테스트 모드인데 서버는 일반 모드입니다",
    "The web app is in test mode, but the server is in normal mode.",
    "ウェブはテストモードですが、サーバーは通常モードです。",
  ],
  starter: ["스타터", "Starter", "最初のポケモン"],
  unchanged: ["대체 없음", "unchanged", "変更なし"],
  badges: ["입장 배지", "Entry badges", "入場バッジ"],
  badgeUnit: ["개", "", "個"],
  opponents: ["리그 상대 레벨", "League opponent levels", "リーグの相手レベル"],
  accounts: [
    "테스트 계정(로컬 전용)",
    "Test accounts (local only)",
    "テストアカウント（ローカル専用）",
  ],
  account: ["테스트", "Test", "テスト"],
  loggingIn: ["로그인 중", "Logging in", "ログイン中"],
  loginUnavailable: [
    "웹 서버에 테스트 로그인 설정이 없습니다(pnpm dev:rust --league-test로 다시 실행)",
    "Test login is not configured on the web server (restart with pnpm dev:rust --league-test).",
    "ウェブサーバーにテストログイン設定がありません（pnpm dev:rust --league-testで再起動）。",
  ],
  localhostRequired: [
    "주소창을 http://localhost:…로 열어 주세요",
    "Open http://localhost:… in the address bar.",
    "アドレスバーでhttp://localhost:…を開いてください。",
  ],
  loginFailed: ["로그인하지 못했습니다", "Could not log in.", "ログインできませんでした。"],
  retry: ["다시 시도", "Try again", "再試行"],
} as const;

export function getTestModeCopy(locale: LeagueLocale) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  return Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof messages, string>;
}

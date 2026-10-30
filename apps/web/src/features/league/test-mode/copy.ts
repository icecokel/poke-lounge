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
} as const;

export function getTestModeCopy(locale: LeagueLocale) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  return Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof messages, string>;
}

import type { PokeLoungeLocale } from "../poke-lounge-copy";
import type { AccountProvider } from "../runtime/game/network/account-session";

const messages = {
  discord: {
    title: [
      "디스코드에서 로그아웃할까요?",
      "Log out of Discord?",
      "Discordからログアウトしますか？",
    ],
    description: [
      "이 브라우저의 디스코드 계정 세션을 종료합니다.",
      "This ends your Discord account session in this browser.",
      "このブラウザーのDiscordアカウントセッションを終了します。",
    ],
  },
  guest: {
    title: ["게스트에서 로그아웃할까요?", "Log out as a guest?", "ゲストからログアウトしますか？"],
    description: [
      "로그아웃하면 이 게스트 진행을 다시 이어서 할 수 없어요.",
      "Once you log out, you cannot return to this guest's progress.",
      "ログアウトすると、このゲストの進行には戻れません。",
    ],
  },
  agent: {
    title: [
      "운영 테스트 계정에서 로그아웃할까요?",
      "Log out of the operator test account?",
      "運用テストアカウントからログアウトしますか？",
    ],
    description: [
      "이 브라우저의 운영 테스트 계정 세션을 종료합니다.",
      "This ends your operator test account session in this browser.",
      "このブラウザーの運用テストアカウントセッションを終了します。",
    ],
  },
  test: {
    title: [
      "로컬 테스트 계정에서 로그아웃할까요?",
      "Log out of the local test account?",
      "ローカルテストアカウントからログアウトしますか？",
    ],
    description: [
      "이 브라우저의 로컬 테스트 계정 세션을 종료합니다.",
      "This ends your local test account session in this browser.",
      "このブラウザーのローカルテストアカウントセッションを終了します。",
    ],
  },
} as const;

export function getAccountLogoutCopy(locale: PokeLoungeLocale, provider: AccountProvider) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  const text = messages[provider];
  return { title: text.title[index], description: text.description[index] };
}

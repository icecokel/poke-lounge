import type { LeagueLocale } from "../contract";

// What the lounge guide says at the league front desk.
const messages = {
  opening: [
    "리그 접수처를 여는 중이야…",
    "Opening the League front desk…",
    "リーグ受付を開いているよ…",
  ],
  closed: [
    "지금은 리그가 열려 있지 않아. 다음 시즌에 다시 와 줘!",
    "The League isn't open right now. Come back next season!",
    "今はリーグが開いていないんだ。次のシーズンにまた来てね！",
  ],
  welcome: [
    "포케 라운지 리그에 온 걸 환영해!",
    "Welcome to the Poke Lounge League!",
    "ポケラウンジリーグへようこそ！",
  ],
  register: [
    "먼저 디스코드로 트레이너 등록을 하자.",
    "First, let's register you as a trainer with Discord.",
    "まずはDiscordでトレーナー登録をしよう。",
  ],
  discordWhy: [
    "리그 진행과 순위는 디스코드 계정에 저장돼. 어느 기기에서든 이어서 도전할 수 있어.",
    "Your League progress and ranking are saved to your Discord account, so you can continue on any device.",
    "リーグの進行と順位はDiscordアカウントに保存されるよ。どの端末からでも続きから挑戦できるんだ。",
  ],
  account: [
    "다른 계정으로 바꾸고 싶니?",
    "Want to switch accounts?",
    "別のアカウントに切り替える？",
  ],
  trouble: [
    "앗, 접수처에 문제가 생겼어.",
    "Oops, something went wrong at the front desk.",
    "あっ、受付で問題が起きたみたい。",
  ],
  nicknameLead: [
    "리그에서는 따로 쓰는 이름이 있어.",
    "The League uses its own trainer name.",
    "リーグでは専用の名前を使うんだ。",
  ],
  nicknameLine: [
    "리그에서 불릴 이름을 알려 줘!",
    "What name should the League call you?",
    "リーグで呼ばれる名前を教えて！",
  ],
  starterLead: [
    "이번 시즌 파트너 후보는 이 아이들이야.",
    "These are this season's partner candidates.",
    "今シーズンのパートナー候補はこの子たちだよ。",
  ],
  starterLine: [
    "함께 리그를 향할 파트너를 골라 줘!",
    "Pick the partner who'll head for the League with you!",
    "一緒にリーグを目指すパートナーを選んで！",
  ],
} as const;

export function getGuideCopy(locale: LeagueLocale) {
  const index = locale === "ko-KR" ? 0 : locale === "ja-JP" ? 2 : 1;
  return Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof messages, string>;
}

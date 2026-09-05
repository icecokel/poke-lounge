import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";
const COPY = {
  "ko-KR": {
    title: "게임 시작 전 조작법",
    open: "조작법 보기",
    close: "참가자 보기",
    keyboard: "키보드",
    touch: "터치",
    description:
      "준비하는 동안 필드와 전투 조작을 확인하세요. 게임 중에도 도움말로 다시 볼 수 있습니다.",
    touchHint: "기술·아이템은 화면의 버튼을 직접 눌러 선택할 수도 있습니다.",
  },
  "en-US": {
    title: "Controls before you play",
    open: "View controls",
    close: "View players",
    keyboard: "Keyboard",
    touch: "Touch",
    description:
      "Review field and battle controls while waiting. Help is also available during play.",
    touchHint: "You can also tap move and item buttons directly to select them.",
  },
  "ja-JP": {
    title: "ゲーム開始前の操作方法",
    open: "操作方法を見る",
    close: "参加者を見る",
    keyboard: "キーボード",
    touch: "タッチ",
    description:
      "待機中にフィールドとバトルの操作を確認できます。ゲーム中もヘルプから確認できます。",
    touchHint: "技や道具は画面のボタンを直接タップしても選べます。",
  },
};
export function getRoomControlsCopy(locale?: string | null) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

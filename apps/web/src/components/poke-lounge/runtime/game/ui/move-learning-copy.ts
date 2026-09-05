import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";
const COPY = {
  "ko-KR": {
    title: "새로운 기술!",
    learned: "기술 습득 완료!",
    confirmTitle: "이 기술로 교체할까요?",
    confirm: "교체 승인",
    cancel: "다시 선택",
    next: "확인",
    oldMove: "잊을 기술",
    newMove: "배울 기술",
    hint: "선택만으로는 바뀌지 않습니다. 다음 화면에서 승인해야 교체됩니다.",
    confirmHint: "승인하면 선택한 기존 기술을 잊습니다. 다시 선택하면 변경되지 않습니다.",
    question: function question(pokemon: string, oldMove: string, newMove: string) {
      return `${pokemon}의 「${oldMove}」 기술을 잊고 「${newMove}」 기술을 배울까요?`;
    },
  },
  "en-US": {
    title: "A new move!",
    learned: "New move learned!",
    confirmTitle: "Replace this move?",
    confirm: "Approve replacement",
    cancel: "Choose again",
    next: "Continue",
    oldMove: "Move to forget",
    newMove: "Move to learn",
    hint: "Selecting a move does not replace it. Approve the change on the next screen.",
    confirmHint: "Approving forgets the selected move. Choose again to keep your moves unchanged.",
    question: function question(pokemon: string, oldMove: string, newMove: string) {
      return `Should ${pokemon} forget ${oldMove} and learn ${newMove}?`;
    },
  },
  "ja-JP": {
    title: "新しい技！",
    learned: "技を覚えた！",
    confirmTitle: "この技を入れ替えますか？",
    confirm: "入れ替えを承認",
    cancel: "選び直す",
    next: "確認",
    oldMove: "忘れる技",
    newMove: "覚える技",
    hint: "選択だけでは変更されません。次の画面で承認すると入れ替わります。",
    confirmHint: "承認すると選んだ技を忘れます。選び直す場合は変更されません。",
    question: function question(pokemon: string, oldMove: string, newMove: string) {
      return `${pokemon}は「${oldMove}」を忘れて「${newMove}」を覚えますか？`;
    },
  },
};
export function getMoveLearningCopy(locale?: string | null) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

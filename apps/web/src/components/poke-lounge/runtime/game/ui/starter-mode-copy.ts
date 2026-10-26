import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";

const COPY = {
  "ko-KR": {
    label: "게임 모드",
    modes: {
      classic: "클래식 모드",
      random: "랜덤 모드",
    },
    descriptions: {
      classic: "기존 스타팅 포켓몬 6마리 중 선택합니다.",
      random: "트레이너별로 랜덤 추첨한 포켓몬 5마리와 정체를 숨긴 물음표 1마리 중 선택합니다.",
    },
    pool: "보이는 5마리는 진화 초기 포켓몬이고, 물음표는 진화 단계와 관계없이 나오고 Lv.15로 시작합니다. 전설·환상은 제외합니다.",
  },
  "en-US": {
    label: "Game mode",
    modes: {
      classic: "Classic mode",
      random: "Random mode",
    },
    descriptions: {
      classic: "Choose from the six original starter Pokémon.",
      random:
        "Each trainer chooses from five Pokémon drawn at random or one hidden mystery Pokémon.",
    },
    pool: "The five shown are unevolved; the mystery Pokémon can be any evolution stage and starts at Lv. 15. Legendary and Mythical Pokémon are excluded.",
  },
  "ja-JP": {
    label: "ゲームモード",
    modes: {
      classic: "クラシックモード",
      random: "ランダムモード",
    },
    descriptions: {
      classic: "従来の最初のポケモン6匹から選びます。",
      random: "トレーナーごとにランダムに選ばれた5匹と、正体を隠した「？」1匹から選びます。",
    },
    pool: "表示される5匹は進化前のポケモンで、「？」は進化段階を問わず、Lv.15で始まります。伝説・幻のポケモンは含まれません。",
  },
};

export function getStarterModeCopy(locale: string) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

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
      random: "트레이너별로 랜덤 추첨한 포켓몬 3마리 중 선택합니다.",
    },
    pool: "진화 초기 포켓몬만 등장하며, 전설·환상은 제외합니다.",
  },
  "en-US": {
    label: "Game mode",
    modes: {
      classic: "Classic mode",
      random: "Random mode",
    },
    descriptions: {
      classic: "Choose from the six original starter Pokémon.",
      random: "Each trainer chooses from three Pokémon drawn at random.",
    },
    pool: "Random choices exclude evolved, Legendary, and Mythical Pokémon.",
  },
  "ja-JP": {
    label: "ゲームモード",
    modes: {
      classic: "クラシックモード",
      random: "ランダムモード",
    },
    descriptions: {
      classic: "従来の最初のポケモン6匹から選びます。",
      random: "トレーナーごとにランダムに選ばれた3匹から選びます。",
    },
    pool: "ランダム候補には進化後・伝説・幻のポケモンは含まれません。",
  },
};

export function getStarterModeCopy(locale: string) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

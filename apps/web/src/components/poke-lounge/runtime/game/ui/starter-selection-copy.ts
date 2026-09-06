import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";
import type { StarterType } from "../../types";

const COPY = {
  "ko-KR": {
    roster: "함께할 포켓몬",
    count: (count: number) => `${count}마리`,
    selected: "선택한 파트너",
    missingImage: "이미지 없음",
    starting: "파트너와 출발하는 중…",
    chooseFailed: "선택을 완료하지 못했습니다. 다시 시도해 주세요.",
    types: { Fire: "불꽃", Grass: "풀", Water: "물" },
  },
  "en-US": {
    roster: "Your possible partners",
    count: (count: number) => `${count} Pokémon`,
    selected: "Selected partner",
    missingImage: "Image unavailable",
    starting: "Starting your adventure…",
    chooseFailed: "Your selection could not be completed. Please try again.",
    types: { Fire: "Fire", Grass: "Grass", Water: "Water" },
  },
  "ja-JP": {
    roster: "いっしょに旅するポケモン",
    count: (count: number) => `${count}匹`,
    selected: "選んだパートナー",
    missingImage: "画像なし",
    starting: "パートナーと出発中…",
    chooseFailed: "選択を完了できませんでした。もう一度お試しください。",
    types: { Fire: "ほのお", Grass: "くさ", Water: "みず" },
  },
};

export function getStarterSelectionCopy(locale: string) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

export function getStarterTypeLabel(type: StarterType, locale: string): string {
  return getStarterSelectionCopy(locale).types[type];
}

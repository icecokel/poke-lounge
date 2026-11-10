import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";

const COPY = {
  "ko-KR": {
    me: "나",
    bracketPending: "대진 배정 중",
    bracket: {
      reveal: "전체 대진 공개",
      match: "내 첫 상대",
      spectator: "관전 경기",
      eliminated: "탈락 · 관전 중",
      route: "우승까지",
      next: "다음 상대 후보",
      automatic: "잠시 후 자동으로 전투가 시작됩니다",
      opponent: "상대",
      waiting: "다음 경기를 기다립니다",
    },
    round: {
      countdown: "탐험 남은 시간",
      running: "토너먼트 진행 중",
      result: "라운드 결과",
      waiting: "라운드 대기",
      readyToStart: "출발 준비",
    },
  },
  "en-US": {
    me: "YOU",
    bracketPending: "Waiting for bracket",
    bracket: {
      reveal: "Bracket revealed",
      match: "Your first opponent",
      spectator: "Spectator match",
      eliminated: "Eliminated · spectating",
      route: "Road to the trophy",
      next: "Next opponent candidates",
      automatic: "The battle starts automatically",
      opponent: "Opponent",
      waiting: "Waiting for the next match",
    },
    round: {
      countdown: "Exploration remaining",
      running: "Tournament in progress",
      result: "Round results",
      waiting: "Waiting for round",
      readyToStart: "Ready to start",
    },
  },
  "ja-JP": {
    me: "自分",
    bracketPending: "組み合わせ待機中",
    bracket: {
      reveal: "組み合わせ発表",
      match: "最初の対戦相手",
      spectator: "観戦試合",
      eliminated: "敗退 · 観戦中",
      route: "優勝への道",
      next: "次の相手候補",
      automatic: "まもなく自動でバトルが始まります",
      opponent: "相手",
      waiting: "次の試合を待っています",
    },
    round: {
      countdown: "探索の残り時間",
      running: "トーナメント進行中",
      result: "ラウンド結果",
      waiting: "待機中",
      readyToStart: "出発準備",
    },
  },
};

export function getTournamentCopy(locale?: string | null) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

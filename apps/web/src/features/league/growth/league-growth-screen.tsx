"use client";

import type { LeagueGrowthScreenProps } from "../contract";

export function LeagueGrowthScreen({ onExit }: LeagueGrowthScreenProps) {
  return (
    <div>
      <p>성장 화면 준비 중</p>
      <button type="button" onClick={() => onExit("home")}>
        홈으로
      </button>
    </div>
  );
}

"use client";
import {
  POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
  TOURNAMENT_CELEBRATION_DURATION_MS,
} from "@poke-lounge/battle/timing";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/game-state-store";
import { getRoundCountdown, getTournamentCelebrationKey } from "./tournament-feedback-model";

export function RoundCountdown({
  copy,
  gameStateStore,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
}) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const countdown = getRoundCountdown(state, now);
  const text =
    copy.locale === "ko-KR"
      ? {
          countdown: "토너먼트까지",
          running: "토너먼트 진행 중",
          result: "라운드 결과",
          waiting: "라운드 대기",
        }
      : copy.locale === "ja-JP"
        ? {
            countdown: "トーナメントまで",
            running: "トーナメント進行中",
            result: "ラウンド結果",
            waiting: "待機中",
          }
        : {
            countdown: "Tournament in",
            running: "Tournament in progress",
            result: "Round results",
            waiting: "Waiting for round",
          };
  const label = countdown.waitingForStart
    ? copy.locale === "ko-KR"
      ? "출발 준비"
      : copy.locale === "ja-JP"
        ? "出発準備"
        : "Ready to start"
    : countdown.preparing
      ? text.countdown
      : state.round.phase === "tournament"
        ? text.running
        : state.round.phase === "round-result" || state.round.phase === "game-result"
          ? text.result
          : text.waiting;
  return (
    <div
      className="pointer-events-none absolute top-2 left-1/2 z-80 flex w-max max-w-[48%] -translate-x-1/2 items-center gap-2 rounded-md border-2 border-[var(--pl-color-gold)] bg-[var(--pl-color-ink)] px-3 py-[7px] text-[clamp(10px,1vw,14px)] leading-[1.2] text-white shadow-[0_3px_0_rgb(0_0_0_/_25%)] data-[urgent=true]:border-[#ffae84] [&>span]:text-[0.8em] [&>span]:opacity-85 [&_time]:text-[1.35em] [&_time]:font-black [&_time]:tabular-nums [&_time]:text-[#a7e5ff] data-[urgent=true]:[&_time]:text-[#ffae84]"
      data-poke-lounge-round-countdown
      data-urgent={countdown.urgent || undefined}
    >
      <span>
        ROUND {Math.max(1, state.round.roundIndex)} / {state.round.totalRounds}
      </span>
      <strong>{label}</strong>
      {countdown.preparing ? (
        <time role="timer" aria-label={`${label} ${countdown.timer}`}>
          {countdown.timer}
        </time>
      ) : null}
    </div>
  );
}

export function TournamentCelebration({ gameStateStore }: { gameStateStore: GameStateStore }) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const key = getTournamentCelebrationKey(state);
  const lastPlayed = useRef<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => {
    if (key && lastPlayed.current !== key) {
      lastPlayed.current = key;
      setActiveKey(key);
    }
  }, [key]);
  useEffect(() => {
    if (!activeKey) return;
    const timer = window.setTimeout(() => setActiveKey(null), TOURNAMENT_CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeKey]);
  if (!activeKey) return null;
  return (
    <div
      key={activeKey}
      className="pointer-events-none absolute inset-0 z-[10000] overflow-hidden [contain:strict] motion-reduce:hidden [&>i]:absolute [&>i]:top-[-20px] [&>i]:left-[var(--confetti-x)] [&>i]:h-[14px] [&>i]:w-[9px] [&>i]:animate-[tournament-confetti-fall_var(--confetti-duration)_var(--confetti-delay)_linear_both] [&>i]:bg-[#ffcf55] [&>i]:opacity-0 [&>i:nth-child(4n+1)]:bg-[#6dd5ff] [&>i:nth-child(4n+2)]:bg-[#ff879a] [&>i:nth-child(4n+3)]:rounded-full [&>i:nth-child(4n+3)]:bg-[#a3eb82]"
      data-poke-lounge-tournament-confetti
      aria-hidden="true"
    >
      {Array.from({ length: 56 }, (_, index) => (
        <i
          key={index}
          style={
            {
              "--confetti-x": `${(index * 37) % 100}%`,
              "--confetti-drift": `${((index * 29) % 240) - 120}px`,
              "--confetti-delay": `${(index % 8) * 110}ms`,
              "--confetti-duration": `${2600 + (index % 5) * 220}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

"use client";
import {
  POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
  TOURNAMENT_CELEBRATION_DURATION_MS,
} from "@poke-lounge/battle/timing";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/game-state-store";
import { getRoundCountdown, getTournamentCelebrationKey } from "./tournament-feedback-model";
import styles from "../../../poke-lounge.module.css";

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
      className={styles.roundCountdown}
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
      className={styles.tournamentConfetti}
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

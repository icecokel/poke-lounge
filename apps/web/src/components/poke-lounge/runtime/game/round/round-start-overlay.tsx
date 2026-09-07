"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getRoundStartCount, isRoundStartBlocked } from "@poke-lounge/battle/round-start";
import { getProjectedRoundStartPosition } from "../starter-selection-flow";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/game-state-store";
import type { WorldFrameStore } from "../world/world-frame-store";
import styles from "./round-start.module.css";

export function RoundStartOverlay({
  copy,
  gameStateStore,
  frameStore,
  onPreparationReady,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  frameStore: WorldFrameStore;
  onPreparationReady?: (roundIndex: number) => Promise<void>;
}) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const projection = state.tournament.serverProjection;
  const [now, setNow] = useState(() => Date.now());
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pending =
    projection?.roomStatus === "round-started" && projection.roomRound.startedAtMs === null;
  const own = projection?.participants.find(p => p.playerId === projection.ownPlayerId);
  const readyKey =
    pending &&
    own?.partyReady &&
    own.connected &&
    !own.ready &&
    state.session.connectionStatus === "online"
      ? `${projection.roomCode}:${projection.roundIndex}:${projection.ownPlayerId}`
      : null;
  useEffect(() => {
    if (projection?.roomStatus !== "round-started") return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [projection?.roomStatus, projection?.roomRound.startedAtMs]);
  useEffect(() => {
    if (!readyKey || !onPreparationReady) return;
    let canceled = false,
      frame = 0,
      painted = 0;
    const check = () => {
      if (canceled) return;
      const current = gameStateStore.getState(),
        room = current.tournament.serverProjection;
      if (!room || room.roomStatus !== "round-started" || room.roomRound.startedAtMs !== null)
        return;
      const position = getProjectedRoundStartPosition(room, room.ownPlayerId);
      const local = frameStore.read().localPlayer;
      const rendered =
        document.visibilityState !== "hidden" &&
        Boolean(rootRef.current?.getClientRects().length) &&
        Math.abs(local.x - position.x) < 1 &&
        Math.abs(local.y - position.y) < 1 &&
        !gameStateStore.canChooseStarter();
      painted = rendered ? painted + 1 : 0;
      if (painted < 2 || inFlight.current) {
        frame = requestAnimationFrame(check);
        return;
      }
      inFlight.current = true;
      setFailed(false);
      void onPreparationReady(room.roundIndex)
        .catch(() => {
          if (!canceled) setFailed(true);
        })
        .finally(() => {
          inFlight.current = false;
        });
    };
    frame = requestAnimationFrame(check);
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
    };
  }, [readyKey, retry, onPreparationReady, gameStateStore, frameStore]);
  if (!projection || projection.roomStatus !== "round-started") return null;
  const count = getRoundStartCount(projection.roomStatus, projection.roomRound, now);
  const blocked = isRoundStartBlocked(projection.roomStatus, projection.roomRound, now);
  const humans = projection.participants.filter(p => p.role === "participant");
  const ready = humans.filter(p => p.partyReady && p.connected && p.ready).length;
  const text =
    copy.locale === "ko-KR"
      ? {
          gather: "중앙 집결",
          title: "모두 준비되면 함께 출발!",
          loading: "포켓몬 선택 · 필드 준비 확인 중",
          ready: "준비 완료",
          count: "잠시 후 탐험 시작",
          go: "출발!",
          retry: "준비 확인 다시 시도",
          failed: "준비 확인에 실패했습니다.",
        }
      : copy.locale === "ja-JP"
        ? {
            gather: "中央に集合",
            title: "全員そろって出発！",
            loading: "ポケモン選択と準備を確認中",
            ready: "準備完了",
            count: "まもなく探索開始",
            go: "スタート！",
            retry: "準備確認を再試行",
            failed: "準備を確認できませんでした。",
          }
        : {
            gather: "MEET IN THE PLAZA",
            title: "Everyone starts together",
            loading: "Choosing Pokémon and loading the field",
            ready: "Ready",
            count: "Exploration begins in",
            go: "GO!",
            retry: "Retry readiness",
            failed: "Unable to confirm readiness.",
          };
  const justStarted =
    projection.roomRound.startedAtMs !== null &&
    now >= projection.roomRound.startedAtMs &&
    now < projection.roomRound.startedAtMs + 650;
  if (!blocked && !justStarted) return null;
  return (
    <div
      ref={rootRef}
      className={styles.overlay}
      data-poke-lounge-start-countdown={count ?? (justStarted ? "go" : "waiting")}
      data-blocked={blocked}
    >
      <div className={styles.panel} role="status" aria-live="polite" aria-atomic="true">
        <span className={styles.eyebrow}>{text.gather}</span>
        {count !== null || justStarted ? (
          <>
            <p>{text.count}</p>
            <strong key={count ?? "go"} className={styles.number}>
              {count ?? text.go}
            </strong>
          </>
        ) : (
          <>
            <h2>{text.title}</h2>
            <p>{text.loading}</p>
            <strong className={styles.ready}>
              {text.ready} {ready} / {humans.length}
            </strong>
          </>
        )}
        {failed && pending ? (
          <>
            <p role="alert">{text.failed}</p>
            <button type="button" onClick={() => setRetry(n => n + 1)}>
              {text.retry}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

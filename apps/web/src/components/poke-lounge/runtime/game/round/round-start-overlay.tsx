"use client";
import type { RoundStartView } from "@/features/poke-lounge/presentation/round/round-start-model";
import type { Ref } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import styles from "./round-start.module.css";

/** Display only. Readiness requests and lifecycle live in RoundStartController. */
export function RoundStartOverlay({
  copy,
  view,
  failed,
  onRetry,
  rootRef,
}: {
  copy: PokeLoungeCopy;
  view: RoundStartView;
  failed: boolean;
  onRetry(): void;
  rootRef: Ref<HTMLDivElement>;
}) {
  const { count, blocked, justStarted, pending, ready, total } = view;
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
              {text.ready} {ready} / {total}
            </strong>
          </>
        )}
        {failed && pending ? (
          <>
            <p role="alert">{text.failed}</p>
            <button type="button" onClick={onRetry}>
              {text.retry}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

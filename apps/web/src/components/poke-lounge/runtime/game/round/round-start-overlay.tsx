"use client";

import { Button } from "@/components/ui/button";
import type { RoundStartView } from "@/features/poke-lounge/presentation/round/round-start-model";
import type { Ref } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";

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
      className="pointer-events-none absolute inset-0 z-[160] grid place-items-center bg-[radial-gradient(ellipse_at_center,rgb(18_38_27_/_8%),transparent_74%)] p-4"
      data-poke-lounge-start-countdown={count ?? (justStarted ? "go" : "waiting")}
      data-blocked={blocked}
    >
      <div
        className="w-full max-w-[330px] rounded-2xl border-2 border-[#c8dbac] bg-[rgb(22_46_34_/_92%)] px-6 py-[18px] text-center text-[#fffdf0] shadow-[0_8px_28px_rgb(0_0_0_/_24%)] [@media(max-height:500px)]:px-[18px] [@media(max-height:500px)]:py-2.5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="text-[11px] font-extrabold tracking-[0.16em] text-[#d4e9b6]">
          {text.gather}
        </span>
        {count !== null || justStarted ? (
          <>
            <p className="my-2 text-[13px] leading-6">{text.count}</p>
            <strong
              key={count ?? "go"}
              className="animate-in zoom-in-110 fade-in mt-1 block text-[clamp(52px,12vw,88px)] leading-[1.15] tabular-nums duration-200 motion-reduce:animate-none [@media(max-height:500px)]:text-5xl"
            >
              {count ?? text.go}
            </strong>
          </>
        ) : (
          <>
            <h2 className="mt-3 mb-2 text-xl leading-[1.35] font-bold">{text.title}</h2>
            <p className="my-2 text-[13px] leading-6">{text.loading}</p>
            <strong className="mt-3 block text-[19px] tabular-nums text-[#d9f4b0]">
              {text.ready} {ready} / {total}
            </strong>
          </>
        )}
        {failed && pending ? (
          <>
            <p className="my-2 text-[13px] leading-6" role="alert">
              {text.failed}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="pointer-events-auto min-h-11 border border-current bg-transparent px-4 py-2 text-inherit hover:bg-white/10 hover:text-inherit"
              onClick={onRetry}
            >
              {text.retry}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

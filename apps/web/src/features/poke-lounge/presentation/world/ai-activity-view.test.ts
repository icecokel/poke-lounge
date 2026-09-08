import assert from "node:assert/strict";
import test from "node:test";
import { createGameStateStore } from "@/components/poke-lounge/runtime/game/state/game-state-store";
import { getPokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";
import type { GameState } from "../../contracts/game-state";
import { getAiActivityLabel, isChampionshipFinished } from "./ai-activity-view";

function stateFor(
  roomStatus: NonNullable<GameState["tournament"]["serverProjection"]>["roomStatus"] | null,
): GameState {
  const state = createGameStateStore().getState();
  return {
    ...state,
    tournament: {
      ...state.tournament,
      serverProjection: roomStatus
        ? ({ roomStatus } as NonNullable<GameState["tournament"]["serverProjection"]>)
        : null,
    },
  };
}

test("종료된 방에서는 지연 도착한 AI 전투·이동 상태보다 대회 종료 표시를 우선한다", () => {
  for (const status of ["completed", "closed"] as const) {
    const completed = isChampionshipFinished(stateFor(status));
    assert.equal(completed, true);
    for (const activity of [
      "tournament",
      "moving",
      "hunting",
      "recovering",
      "idle",
      undefined,
    ] as const) {
      assert.equal(
        getAiActivityLabel(activity, completed, getPokeLoungeCopy("ko-KR")),
        "대회 종료",
      );
    }
  }
});

test("다음 라운드·새 방에서는 실제 활동을 유지하고 로컬 최종 결과만 종료로 표시한다", () => {
  for (const status of ["waiting", "round-started", "tournament"] as const) {
    assert.equal(isChampionshipFinished(stateFor(status)), false);
  }
  const local = stateFor(null);
  assert.equal(isChampionshipFinished(local), false);
  local.round = { ...local.round, phase: "game-result" };
  assert.equal(isChampionshipFinished(local), true);
  assert.equal(getAiActivityLabel("tournament", false, getPokeLoungeCopy("ko-KR")), "대전 중");
  assert.equal(getAiActivityLabel(undefined, false, getPokeLoungeCopy("ko-KR")), "대기 중");
});

test("대회 종료 상태는 영어와 일본어 화면에도 지역화한다", () => {
  assert.equal(
    getAiActivityLabel("tournament", true, getPokeLoungeCopy("en-US")),
    "Championship finished",
  );
  assert.equal(getAiActivityLabel("tournament", true, getPokeLoungeCopy("ja-JP")), "大会終了");
});

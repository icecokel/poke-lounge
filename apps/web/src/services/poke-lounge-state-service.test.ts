import assert from "node:assert/strict";
import test from "node:test";
import { loadPokeLoungeState, savePokeLoungeState } from "./poke-lounge-state-service";

test("멈춘 계정 상태 GET을 제한 시간 뒤 로컬 fallback 오류로 해제한다", async () => {
  let capturedSignal: AbortSignal | undefined;

  const result = await loadPokeLoungeState("token", {
    requestTimeoutMs: 5,
    get: (_endpoint, options) => {
      capturedSignal = options?.signal;
      return new Promise(() => undefined);
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.success ? false : result.unavailable, true);
  assert.equal(capturedSignal?.aborted, true);
});

test("멈춘 계정 상태 PUT을 제한 시간 뒤 실패로 해제한다", async () => {
  let capturedSignal: AbortSignal | undefined;

  const result = await savePokeLoungeState(
    { state: { marker: "local" }, expectedRevision: 0 },
    "token",
    {
      requestTimeoutMs: 5,
      put: (_endpoint, _body, options) => {
        capturedSignal = options?.signal;
        return new Promise(() => undefined);
      },
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.success ? false : result.unavailable, true);
  assert.equal(capturedSignal?.aborted, true);
});

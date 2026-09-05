import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTestSession } from "./local-test-session-client";

const currentUrl = new URL("http://localhost:3000/ko-KR/game/poke-lounge");
const session = {
  user: { id: "poke-lounge-local-test-user" },
  idToken: "local_test_auth_token_0123456789abcdef",
  idTokenExpiresAt: 4_102_444_800,
  localTestMode: true,
};

test("운영·테스트 환경에서는 세션 조회 없이 익명 상태를 사용한다", async function testCase() {
  let requests = 0;
  for (const environment of ["production", "test", undefined]) {
    assert.equal(
      await loadLocalTestSession({
        currentUrl,
        environment,
        fetchImpl: async function fetchSession() {
          requests += 1;
          return Response.json(session);
        },
      }),
      null,
    );
  }
  assert.equal(requests, 0);
});

test("개발 환경이어도 외부 호스트에서는 테스트 세션을 조회하지 않는다", async function testCase() {
  let requests = 0;
  assert.equal(
    await loadLocalTestSession({
      currentUrl: new URL("https://game.example.com"),
      environment: "development",
      fetchImpl: async function fetchSession() {
        requests += 1;
        return Response.json(session);
      },
    }),
    null,
  );
  assert.equal(requests, 0);
});

test("로컬 테스트 세션은 전용 경로·same-origin·no-store로 조회한다", async function testCase() {
  const signal = new AbortController().signal;
  const result = await loadLocalTestSession({
    currentUrl,
    environment: "development",
    signal,
    fetchImpl: async function fetchSession(input, init) {
      assert.equal(String(input), "http://localhost:3000/api/local-test-mode/session");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.signal, signal);
      return Response.json(session);
    },
  });
  assert.deepEqual(result, session);
});

test("빈 세션·만료 토큰·형식 오류는 익명 플레이를 막지 않는다", async function testCase() {
  for (const body of [
    null,
    [],
    {},
    "bad",
    { ...session, idTokenExpiresAt: 0 },
    { idToken: session.idToken, idTokenExpiresAt: session.idTokenExpiresAt },
  ]) {
    assert.equal(
      await loadLocalTestSession({
        currentUrl,
        environment: "development",
        fetchImpl: async function fetchSession() {
          return Response.json(body);
        },
      }),
      null,
    );
  }
});

test("세션 조회 실패와 취소는 익명 상태로 마무리한다", async function testCase() {
  for (const fetchImpl of [
    async function rejectedRequest() {
      throw new Error("network unavailable");
    },
    async function abortedRequest() {
      throw new DOMException("aborted", "AbortError");
    },
    async function unavailableRequest() {
      return new Response(null, { status: 503 });
    },
    async function invalidJsonRequest() {
      return new Response("not-json");
    },
  ]) {
    assert.equal(
      await loadLocalTestSession({ currentUrl, environment: "development", fetchImpl }),
      null,
    );
  }
});

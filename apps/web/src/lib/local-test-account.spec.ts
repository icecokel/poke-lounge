import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_TEST_ACCOUNT_ID,
  LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS,
  createLocalTestAccountSession,
  createLocalTestModeCookieValue,
  isLocalTestAccountAvailable,
  isLocalTestModeCookieValid,
  resolveLocalTestAuthToken,
  type LocalTestAccountEnvironment,
} from "./local-test-account";

const localTestAuthToken = "local_test_auth_token_0123456789abcdef";
const localEnvironment: LocalTestAccountEnvironment = {
  NODE_ENV: "development",
  LOCAL_TEST_AUTH_TOKEN: localTestAuthToken,
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001",
};
const sessionUrl = new URL("http://localhost:3000/api/auth/session");
const nowMs = 1_800_000_000_000;
const nonce = "abcdefghijklmnopqrstuv";

test("환경 변수만으로는 로컬 테스트 계정 세션을 만들지 않는다", function testCase() {
  assert.equal(createLocalTestAccountSession(sessionUrl, null, localEnvironment), null);
  assert.equal(createLocalTestAccountSession(sessionUrl, "active", localEnvironment), null);
});

test("명시적으로 발급한 로컬 테스트 모드 쿠키만 고정 계정 세션을 만든다", function testCase() {
  const issuedAtMs = Date.now();
  const cookieValue = createLocalTestModeCookieValue(
    sessionUrl,
    localEnvironment,
    issuedAtMs,
    nonce,
  );

  assert.ok(cookieValue);
  assert.equal(
    isLocalTestModeCookieValid(sessionUrl, cookieValue, localEnvironment, issuedAtMs),
    true,
  );
  assert.deepEqual(createLocalTestAccountSession(sessionUrl, cookieValue, localEnvironment), {
    user: {
      id: LOCAL_TEST_ACCOUNT_ID,
      name: "Poke Lounge Local Tester",
      email: "poke-lounge-local-test-user@local.poke-lounge.test",
    },
    expires: "2100-01-01T00:00:00.000Z",
    idToken: localTestAuthToken,
    idTokenExpiresAt: 4_102_444_800,
    localTestMode: true,
  });
});

test("변조되거나 만료된 로컬 테스트 모드 쿠키를 거부한다", function testCase() {
  const cookieValue = createLocalTestModeCookieValue(sessionUrl, localEnvironment, nowMs, nonce);
  assert.ok(cookieValue);

  const expiredAt = nowMs + LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS * 1_000 + 1;
  assert.equal(
    isLocalTestModeCookieValid(sessionUrl, `${cookieValue}x`, localEnvironment, nowMs),
    false,
  );
  assert.equal(
    isLocalTestModeCookieValid(sessionUrl, cookieValue, localEnvironment, expiredAt),
    false,
  );
  assert.equal(
    isLocalTestModeCookieValid(sessionUrl, cookieValue, {
      ...localEnvironment,
      LOCAL_TEST_AUTH_TOKEN: "rotated_local_test_auth_token_0123456789",
    }),
    false,
  );
});

test("토큰이 없으면 로컬 테스트 모드를 제공하지 않는다", function testCase() {
  const environment = {
    NODE_ENV: "development",
    NEXT_PUBLIC_API_URL: "http://localhost:3001",
  };

  assert.equal(isLocalTestAccountAvailable(sessionUrl, environment), false);
  assert.equal(createLocalTestModeCookieValue(sessionUrl, environment), null);
});

test("development 외 환경에서는 로컬 테스트 계정을 비활성화한다", function testCase() {
  for (const nodeEnvironment of ["production", "test", undefined]) {
    assert.equal(
      resolveLocalTestAuthToken({
        ...localEnvironment,
        NODE_ENV: nodeEnvironment,
      }),
      null,
    );
  }
});

test("session 외 Auth.js 경로는 로컬 테스트 세션을 만들지 않는다", function testCase() {
  const providersUrl = new URL("http://localhost:3000/api/auth/providers");
  const cookieValue = createLocalTestModeCookieValue(providersUrl, localEnvironment);

  assert.equal(createLocalTestAccountSession(providersUrl, cookieValue, localEnvironment), null);
});

test("loopback이 아닌 Web 요청에서는 로컬 테스트 계정을 비활성화한다", function testCase() {
  assert.equal(
    isLocalTestAccountAvailable(
      new URL("https://preview.example.com/api/auth/session"),
      localEnvironment,
    ),
    false,
  );
  assert.equal(
    isLocalTestAccountAvailable(new URL("http://[::1]:3000/api/auth/session"), localEnvironment),
    false,
  );
});

test("IPv4 loopback이 아닌 API를 연결하면 로컬 테스트 계정을 비활성화한다", function testCase() {
  assert.equal(
    isLocalTestAccountAvailable(sessionUrl, {
      ...localEnvironment,
      NEXT_PUBLIC_API_URL: "https://api.example.com",
    }),
    false,
  );
  assert.equal(
    isLocalTestAccountAvailable(sessionUrl, {
      ...localEnvironment,
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
    }),
    false,
  );
});

test("잘못된 로컬 테스트 토큰은 설정 오류로 처리한다", function testCase() {
  assert.throws(function callback() {
    return resolveLocalTestAuthToken({
      ...localEnvironment,
      LOCAL_TEST_AUTH_TOKEN: "too-short",
    });
  }, /LOCAL_TEST_AUTH_TOKEN/);
});

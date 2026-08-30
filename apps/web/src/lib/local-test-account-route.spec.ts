import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";

const originalEnvironment = { ...process.env };
const localTestModeUrl = "http://localhost:3000/api/local-test-mode";

before(() => {
  Object.assign(process.env, {
    NODE_ENV: "development",
    LOCAL_TEST_AUTH_TOKEN: "local_test_auth_token_0123456789abcdef",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001",
    AUTH_SECRET: "local-route-test-secret",
    AUTH_GOOGLE_ID: "local-route-test-google-id",
    AUTH_GOOGLE_SECRET: "local-route-test-google-secret",
  });
});

after(() => {
  process.env = originalEnvironment;
});

test("환경 변수만으로 Auth.js 세션을 로컬 테스트 계정으로 바꾸지 않는다", async () => {
  const { GET } = await import("@/app/api/auth/[...nextauth]/route");
  const response = await GET(new NextRequest("http://localhost:3000/api/auth/session"));
  const session = (await response.json()) as {
    user?: { id?: string };
    idToken?: string;
  } | null;

  assert.equal(response.status, 200);
  assert.notEqual(session?.user?.id, "poke-lounge-local-test-user");
  assert.notEqual(session?.idToken, process.env.LOCAL_TEST_AUTH_TOKEN);
});

test("AUTH_SECRET이 없는 로컬 테스트 준비 상태는 명시적 비로그인 세션을 반환한다", async () => {
  const authSecret = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;

  try {
    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/auth/session"));

    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store");
  } finally {
    process.env.AUTH_SECRET = authSecret;
  }
});

test("로컬 테스트 모드 capability 조회는 세션을 활성화하지 않는다", async () => {
  const { GET } = await import("@/app/api/local-test-mode/route");
  const response = await GET(new NextRequest(localTestModeUrl));

  assert.deepEqual(await response.json(), {
    available: true,
    active: false,
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store");
});

test("외부 Origin이나 전용 헤더가 없는 활성화 요청을 거부한다", async () => {
  const { POST } = await import("@/app/api/local-test-mode/route");
  const externalResponse = await POST(
    new NextRequest(localTestModeUrl, {
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
        "X-Poke-Lounge-Local-Test-Mode": "1",
      },
      method: "POST",
    }),
  );
  const missingHeaderResponse = await POST(
    new NextRequest(localTestModeUrl, {
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      method: "POST",
    }),
  );

  assert.equal(externalResponse.status, 403);
  assert.equal(missingHeaderResponse.status, 403);
  assert.equal(externalResponse.headers.get("set-cookie"), null);
  assert.equal(missingHeaderResponse.headers.get("set-cookie"), null);
});

test("명시적 활성화 후에만 고정 테스트 계정 세션을 제공한다", async () => {
  const localTestModeRoute = await import("@/app/api/local-test-mode/route");
  const authRoute = await import("@/app/api/auth/[...nextauth]/route");
  const activationResponse = await localTestModeRoute.POST(
    new NextRequest(localTestModeUrl, {
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        "X-Poke-Lounge-Local-Test-Mode": "1",
      },
      method: "POST",
    }),
  );
  const cookie = activationResponse.headers.get("set-cookie")?.split(";", 1)[0];

  assert.equal(activationResponse.status, 200);
  assert.ok(cookie);
  assert.match(activationResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(activationResponse.headers.get("set-cookie") ?? "", /SameSite=strict/i);
  assert.match(activationResponse.headers.get("set-cookie") ?? "", /Path=\/api/i);

  const sessionResponse = await authRoute.GET(
    new NextRequest("http://localhost:3000/api/auth/session", {
      headers: { Cookie: cookie },
    }),
  );
  const session = (await sessionResponse.json()) as {
    user?: { id?: string };
    idToken?: string;
    localTestMode?: boolean;
  };
  assert.equal(sessionResponse.status, 200);
  assert.equal(session.user?.id, "poke-lounge-local-test-user");
  assert.equal(session.idToken, process.env.LOCAL_TEST_AUTH_TOKEN);
  assert.equal(session.localTestMode, true);
  assert.equal(sessionResponse.headers.get("cache-control"), "private, no-cache, no-store");

  const capabilityResponse = await localTestModeRoute.GET(
    new NextRequest(localTestModeUrl, {
      headers: { Cookie: cookie },
    }),
  );
  assert.deepEqual(await capabilityResponse.json(), {
    available: true,
    active: true,
  });
});

test("명시적 종료 요청은 활성화 쿠키를 제거한다", async () => {
  const { DELETE } = await import("@/app/api/local-test-mode/route");
  const response = await DELETE(
    new NextRequest(localTestModeUrl, {
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        "X-Poke-Lounge-Local-Test-Mode": "1",
      },
      method: "DELETE",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { active: false });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.match(response.headers.get("set-cookie") ?? "", /Path=\/api/i);
});

test("session 외 GET은 기존 Auth.js handler에 위임한다", async () => {
  const { GET } = await import("@/app/api/auth/[...nextauth]/route");
  const response = await GET(new NextRequest("http://localhost:3000/api/auth/providers"));
  const providers = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(typeof providers.google, "object");
  assert.equal(Object.hasOwn(providers, "user"), false);
});

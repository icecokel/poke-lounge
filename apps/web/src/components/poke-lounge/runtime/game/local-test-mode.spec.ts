import assert from "node:assert/strict";
import test from "node:test";
import {
  activateLocalTestMode,
  createLocalTestModeSoloUrl,
  createLocalTestModeStartUrl,
  deactivateLocalTestMode,
  isLocalTestModeUrl,
  loadLocalTestModeState,
  resolveLocalTestModeState,
} from "./local-test-mode";

test("loopback URL에서만 로컬 테스트 모드 capability를 조회한다", async () => {
  let requestCount = 0;
  const remoteState = await loadLocalTestModeState(
    new URL("https://poke-lounge.example/game/poke-lounge"),
    async () => {
      requestCount += 1;
      return Response.json({ available: true, active: true });
    },
  );

  assert.equal(isLocalTestModeUrl(new URL("http://localhost:3000/game/poke-lounge")), true);
  assert.equal(isLocalTestModeUrl(new URL("http://127.0.0.1:3000/game/poke-lounge")), true);
  assert.equal(isLocalTestModeUrl(new URL("http://[::1]:3000/game/poke-lounge")), false);
  assert.equal(isLocalTestModeUrl(new URL("https://localhost/game/poke-lounge")), false);
  assert.equal(isLocalTestModeUrl(new URL("https://poke-lounge.example/game/poke-lounge")), false);
  assert.deepEqual(remoteState, { available: false, active: false });
  assert.equal(requestCount, 0);
});

test("로컬 테스트 모드 capability 응답을 검증해 읽는다", async () => {
  const currentUrl = new URL("http://localhost:3000/ko-KR/game/poke-lounge");
  const activeState = await loadLocalTestModeState(currentUrl, async input => {
    assert.equal(String(input), "http://localhost:3000/api/local-test-mode");
    return Response.json({ available: true, active: true });
  });
  const invalidState = await loadLocalTestModeState(currentUrl, async () =>
    Response.json({ available: "yes", active: true }),
  );
  const emptyState = await loadLocalTestModeState(currentUrl, async () => Response.json({}));
  const errorState = await loadLocalTestModeState(
    currentUrl,
    async () => new Response(null, { status: 503 }),
  );
  const networkErrorState = await loadLocalTestModeState(currentUrl, async () => {
    throw new Error("offline");
  });

  assert.deepEqual(activeState, { available: true, active: true });
  assert.deepEqual(invalidState, { available: false, active: false });
  assert.deepEqual(emptyState, { available: false, active: false });
  assert.deepEqual(errorState, { available: false, active: false });
  assert.deepEqual(networkErrorState, { available: false, active: false });
});

test("활성 테스트 세션은 capability 조회 실패에도 싱글 전용 상태를 유지한다", () => {
  assert.deepEqual(resolveLocalTestModeState({ available: false, active: false }, true), {
    available: true,
    active: true,
  });
  assert.deepEqual(resolveLocalTestModeState({ available: true, active: false }, false), {
    available: true,
    active: false,
  });
});

test("활성화와 종료 요청은 같은 로컬 endpoint에 명시적 JSON mutation으로 보낸다", async () => {
  const methods: string[] = [];
  const currentUrl = new URL("http://localhost:3000/ko-KR/game/poke-lounge");
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), "http://localhost:3000/api/local-test-mode");
    assert.equal(init?.body, "{}");
    assert.equal(new Headers(init?.headers).get("x-poke-lounge-local-test-mode"), "1");
    methods.push(init?.method ?? "GET");
    return Response.json({ active: init?.method === "POST" });
  };

  await activateLocalTestMode(currentUrl, fetchImpl);
  await deactivateLocalTestMode(currentUrl, fetchImpl);

  assert.deepEqual(methods, ["POST", "DELETE"]);
});

test("로컬 테스트 모드 mutation 실패를 성공으로 처리하지 않는다", async () => {
  const currentUrl = new URL("http://localhost:3000/ko-KR/game/poke-lounge");

  await assert.rejects(
    activateLocalTestMode(currentUrl, async () => new Response(null, { status: 403 })),
    /status 403/,
  );
});

test("싱글 테스트 재진입 URL은 멀티플레이 선택만 제거한다", () => {
  const startUrl = createLocalTestModeStartUrl(
    new URL(
      "http://localhost:3000/ko-KR/game/poke-lounge?network=server&room=ABC123&create=1&roundMs=300000&serverPlayerId=player-1&serverSessionId=session-1&scene=world",
    ),
  );

  assert.equal(startUrl.searchParams.get("localTest"), "1");
  assert.equal(startUrl.searchParams.get("scene"), "world");
  assert.equal(startUrl.searchParams.has("network"), false);
  assert.equal(startUrl.searchParams.has("room"), false);
  assert.equal(startUrl.searchParams.has("create"), false);
  assert.equal(startUrl.searchParams.has("roundMs"), false);
  assert.equal(startUrl.searchParams.has("serverPlayerId"), false);
  assert.equal(startUrl.searchParams.has("serverSessionId"), false);
});

test("활성 테스트 모드 진입 URL은 직접 조합한 멀티플레이 파라미터도 제거한다", () => {
  const soloUrl = createLocalTestModeSoloUrl(
    new URL(
      "http://localhost:3000/ko-KR/game/poke-lounge?localTest=1&network=webrtc&room=ABC123&create=1&roundMs=300000&serverPlayerId=player-1&serverSessionId=session-1&scene=world",
    ),
  );

  assert.equal(soloUrl.searchParams.get("scene"), "world");
  assert.equal(soloUrl.searchParams.has("localTest"), false);
  assert.equal(soloUrl.searchParams.has("network"), false);
  assert.equal(soloUrl.searchParams.has("room"), false);
  assert.equal(soloUrl.searchParams.has("create"), false);
  assert.equal(soloUrl.searchParams.has("roundMs"), false);
  assert.equal(soloUrl.searchParams.has("serverPlayerId"), false);
  assert.equal(soloUrl.searchParams.has("serverSessionId"), false);
});

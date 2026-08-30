import assert from "node:assert/strict";
import test from "node:test";
import { getSessionApiIdToken } from "./auth-token";

const localTestSession = {
  idToken: "local_test_auth_token_0123456789abcdef",
  idTokenExpiresAt: 4_102_444_800,
  localTestMode: true,
};

test("로컬 테스트 토큰은 공용 게임 API 토큰으로 노출하지 않는다", () => {
  assert.equal(getSessionApiIdToken(localTestSession, Date.now()), undefined);
});

test("Poke Lounge는 로컬 테스트 토큰 사용을 명시적으로 허용한다", () => {
  assert.equal(
    getSessionApiIdToken(localTestSession, Date.now(), { allowLocalTestMode: true }),
    localTestSession.idToken,
  );
});

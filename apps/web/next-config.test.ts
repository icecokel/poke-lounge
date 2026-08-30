import assert from "node:assert/strict";
import test from "node:test";
import { createConnectSources, toWebSocketConnectSource } from "./next.config";

test("API URL은 credential과 path를 제거한 HTTP/WebSocket origin으로 제한한다", () => {
  const apiUrl = "http://user:password@127.0.0.1:46001/api?token=secret";
  const sources = createConnectSources(apiUrl);

  assert.deepEqual(sources, ["'self'", "http://127.0.0.1:46001", "ws://127.0.0.1:46001"]);
  assert.equal(toWebSocketConnectSource(apiUrl), "ws://127.0.0.1:46001");
  assert.equal(sources.join(" ").includes("password"), false);
});

test("API URL이 없거나 잘못되면 외부 fallback을 추가하지 않는다", () => {
  assert.deepEqual(createConnectSources(undefined), ["'self'"]);
  assert.deepEqual(createConnectSources("not-a-url"), ["'self'"]);
});

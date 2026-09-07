import assert from "node:assert/strict";
import test from "node:test";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import config, { createConnectSources, toWebSocketConnectSource } from "./next.config";

test("API URL은 credential과 path를 제거한 HTTP/WebSocket origin으로 제한한다", function testCase() {
  const apiUrl = "http://user:password@127.0.0.1:46001/api?token=secret";
  const sources = createConnectSources(apiUrl);

  assert.deepEqual(sources, ["'self'", "http://127.0.0.1:46001", "ws://127.0.0.1:46001"]);
  assert.equal(toWebSocketConnectSource(apiUrl), "ws://127.0.0.1:46001");
  assert.equal(sources.join(" ").includes("password"), false);
});

test("API URL이 없거나 잘못되면 외부 fallback을 추가하지 않는다", function testCase() {
  assert.deepEqual(createConnectSources(undefined), ["'self'"]);
  assert.deepEqual(createConnectSources("not-a-url"), ["'self'"]);
});

test("카카오 단독·복합·스토리 봇 모두 blocking metadata를 받는다", () => {
  assert.ok(config.htmlLimitedBots instanceof RegExp);
  for (const ua of [
    "kakaotalk-scrap/1.0",
    "KAKAOTALK-SCRAP/1.0",
    "kakaostory-og-reader/1.0",
    "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984",
  ])
    assert.match(ua, config.htmlLimitedBots);
});

test("봇 목록 확장은 설치된 Next의 기본 목록과 플래그를 빠뜨리지 않는다", () => {
  assert.ok(config.htmlLimitedBots instanceof RegExp);
  assert.ok(config.htmlLimitedBots.source.startsWith(HTML_LIMITED_BOT_UA_RE.source + "|"));
  assert.equal(config.htmlLimitedBots.flags, HTML_LIMITED_BOT_UA_RE.flags);
  for (const ua of [
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "Discordbot/2.0",
    "Slackbot-LinkExpanding",
    "LinkedInBot/1.0",
    "WhatsApp/2.0",
    "Bingbot",
    "Google-InspectionTool",
    "Mediapartners-Google",
    "Yeti/1.1",
  ]) {
    assert.match(ua, HTML_LIMITED_BOT_UA_RE);
    assert.match(ua, config.htmlLimitedBots);
  }
});

test("일반 브라우저에까지 메타데이터 스트리밍을 비활성화하지 않는다", () => {
  assert.ok(config.htmlLimitedBots instanceof RegExp);
  for (const ua of [
    "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
  ]) {
    assert.doesNotMatch(ua, config.htmlLimitedBots);
  }
});

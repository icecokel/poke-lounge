import assert from "node:assert/strict";
import test from "node:test";
import {
  getPokeLoungeCopy,
  getPokeLoungeCopyForUrl,
  resolvePokeLoungeLocale,
} from "./poke-lounge-copy";

test("지원 로케일과 언어 접두사를 Poke Lounge 로케일로 정규화한다", () => {
  assert.equal(resolvePokeLoungeLocale("ko-KR"), "ko-KR");
  assert.equal(resolvePokeLoungeLocale("en-GB"), "en-US");
  assert.equal(resolvePokeLoungeLocale("ja"), "ja-JP");
  assert.equal(resolvePokeLoungeLocale("fr-FR"), "ko-KR");
});

test("URL 첫 경로 세그먼트에 맞는 게임 UI 문구를 제공한다", () => {
  assert.equal(
    getPokeLoungeCopyForUrl(new URL("https://example.test/en-US/game/poke-lounge")).startup.retry,
    "Try again",
  );
  assert.equal(
    getPokeLoungeCopyForUrl(new URL("https://example.test/ja-JP/game/poke-lounge")).startup.retry,
    "再試行",
  );
});

test("모든 로케일에서 로컬 방의 같은 기기 다른 탭 제한을 명시한다", () => {
  assert.match(getPokeLoungeCopy("ko-KR").roomEntry.localDescription, /같은 기기.*다른 탭/);
  assert.match(
    getPokeLoungeCopy("en-US").roomEntry.localDescription,
    /same browser profile.*device/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").roomEntry.localDescription, /この端末.*別タブ/);
});

test("모든 로케일에서 로컬 테스트 모드가 싱글 완성도 검증용임을 명시한다", () => {
  assert.match(getPokeLoungeCopy("ko-KR").roomEntry.localTestDescription, /이어하기.*멀티플레이/);
  assert.match(
    getPokeLoungeCopy("en-US").roomEntry.localTestDescription,
    /continue behavior.*not for multiplayer/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").roomEntry.localTestDescription, /続きから.*マルチプレイ/);
});

test("모든 로케일에서 계정 저장 장애의 로컬 진행 보존과 재연결을 안내한다", () => {
  assert.match(getPokeLoungeCopy("ko-KR").hydrationLocalFallback, /로컬 상태.*진행을 유지/);
  assert.match(
    getPokeLoungeCopy("en-US").hydrationLocalFallback,
    /local data.*keeping this tab's progress/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").hydrationLocalFallback, /ローカルデータ.*進行を維持/);
});

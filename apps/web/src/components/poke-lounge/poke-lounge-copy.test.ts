import assert from "node:assert/strict";
import test from "node:test";
import {
  getPokeLoungeCopy,
  getPokeLoungeCopyForUrl,
  resolvePokeLoungeLocale,
} from "./poke-lounge-copy";

test("지원 로케일과 언어 접두사를 Poke Lounge 로케일로 정규화한다", function testCase() {
  assert.equal(resolvePokeLoungeLocale("ko-KR"), "ko-KR");
  assert.equal(resolvePokeLoungeLocale("en-GB"), "en-US");
  assert.equal(resolvePokeLoungeLocale("ja"), "ja-JP");
  assert.equal(resolvePokeLoungeLocale("fr-FR"), "ko-KR");
});

test("URL 첫 경로 세그먼트에 맞는 게임 UI 문구를 제공한다", function testCase() {
  assert.equal(
    getPokeLoungeCopyForUrl(new URL("https://example.test/en-US/game/poke-lounge")).startup.retry,
    "Try again",
  );
  assert.equal(
    getPokeLoungeCopyForUrl(new URL("https://example.test/ja-JP/game/poke-lounge")).resultRetry,
    "もう一度プレイ",
  );
});

test("모든 로케일에서 로컬 방의 같은 기기 다른 탭 제한을 명시한다", function testCase() {
  assert.match(getPokeLoungeCopy("ko-KR").roomEntry.localDescription, /같은 기기.*다른 탭/);
  assert.match(
    getPokeLoungeCopy("en-US").roomEntry.localDescription,
    /same browser profile.*device/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").roomEntry.localDescription, /この端末.*別タブ/);
});

test("모든 로케일에서 로컬 테스트 모드가 싱글 완성도 검증용임을 명시한다", function testCase() {
  assert.match(getPokeLoungeCopy("ko-KR").roomEntry.localTestDescription, /이어하기.*멀티플레이/);
  assert.match(
    getPokeLoungeCopy("en-US").roomEntry.localTestDescription,
    /continue behavior.*not for multiplayer/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").roomEntry.localTestDescription, /続きから.*マルチプレイ/);
});

test("모든 로케일에서 계정 저장 장애의 로컬 진행 보존과 재연결을 안내한다", function testCase() {
  assert.match(getPokeLoungeCopy("ko-KR").hydrationLocalFallback, /로컬 상태.*진행을 유지/);
  assert.match(
    getPokeLoungeCopy("en-US").hydrationLocalFallback,
    /local data.*keeping this tab's progress/,
  );
  assert.match(getPokeLoungeCopy("ja-JP").hydrationLocalFallback, /ローカルデータ.*進行を維持/);
});

test("모든 로케일에서 게임 종료 후 GitHub Star로 프로젝트 응원을 안내한다", function testCase() {
  assert.match(getPokeLoungeCopy("ko-KR").resultStarPrompt, /GitHub Star/);
  assert.match(getPokeLoungeCopy("en-US").resultStarPrompt, /GitHub Star/);
  assert.match(getPokeLoungeCopy("ja-JP").resultStarPrompt, /GitHub Star/);
});

test("멀티플레이 결과의 다음 행동은 방을 다시 선택한다고 명시한다", function testCase() {
  assert.equal(getPokeLoungeCopy("ko-KR").resultRoomEntry, "새 방 선택");
  assert.equal(getPokeLoungeCopy("en-US").resultRoomEntry, "Choose another room");
  assert.equal(getPokeLoungeCopy("ja-JP").resultRoomEntry, "別のルームを選ぶ");
});

test("모든 로케일은 8명 정원과 시작 시 AI 자동 참가를 안내한다", function testCase() {
  for (const locale of ["ko-KR", "en-US", "ja-JP"] as const) {
    const lobby = getPokeLoungeCopy(locale).lobby;

    assert.match(lobby.participantCount(3), /3\/8/);
    assert.match(lobby.autoFillNotice, /4/);
    assert.match(lobby.autoFillNotice, /8/);
    assert.match(lobby.autoFillNotice, /AI/);
  }
});

test("모바일 전투 문구를 선택한 로케일로 제공한다", function testCase() {
  const korean = getPokeLoungeCopy("ko-KR").mobile;
  const english = getPokeLoungeCopy("en-US").mobile;
  const japanese = getPokeLoungeCopy("ja-JP").mobile;

  assert.equal(korean.battleDeckLabel, "전투 조작");
  assert.equal(english.battleDeckLabel, "Battle controls");
  assert.equal(japanese.battleDeckLabel, "バトル操作");
  assert.equal(
    english.moveReplacementPrompt("Totodile", "Bite"),
    "Totodile can learn Bite. Choose a move to forget.",
  );
  assert.equal(
    japanese.moveReplacementPrompt("ワニノコ", "かみつく"),
    "ワニノコはかみつくを覚えられます。忘れるわざを選んでください。",
  );
});

test("영어와 일본어 정적 UI 문구에 한국어 기본값이 남지 않는다", function testCase() {
  for (const locale of ["en-US", "ja-JP"] as const) {
    const strings = collectStrings(getPokeLoungeCopy(locale));
    assert.equal(
      strings.find(value => /[가-힣]/.test(value)),
      undefined,
      `${locale} copy contains Hangul`,
    );
  }
});

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStrings);
}

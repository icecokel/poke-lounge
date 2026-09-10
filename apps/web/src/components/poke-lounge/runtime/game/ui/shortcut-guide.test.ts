import assert from "node:assert/strict";
import test from "node:test";
import {
  createInventoryControlFooter,
  createPcBoxControlFooter,
  createShortcutGuideFooter,
  createShortcutGuideRows,
  createShortcutGuideTitle,
} from "./shortcut-guide";

test("키보드 단축키 안내는 기존 입력 설명을 유지한다", function testCase() {
  assert.equal(createShortcutGuideTitle("world"), "필드 단축키");
  assert.deepEqual(createShortcutGuideRows("world")[0], {
    action: "이동",
    keys: "WASD / 방향키",
  });
  assert.equal(createShortcutGuideFooter(), "클릭 / Enter / H 닫기");
});

test("PC 박스 안내 문구는 키보드와 터치 조작을 구분한다", function testCase() {
  assert.equal(
    createPcBoxControlFooter("keyboard"),
    "←→ 파티/박스 · ↑↓ 선택 · Enter 결정 · Esc 닫기",
  );
  assert.equal(createPcBoxControlFooter("touch"), "포켓몬 터치 · 화면의 이동 버튼 · 뒤로");
});

test("터치 단축키 안내는 화면 버튼과 조이스틱과 실제 이름을 설명한다", function testCase() {
  assert.equal(createShortcutGuideTitle("world", "touch"), "필드 터치 조작");
  assert.deepEqual(createShortcutGuideRows("world", "touch"), [
    { action: "이동", keys: "조이스틱 드래그" },
    { action: "확인 / 대화", keys: "대화 버튼" },
    { action: "가방 / 파티", keys: "가방 / 포켓몬 버튼" },
    { action: "도움말", keys: "설정 → 조작 안내" },
    { action: "닫기 / 뒤로", keys: "닫기 / 뒤로 버튼" },
  ]);
  assert.equal(createShortcutGuideFooter("touch"), "닫기 버튼");
});

test("가방 안내 문구는 키보드와 터치 대상 선택 단계를 구분한다", function testCase() {
  assert.equal(
    createInventoryControlFooter("items", "keyboard"),
    "↑↓ 선택 · Enter 대상 선택 · I 닫기",
  );
  assert.equal(
    createInventoryControlFooter("party", "keyboard"),
    "↑↓ 대상 · Enter 사용 · Esc 뒤로 · I 닫기",
  );
  assert.equal(createInventoryControlFooter("items", "touch"), "아이템 터치 · 사용 버튼 · 뒤로");
  assert.equal(createInventoryControlFooter("party", "touch"), "대상 터치 · 사용 버튼 · 뒤로");
});

test("모든 언어의 터치 안내는 제거된 D-pad/A/B 표기를 사용하지 않는다", () => {
  for (const locale of ["ko-KR", "en-US", "ja-JP"]) {
    const rows = [
      ...createShortcutGuideRows("world", "touch", locale),
      ...createShortcutGuideRows("battle", "touch", locale),
    ];
    assert.doesNotMatch(JSON.stringify(rows), /D-pad|"keys":"[ABI?]"/);
  }
});

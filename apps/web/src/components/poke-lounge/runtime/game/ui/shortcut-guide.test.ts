import assert from "node:assert/strict";
import test from "node:test";
import {
  createInventoryControlFooter,
  createPcBoxControlFooter,
  createShortcutGuideFooter,
  createShortcutGuideRows,
  createShortcutGuideTitle,
} from "./shortcutGuide";

test("키보드 단축키 안내는 기존 입력 설명을 유지한다", () => {
  assert.equal(createShortcutGuideTitle("world"), "필드 단축키");
  assert.deepEqual(createShortcutGuideRows("world")[0], {
    action: "이동",
    keys: "WASD / 방향키",
  });
  assert.equal(createShortcutGuideFooter(), "클릭 / Enter / H 닫기");
});

test("PC 박스 안내 문구는 키보드와 터치 조작을 구분한다", () => {
  assert.equal(
    createPcBoxControlFooter("keyboard"),
    "←→ 파티/박스 · ↑↓ 선택 · Enter 결정 · Esc 닫기",
  );
  assert.equal(createPcBoxControlFooter("touch"), "D-pad 선택/전환 · A 결정 · B 닫기");
});

test("터치 단축키 안내는 화면 버튼과 같은 D-pad/A/B/I/?를 설명한다", () => {
  assert.equal(createShortcutGuideTitle("world", "touch"), "필드 터치 조작");
  assert.deepEqual(createShortcutGuideRows("world", "touch"), [
    { action: "이동", keys: "D-pad" },
    { action: "확인 / 대화", keys: "A" },
    { action: "가방", keys: "I" },
    { action: "도움말", keys: "?" },
    { action: "닫기 / 뒤로", keys: "B" },
  ]);
  assert.equal(createShortcutGuideFooter("touch"), "A / B / ? 닫기");
});

test("가방 안내 문구는 키보드와 터치 대상 선택 단계를 구분한다", () => {
  assert.equal(
    createInventoryControlFooter("items", "keyboard"),
    "↑↓ 선택 · Enter 대상 선택 · I 닫기",
  );
  assert.equal(
    createInventoryControlFooter("party", "keyboard"),
    "↑↓ 대상 · Enter 사용 · Esc 뒤로 · I 닫기",
  );
  assert.equal(createInventoryControlFooter("items", "touch"), "D-pad 선택 · A 대상 선택 · I 닫기");
  assert.equal(
    createInventoryControlFooter("party", "touch"),
    "D-pad 대상 · A 사용 · B 뒤로 · I 닫기",
  );
});

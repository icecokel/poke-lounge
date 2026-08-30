export type ShortcutGuideContext = "world" | "battle";
export type ShortcutGuideInputMode = "keyboard" | "touch";

export interface ShortcutGuideRow {
  action: string;
  keys: string;
}

const SHORTCUT_GUIDE_TITLES: Record<
  ShortcutGuideInputMode,
  Record<ShortcutGuideContext, string>
> = {
  keyboard: {
    world: "필드 단축키",
    battle: "전투 단축키",
  },
  touch: {
    world: "필드 터치 조작",
    battle: "전투 터치 조작",
  },
};

const SHORTCUT_GUIDE_ROWS: Record<
  ShortcutGuideInputMode,
  Record<ShortcutGuideContext, ShortcutGuideRow[]>
> = {
  keyboard: {
    world: [
      { action: "이동", keys: "WASD / 방향키" },
      { action: "확인 / 대화", keys: "Enter / Space / Z" },
      { action: "가방", keys: "I 키" },
      { action: "도움말", keys: "H" },
      { action: "닫기", keys: "Esc / Backspace" },
    ],
    battle: [
      { action: "선택", keys: "방향키" },
      { action: "결정", keys: "Enter / Space / Z" },
      { action: "뒤로", keys: "Esc / Backspace" },
      { action: "도움말", keys: "H" },
    ],
  },
  touch: {
    world: [
      { action: "이동", keys: "D-pad" },
      { action: "확인 / 대화", keys: "A" },
      { action: "가방", keys: "I" },
      { action: "도움말", keys: "?" },
      { action: "닫기 / 뒤로", keys: "B" },
    ],
    battle: [
      { action: "선택", keys: "D-pad" },
      { action: "결정", keys: "A" },
      { action: "뒤로", keys: "B" },
      { action: "도움말", keys: "?" },
    ],
  },
};

export function createShortcutGuideTitle(
  context: ShortcutGuideContext,
  inputMode: ShortcutGuideInputMode = "keyboard",
): string {
  return SHORTCUT_GUIDE_TITLES[inputMode][context];
}

export function createShortcutGuideRows(
  context: ShortcutGuideContext,
  inputMode: ShortcutGuideInputMode = "keyboard",
): ShortcutGuideRow[] {
  return SHORTCUT_GUIDE_ROWS[inputMode][context].map(row => ({ ...row }));
}

export function createShortcutGuideFooter(inputMode: ShortcutGuideInputMode = "keyboard"): string {
  return inputMode === "touch" ? "A / B / ? 닫기" : "클릭 / Enter / H 닫기";
}

export function createInventoryControlFooter(
  focus: "items" | "party",
  inputMode: ShortcutGuideInputMode,
): string {
  if (inputMode === "touch") {
    return focus === "party"
      ? "D-pad 대상 · A 사용 · B 뒤로 · I 닫기"
      : "D-pad 선택 · A 대상 선택 · I 닫기";
  }

  return focus === "party"
    ? "↑↓ 대상 · Enter 사용 · Esc 뒤로 · I 닫기"
    : "↑↓ 선택 · Enter 대상 선택 · I 닫기";
}

export function createPcBoxControlFooter(inputMode: ShortcutGuideInputMode): string {
  return inputMode === "touch"
    ? "D-pad 선택/전환 · A 결정 · B 닫기"
    : "←→ 파티/박스 · ↑↓ 선택 · Enter 결정 · Esc 닫기";
}

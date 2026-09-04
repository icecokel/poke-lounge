import { resolvePokeLoungeLocale, type PokeLoungeLocale } from "../../../poke-lounge-copy";

export type ShortcutGuideContext = "world" | "battle";
export type ShortcutGuideInputMode = "keyboard" | "touch";

export interface ShortcutGuideRow {
  action: string;
  keys: string;
}

interface ShortcutGuideCopy {
  titles: Record<ShortcutGuideInputMode, Record<ShortcutGuideContext, string>>;
  rows: Record<ShortcutGuideInputMode, Record<ShortcutGuideContext, ShortcutGuideRow[]>>;
  footer: Record<ShortcutGuideInputMode, string>;
  inventory: Record<ShortcutGuideInputMode, Record<"items" | "party", string>>;
  pc: Record<ShortcutGuideInputMode, string>;
}

const SHORTCUT_GUIDE_COPY: Record<PokeLoungeLocale, ShortcutGuideCopy> = {
  "ko-KR": {
    titles: {
      keyboard: { world: "필드 단축키", battle: "전투 단축키" },
      touch: { world: "필드 터치 조작", battle: "전투 터치 조작" },
    },
    rows: {
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
    },
    footer: { keyboard: "클릭 / Enter / H 닫기", touch: "A / B / ? 닫기" },
    inventory: {
      keyboard: {
        items: "↑↓ 선택 · Enter 대상 선택 · I 닫기",
        party: "↑↓ 대상 · Enter 사용 · Esc 뒤로 · I 닫기",
      },
      touch: {
        items: "D-pad 선택 · A 대상 선택 · I 닫기",
        party: "D-pad 대상 · A 사용 · B 뒤로 · I 닫기",
      },
    },
    pc: {
      keyboard: "←→ 파티/박스 · ↑↓ 선택 · Enter 결정 · Esc 닫기",
      touch: "D-pad 선택/전환 · A 결정 · B 닫기",
    },
  },
  "en-US": {
    titles: {
      keyboard: { world: "Field shortcuts", battle: "Battle shortcuts" },
      touch: { world: "Field touch controls", battle: "Battle touch controls" },
    },
    rows: {
      keyboard: {
        world: [
          { action: "Move", keys: "WASD / Arrow keys" },
          { action: "Confirm / Talk", keys: "Enter / Space / Z" },
          { action: "Bag", keys: "I" },
          { action: "Help", keys: "H" },
          { action: "Close", keys: "Esc / Backspace" },
        ],
        battle: [
          { action: "Select", keys: "Arrow keys" },
          { action: "Confirm", keys: "Enter / Space / Z" },
          { action: "Back", keys: "Esc / Backspace" },
          { action: "Help", keys: "H" },
        ],
      },
      touch: {
        world: [
          { action: "Move", keys: "D-pad" },
          { action: "Confirm / Talk", keys: "A" },
          { action: "Bag", keys: "I" },
          { action: "Help", keys: "?" },
          { action: "Close / Back", keys: "B" },
        ],
        battle: [
          { action: "Select", keys: "D-pad" },
          { action: "Confirm", keys: "A" },
          { action: "Back", keys: "B" },
          { action: "Help", keys: "?" },
        ],
      },
    },
    footer: { keyboard: "Click / Enter / H to close", touch: "A / B / ? to close" },
    inventory: {
      keyboard: {
        items: "↑↓ Select · Enter choose target · I close",
        party: "↑↓ Target · Enter use · Esc back · I close",
      },
      touch: {
        items: "D-pad select · A choose target · I close",
        party: "D-pad target · A use · B back · I close",
      },
    },
    pc: {
      keyboard: "←→ Party/Box · ↑↓ Select · Enter confirm · Esc close",
      touch: "D-pad select/switch · A confirm · B close",
    },
  },
  "ja-JP": {
    titles: {
      keyboard: { world: "フィールドのショートカット", battle: "バトルのショートカット" },
      touch: { world: "フィールドのタッチ操作", battle: "バトルのタッチ操作" },
    },
    rows: {
      keyboard: {
        world: [
          { action: "移動", keys: "WASD / 矢印キー" },
          { action: "決定 / 話す", keys: "Enter / Space / Z" },
          { action: "バッグ", keys: "I" },
          { action: "ヘルプ", keys: "H" },
          { action: "閉じる", keys: "Esc / Backspace" },
        ],
        battle: [
          { action: "選択", keys: "矢印キー" },
          { action: "決定", keys: "Enter / Space / Z" },
          { action: "戻る", keys: "Esc / Backspace" },
          { action: "ヘルプ", keys: "H" },
        ],
      },
      touch: {
        world: [
          { action: "移動", keys: "D-pad" },
          { action: "決定 / 話す", keys: "A" },
          { action: "バッグ", keys: "I" },
          { action: "ヘルプ", keys: "?" },
          { action: "閉じる / 戻る", keys: "B" },
        ],
        battle: [
          { action: "選択", keys: "D-pad" },
          { action: "決定", keys: "A" },
          { action: "戻る", keys: "B" },
          { action: "ヘルプ", keys: "?" },
        ],
      },
    },
    footer: { keyboard: "クリック / Enter / H で閉じる", touch: "A / B / ? で閉じる" },
    inventory: {
      keyboard: {
        items: "↑↓ 選択 · Enter 対象選択 · I 閉じる",
        party: "↑↓ 対象 · Enter 使用 · Esc 戻る · I 閉じる",
      },
      touch: {
        items: "D-pad 選択 · A 対象選択 · I 閉じる",
        party: "D-pad 対象 · A 使用 · B 戻る · I 閉じる",
      },
    },
    pc: {
      keyboard: "←→ 手持ち/ボックス · ↑↓ 選択 · Enter 決定 · Esc 閉じる",
      touch: "D-pad 選択/切替 · A 決定 · B 閉じる",
    },
  },
};

export function createShortcutGuideTitle(
  context: ShortcutGuideContext,
  inputMode: ShortcutGuideInputMode = "keyboard",
  locale?: string | null,
): string {
  return SHORTCUT_GUIDE_COPY[resolvePokeLoungeLocale(locale)].titles[inputMode][context];
}

export function createShortcutGuideRows(
  context: ShortcutGuideContext,
  inputMode: ShortcutGuideInputMode = "keyboard",
  locale?: string | null,
): ShortcutGuideRow[] {
  return SHORTCUT_GUIDE_COPY[resolvePokeLoungeLocale(locale)].rows[inputMode][context].map(
    function mapItem(row) {
      return { ...row };
    },
  );
}

export function createShortcutGuideFooter(
  inputMode: ShortcutGuideInputMode = "keyboard",
  locale?: string | null,
): string {
  return SHORTCUT_GUIDE_COPY[resolvePokeLoungeLocale(locale)].footer[inputMode];
}

export function createInventoryControlFooter(
  focus: "items" | "party",
  inputMode: ShortcutGuideInputMode,
  locale?: string | null,
): string {
  return SHORTCUT_GUIDE_COPY[resolvePokeLoungeLocale(locale)].inventory[inputMode][focus];
}

export function createPcBoxControlFooter(
  inputMode: ShortcutGuideInputMode,
  locale?: string | null,
): string {
  return SHORTCUT_GUIDE_COPY[resolvePokeLoungeLocale(locale)].pc[inputMode];
}

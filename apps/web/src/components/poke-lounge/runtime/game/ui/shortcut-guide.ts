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
          { action: "뒤로", keys: "X / Backspace" },
          { action: "도움말", keys: "H" },
        ],
      },
      touch: {
        world: [
          { action: "이동", keys: "조이스틱 드래그" },
          { action: "확인 / 대화", keys: "대화 버튼" },
          { action: "가방 / 파티", keys: "가방 / 포켓몬 버튼" },
          { action: "도움말", keys: "설정 → 조작 안내" },
          { action: "닫기 / 뒤로", keys: "닫기 / 뒤로 버튼" },
        ],
        battle: [
          { action: "기술 실행", keys: "싸운다 → 기술 터치" },
          { action: "아이템", keys: "가방 → 아이템 선택 → 사용" },
          { action: "교체", keys: "포켓몬 선택 → 교체 확인" },
          { action: "뒤로", keys: "뒤로 버튼" },
        ],
      },
    },
    footer: { keyboard: "클릭 / Enter / H 닫기", touch: "닫기 버튼" },
    inventory: {
      keyboard: {
        items: "↑↓ 선택 · Enter 대상 선택 · I 닫기",
        party: "↑↓ 대상 · Enter 사용 · Esc 뒤로 · I 닫기",
      },
      touch: {
        items: "아이템 터치 · 사용 버튼 · 뒤로",
        party: "대상 터치 · 사용 버튼 · 뒤로",
      },
    },
    pc: {
      keyboard: "←→ 파티/박스 · ↑↓ 선택 · Enter 결정 · Esc 닫기",
      touch: "포켓몬 터치 · 화면의 이동 버튼 · 뒤로",
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
          { action: "Back", keys: "X / Backspace" },
          { action: "Help", keys: "H" },
        ],
      },
      touch: {
        world: [
          { action: "Move", keys: "Drag the joystick" },
          { action: "Confirm / Talk", keys: "Talk button" },
          { action: "Bag / Party", keys: "Bag / Pokémon buttons" },
          { action: "Help", keys: "Settings → Controls" },
          { action: "Close / Back", keys: "Close / Back button" },
        ],
        battle: [
          { action: "Use a move", keys: "Fight → tap a move" },
          { action: "Item", keys: "Bag → select item → use" },
          { action: "Switch", keys: "Select Pokémon → confirm switch" },
          { action: "Back", keys: "Back button" },
        ],
      },
    },
    footer: { keyboard: "Click / Enter / H to close", touch: "Close button" },
    inventory: {
      keyboard: {
        items: "↑↓ Select · Enter choose target · I close",
        party: "↑↓ Target · Enter use · Esc back · I close",
      },
      touch: {
        items: "Tap item · Use button · Back",
        party: "Tap target · Use button · Back",
      },
    },
    pc: {
      keyboard: "←→ Party/Box · ↑↓ Select · Enter confirm · Esc close",
      touch: "Tap Pokémon · On-screen transfer buttons · Back",
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
          { action: "戻る", keys: "X / Backspace" },
          { action: "ヘルプ", keys: "H" },
        ],
      },
      touch: {
        world: [
          { action: "移動", keys: "ジョイスティックをドラッグ" },
          { action: "決定 / 話す", keys: "話すボタン" },
          { action: "バッグ / 手持ち", keys: "バッグ / ポケモンボタン" },
          { action: "ヘルプ", keys: "設定 → 操作ガイド" },
          { action: "閉じる / 戻る", keys: "閉じる / 戻るボタン" },
        ],
        battle: [
          { action: "技を使う", keys: "たたかう → 技をタップ" },
          { action: "道具", keys: "バッグ → 道具選択 → 使用" },
          { action: "交代", keys: "ポケモン選択 → 交代確認" },
          { action: "戻る", keys: "戻るボタン" },
        ],
      },
    },
    footer: { keyboard: "クリック / Enter / H で閉じる", touch: "閉じるボタン" },
    inventory: {
      keyboard: {
        items: "↑↓ 選択 · Enter 対象選択 · I 閉じる",
        party: "↑↓ 対象 · Enter 使用 · Esc 戻る · I 閉じる",
      },
      touch: {
        items: "道具をタップ · 使用ボタン · 戻る",
        party: "対象をタップ · 使用ボタン · 戻る",
      },
    },
    pc: {
      keyboard: "←→ 手持ち/ボックス · ↑↓ 選択 · Enter 決定 · Esc 閉じる",
      touch: "ポケモンをタップ · 画面の移動ボタン · 戻る",
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

import assert from "node:assert/strict";
import test from "node:test";
import type { MobileBattleUiState } from "../runtime/game/ui/mobile-battle-ui";
import {
  candidateAction,
  canChooseBattleAction,
  pokemonHealth,
  pokemonIdentity,
  type BattleCandidate,
} from "./mobile-selection-model";

const pokemon: MobileBattleUiState["party"][number] = {
  slotIndex: 4,
  name: "이상해씨",
  level: 12,
  currentHp: 26,
  maxHp: 38,
  status: "normal",
  selected: false,
  isCurrent: false,
  isFainted: false,
  isEmpty: false,
  canSwitch: true,
  sprite: { assetKey: "test-pokemon", path: "/pokemon.png", frame: 1 },
};
function state(overrides: Partial<MobileBattleUiState> = {}): MobileBattleUiState {
  return {
    selectionKey: "battle:turn1:party",
    phase: "party-select",
    canSubmitAction: true,
    message: null,
    isHelpOpen: false,
    isInputLocked: false,
    canGoBack: true,
    isForcedPartySwitch: false,
    commands: [],
    moves: [],
    party: [pokemon],
    items: [],
    moveReplacement: null,
    ...overrides,
  };
}
const candidate: BattleCandidate = {
  context: "battle:turn1:party",
  kind: "party",
  index: 4,
  identity: pokemonIdentity(pokemon),
};

test("모바일 후보 선택은 필터링 후에도 원래 파티 슬롯 번호로만 확정한다", () => {
  assert.deepEqual(candidateAction(candidate, state()), { type: "select-party", index: 4 });
  assert.equal(candidateAction({ ...candidate, index: 0 }, state()), null);
  assert.equal(candidateAction(null, state()), null);
});
test("기절·빈 슬롯·현재 출전·사라진 후보는 확정할 수 없다", () => {
  for (const patch of [
    { isFainted: true },
    { isEmpty: true },
    { isCurrent: true },
    { canSwitch: false },
    { currentHp: 0 },
    { name: "꼬부기" },
  ]) {
    assert.equal(candidateAction(candidate, state({ party: [{ ...pokemon, ...patch }] })), null);
  }
  assert.equal(candidateAction(candidate, state({ party: [] })), null);
});
test("이전 턴·다른 작업·시간 만료·관전·요청 중의 후보는 거절한다", () => {
  for (const patch of [
    { selectionKey: "battle:turn2:party" },
    { phase: "command" as const },
    { turnEndsAtMs: 1000 },
    { spectating: true },
    { isInputLocked: true },
    { canSubmitAction: false },
    { isHelpOpen: true },
  ]) {
    assert.equal(candidateAction(candidate, state(patch), 1000), null);
  }
  assert.notEqual(candidateAction(candidate, state({ turnEndsAtMs: 1001 }), 1000), null);
});
test("강제 교체도 자동 실행하지 않고 사용자가 고른 유효 후보만 실행한다", () => {
  assert.equal(candidateAction(null, state({ isForcedPartySwitch: true, canGoBack: false })), null);
  assert.deepEqual(
    candidateAction(candidate, state({ isForcedPartySwitch: true, canGoBack: false })),
    { type: "select-party", index: 4 },
  );
});
test("아이템은 원래 id/index와 최신 수량을 모두 검증한다", () => {
  const item = {
    id: "pokeball",
    index: 5,
    name: "몬스터볼",
    count: 2,
    selected: false,
    disabled: false,
  };
  const bag = state({ phase: "bag-select", selectionKey: "turn1:bag", items: [item] });
  const selected: BattleCandidate = {
    context: "turn1:bag",
    kind: "item",
    identity: "pokeball",
    index: 5,
  };
  assert.deepEqual(candidateAction(selected, bag), { type: "select-item", index: 5 });
  for (const patch of [{ count: 0 }, { disabled: true }, { id: "potion" }, { index: 0 }]) {
    assert.equal(candidateAction(selected, { ...bag, items: [{ ...item, ...patch }] }), null);
  }
});
test("숫자가 누락되거나 비정상인 HP를 가짜 0/0으로 표시하지 않는다", () => {
  for (const [hp, max] of [
    [null, null],
    [0, 0],
    [-1, 10],
    [11, 10],
    [NaN, 10],
    [5, Infinity],
  ] as const)
    assert.equal(pokemonHealth(hp, max), null);
  assert.deepEqual(pokemonHealth(0, 38), { current: 0, max: 38, ratio: 0 });
});
test("명령 단계에서만 실행 가능하며 메시지 표시용 하위 호환도 유지한다", () => {
  assert.equal(canChooseBattleAction(state({ phase: "resolving" })), false);
  assert.equal(
    canChooseBattleAction(state({ canSubmitAction: undefined, message: "공격!" })),
    false,
  );
  assert.equal(canChooseBattleAction(state({ phase: "command" })), true);
});

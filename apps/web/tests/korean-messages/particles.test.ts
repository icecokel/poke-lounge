import assert from "node:assert/strict";
import { test } from "node:test";
import {
  withConjunctionParticle,
  withDirectionParticle,
  withObjectParticle,
  withSubjectParticle,
  withTopicParticle,
} from "../../../../packages/poke-lounge-battle/src/battle-message-text";
import {
  formatLearnedMoveMessage,
  formatReplacedMoveMessage,
  formatSkippedMoveMessage,
} from "../../../../packages/poke-lounge-battle/src/adventure/battle/level-up-moves";
import { formatRomEvolutionSuccessMessage } from "../../../../packages/poke-lounge-battle/src/adventure/battle/evolution-presentation";
import { formatPcTransferResult } from "../../src/features/poke-lounge/presentation/world/pc-transfer-message";
import { getPokeLoungeCopy } from "../../src/components/poke-lounge/poke-lounge-copy";

const particleCases = [
  ["피카츄", "피카츄가", "피카츄는", "피카츄를", "피카츄와", "피카츄로"],
  ["리자몽", "리자몽이", "리자몽은", "리자몽을", "리자몽과", "리자몽으로"],
  ["마릴", "마릴이", "마릴은", "마릴을", "마릴과", "마릴로"],
  ["방어", "방어가", "방어는", "방어를", "방어와", "방어로"],
  ["공격", "공격이", "공격은", "공격을", "공격과", "공격으로"],
  ["민 수", "민 수가", "민 수는", "민 수를", "민 수와", "민 수로"],
  ["HP", "HP가", "HP는", "HP를", "HP와", "HP로"],
  ["ROM", "ROM이", "ROM은", "ROM을", "ROM과", "ROM으로"],
  ["", "", "", "", "", ""],
] as const;

for (const [word, subject, topic, object, conjunction, direction] of particleCases) {
  test(`조사 선택: ${word || "빈 문자열"}`, () => {
    assert.equal(withSubjectParticle(word), subject);
    assert.equal(withTopicParticle(word), topic);
    assert.equal(withObjectParticle(word), object);
    assert.equal(withConjunctionParticle(word), conjunction);
    assert.equal(withDirectionParticle(word), direction);
  });
}

const levelCases = [
  [0, "이"],
  [1, "이"],
  [2, "가"],
  [3, "이"],
  [4, "가"],
  [5, "가"],
  [6, "이"],
  [7, "이"],
  [8, "이"],
  [9, "가"],
  [10, "이"],
  [11, "이"],
  [20, "이"],
  [21, "이"],
  [22, "가"],
  [99, "가"],
  [100, "이"],
] as const;

for (const [level, subject] of levelCases) {
  test(`레벨 ${level}: 숫자 표기를 유지하고 한글 발음으로 조사 선택`, () => {
    assert.equal(withSubjectParticle(level), `${level}${subject}`);
    assert.equal(withSubjectParticle(String(level)), `${level}${subject}`);
    assert.equal(withSubjectParticle(`Player ${level}`), `Player ${level}${subject}`);
  });
}

test("숫자 suffix의 표시와 ㄹ 받침 예외를 유지한다", () => {
  assert.equal(withSubjectParticle("트레이너001"), "트레이너001이");
  assert.equal(withObjectParticle("Player 1"), "Player 1을");
  assert.equal(withTopicParticle("Player 2"), "Player 2는");
  assert.equal(withConjunctionParticle("Player 3"), "Player 3과");
  assert.equal(withDirectionParticle("Player 1"), "Player 1로");
  assert.equal(withDirectionParticle(10), "10으로");
  assert.equal(withSubjectParticle("9007199254740993"), "9007199254740993가");
});

test("기술 습득·교체·취소에서 포켓몬과 기술의 받침을 각각 판단한다", () => {
  assert.equal(formatLearnedMoveMessage("피카츄", "전광석화"), "피카츄는 전광석화를 배웠다!");
  assert.equal(formatLearnedMoveMessage("마릴", "방어"), "마릴은 방어를 배웠다!");
  assert.equal(
    formatReplacedMoveMessage("마릴", "몸통박치기", "전광석화"),
    "마릴은 몸통박치기를 잊고 전광석화를 배웠다!",
  );
  assert.equal(
    formatReplacedMoveMessage("피카츄", "전광석화", "공격"),
    "피카츄는 전광석화를 잊고 공격을 배웠다!",
  );
  assert.equal(
    formatSkippedMoveMessage("피카츄", "전광석화"),
    "피카츄는 전광석화를 배우지 않았다!",
  );
  assert.equal(formatSkippedMoveMessage("마릴", "공격"), "마릴은 공격을 배우지 않았다!");
});

for (const [name, object, conjunction] of [
  ["피카츄", "피카츄를", "피카츄와"],
  ["마릴", "마릴을", "마릴과"],
] as const) {
  test(`PC 보관·꺼내기·교체: ${name}`, () => {
    assert.equal(
      formatPcTransferResult({ kind: "deposited", name, boxIndex: 0, slotIndex: 1 }),
      `${object} PC 박스에 보관했다.`,
    );
    assert.equal(
      formatPcTransferResult({ kind: "withdrawn", name, boxIndex: 0, slotIndex: 1 }),
      `${object} 파티로 데려왔다.`,
    );
    assert.equal(
      formatPcTransferResult({ kind: "swapped", name }),
      `${conjunction} 파티 포켓몬을 교체했다.`,
    );
  });
}

test("진화 메시지에서 ㄹ 받침과 다른 받침, 무받침을 구분한다", () => {
  assert.equal(
    formatRomEvolutionSuccessMessage("파이리", "리자드"),
    "축하합니다! 파이리\n리자드로 진화했습니다!",
  );
  assert.equal(
    formatRomEvolutionSuccessMessage("리자드", "리자몽"),
    "축하합니다! 리자드\n리자몽으로 진화했습니다!",
  );
  assert.equal(
    formatRomEvolutionSuccessMessage("아기", "마릴"),
    "축하합니다! 아기\n마릴로 진화했습니다!",
  );
});

test("기술 선택 안내의 한국어만 조사를 붙인다", () => {
  assert.equal(
    getPokeLoungeCopy("ko-KR").game.moveLearnPrompt("전광석화"),
    "전광석화를 배우려면 잊을 기술 선택",
  );
  assert.equal(
    getPokeLoungeCopy("ko-KR").game.moveLearnPrompt("공격"),
    "공격을 배우려면 잊을 기술 선택",
  );
  assert.ok(!getPokeLoungeCopy("en-US").game.moveLearnPrompt("Quick Attack").includes("을"));
  assert.ok(!getPokeLoungeCopy("ja-JP").game.moveLearnPrompt("でんこうせっか").includes("을"));
});

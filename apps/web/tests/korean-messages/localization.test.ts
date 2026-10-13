import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeRuntimeText } from "../../src/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import {
  formatLearnedMoveMessage,
  formatReplacedMoveMessage,
  formatSkippedMoveMessage,
} from "../../../../packages/poke-lounge-battle/src/adventure/battle/level-up-moves";
import { formatRomEvolutionSuccessMessage } from "../../../../packages/poke-lounge-battle/src/adventure/battle/evolution-presentation";
import { formatPcTransferResult } from "../../src/features/poke-lounge/presentation/world/pc-transfer-message";

const translations = [
  ["야생 피카츄가 나타났다!", "A wild Pikachu appeared!", "野生のピカチュウが現れた！"],
  ["야생 마릴이 나타났다!", "A wild Marill appeared!", "野生のマリルが現れた！"],
  ["피카츄의 방어가 떨어졌다!", "Pikachu's Defense fell!", "ピカチュウの防御が下がった！"],
  ["마릴의 공격이 올랐다!", "Marill's Attack rose!", "マリルの攻撃が上がった！"],
  [
    "마릴의 방어는 더 이상 떨어지지 않는다!",
    "Marill's Defense won't go any lower!",
    "マリルの防御はこれ以上下がらない！",
  ],
  [
    "피카츄의 공격은 더 이상 오르지 않는다!",
    "Pikachu's Attack won't go any higher!",
    "ピカチュウの攻撃はこれ以上上がらない！",
  ],
  ["피카츄는 쓰러졌다!", "Pikachu fainted!", "ピカチュウは倒れた！"],
  ["마릴은 쓰러졌다!", "Marill fainted!", "マリルは倒れた！"],
  ["피카츄는 마비 상태다!", "Pikachu is paralyzed!", "ピカチュウはまひしている！"],
  ["마릴은 독에 걸렸다!", "Marill was poisoned!", "マリルはどく状態になった！"],
  ["몬스터볼을 던졌다!", "Threw a Poké Ball!", "モンスターボールを投げた！"],
  ["피카츄를 잡았다!", "Caught Pikachu!", "ピカチュウを捕まえた！"],
  ["마릴을 잡았다!", "Caught Marill!", "マリルを捕まえた！"],
  ["마릴이 볼에서 나왔다!", "Marill broke free!", "マリルがボールから出てしまった！"],
  ["몬스터볼이 없다!", "You don't have any Poké Ball!", "モンスターボールを持っていない！"],
  ["민수가 피카츄를 내보냈다!", "민수 sent out Pikachu!", "민수はピカチュウを繰り出した！"],
  ["민석이 마릴을 내보냈다!", "민석 sent out Marill!", "민석はマリルを繰り出した！"],
  ["Player 10이 마릴을 내보냈다!", "Player 10 sent out Marill!", "Player 10はマリルを繰り出した！"],
  ["피카츄는 Lv.10이 되었다!", "Pikachu grew to Lv.10!", "ピカチュウはLv.10になった！"],
  ["마릴은 Lv.12가 되었다!", "Marill grew to Lv.12!", "マリルはLv.12になった！"],
  [
    "피카츄는 120 경험치를 얻었다!",
    "Pikachu gained 120 Exp. Points!",
    "ピカチュウは経験値を120もらった！",
  ],
  ["마릴은 20 경험치를 얻었다!", "Marill gained 20 Exp. Points!", "マリルは経験値を20もらった！"],
  ["민수 120 경험치를 얻었다!", "민수 gained 120 Exp. Points!", "민수は経験値を120もらった！"],
  ["민수는 120 경험치를 얻었다!", "민수 gained 120 Exp. Points!", "민수は経験値を120もらった！"],
  [
    "피카츄에게 몬스터볼을 사용했다!",
    "Used Poké Ball on Pikachu!",
    "ピカチュウにモンスターボールを使った！",
  ],
  [
    "기술이 몸통박치기에서 방어로 바뀌었다!",
    "Tackle was replaced by Protect!",
    "たいあたりを忘れてまもるを覚えた！",
  ],
  [
    "기술이 몸통박치기에서 마릴로 바뀌었다!",
    "Tackle was replaced by Marill!",
    "たいあたりを忘れてマリルを覚えた！",
  ],
  [
    "기술이 몸통박치기에서 리자몽으로 바뀌었다!",
    "Tackle was replaced by Charizard!",
    "たいあたりを忘れてリザードンを覚えた！",
  ],
  [
    formatLearnedMoveMessage("마릴", "전광석화"),
    "Marill learned Quick Attack!",
    "マリルはでんこうせっかを覚えた！",
  ],
  [
    formatReplacedMoveMessage("피카츄", "몸통박치기", "전광석화"),
    "Pikachu forgot Tackle and learned Quick Attack!",
    "ピカチュウはたいあたりを忘れてでんこうせっかを覚えた！",
  ],
  [
    formatSkippedMoveMessage("마릴", "전광석화"),
    "Marill did not learn Quick Attack.",
    "マリルはでんこうせっかを覚えなかった。",
  ],
  [
    formatPcTransferResult({ kind: "deposited", name: "피카츄", boxIndex: 0, slotIndex: 1 }),
    "Stored Pikachu in the PC Box.",
    "ピカチュウをPCボックスに預けました。",
  ],
  [
    formatPcTransferResult({ kind: "withdrawn", name: "마릴", boxIndex: 0, slotIndex: 1 }),
    "Added Marill to your party.",
    "マリルを手持ちに加えました。",
  ],
  [
    formatPcTransferResult({ kind: "swapped", name: "마릴" }),
    "Swapped a party Pokémon with Marill.",
    "手持ちのポケモンとマリルを入れ替えました。",
  ],
  [
    formatPcTransferResult({ kind: "swapped", name: "피카츄" }),
    "Swapped a party Pokémon with Pikachu.",
    "手持ちのポケモンとピカチュウを入れ替えました。",
  ],
  [
    formatRomEvolutionSuccessMessage("파이리", "리자드"),
    "Congratulations! Charmander\nEvolved into Charmeleon!",
    "おめでとう！ ヒトカゲ\nリザードに進化した！",
  ],
  [
    formatRomEvolutionSuccessMessage("리자드", "리자몽"),
    "Congratulations! Charmeleon\nEvolved into Charizard!",
    "おめでとう！ リザード\nリザードンに進化した！",
  ],
  // Messages received from an older server still translate during a rollout.
  ["야생 마릴이(가) 나타났다!", "A wild Marill appeared!", "野生のマリルが現れた！"],
  [
    "피카츄은(는) 전광석화을(를) 배웠다!",
    "Pikachu learned Quick Attack!",
    "ピカチュウはでんこうせっかを覚えた！",
  ],
  [
    "피카츄와(과) 파티 포켓몬을 교체했다.",
    "Swapped a party Pokémon with Pikachu.",
    "手持ちのポケモンとピカチュウを入れ替えました。",
  ],
  ["리자몽(으)로 진화했습니다!", "Evolved into Charizard!", "リザードンに進化した！"],
] as const;

for (const [korean, english, japanese] of translations) {
  test(`영어 번역: ${korean}`, () => {
    assert.equal(localizeRuntimeText(korean, "en-US"), english);
  });
  test(`일본어 번역: ${korean}`, () => {
    assert.equal(localizeRuntimeText(korean, "ja-JP"), japanese);
  });
  test(`한국어 문구 유지: ${korean}`, () => {
    assert.equal(localizeRuntimeText(korean, "ko-KR"), korean);
  });
}

test("빈 문구와 사전 용어가 없는 문구를 보존하고 기본 언어는 한국어로 처리한다", () => {
  for (const locale of ["ko-KR", "en-US", "ja-JP", undefined, null]) {
    assert.equal(localizeRuntimeText("", locale), "");
    assert.equal(
      localizeRuntimeText("UNRECOGNIZED MESSAGE <Player 1>", locale),
      "UNRECOGNIZED MESSAGE <Player 1>",
    );
  }
  assert.equal(localizeRuntimeText("마릴은 쓰러졌다!"), "마릴은 쓰러졌다!");
});

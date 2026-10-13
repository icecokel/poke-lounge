import { GEN4_ROM_ITEMS } from "../../../../packages/poke-lounge-battle/src/gen4/rom-catalog.generated";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PokeLoungeNoticeBanner } from "../../src/components/poke-lounge/poke-lounge-game-overlays";
import { getPokeLoungeCopy } from "../../src/components/poke-lounge/poke-lounge-copy";
import { localizePokeLoungeAccessibleSceneStatus } from "../../src/components/poke-lounge/runtime/game/ui/accessible-game-summary";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localizeItemName,
  localizeTrainerName,
  localizePokemonStatus,
  localizeRuntimeText,
} from "../../src/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
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

const missedMessages = [
  [
    "피카츄는 독에 의한 데미지를 입었다!",
    "Pikachu was hurt by poison!",
    "ピカチュウはどくのダメージを受けた！",
  ],
  [
    "피카츄는 화상에 의한 데미지를 입었다!",
    "Pikachu was hurt by its burn!",
    "ピカチュウはやけどのダメージを受けた！",
  ],
  ["공격이 빗나갔다!", "The attack missed!", "攻撃は外れた！"],
  ["효과가 없다!", "It had no effect!", "効果がない！"],
  ["하지만 실패했다!", "But it failed!", "しかし失敗した！"],
  ["효과가 굉장했다!", "It's super effective!", "効果は抜群だ！"],
  ["그러나 아무 일도 일어나지 않았다!", "But nothing happened!", "しかし何も起こらなかった！"],
  ["피카츄의 HP가 회복되었다!", "Pikachu's HP was restored!", "ピカチュウのHPが回復した！"],
  [
    "피카츄의 상태이상이 회복되었다!",
    "Pikachu was cured of its status condition!",
    "ピカチュウの状態異常が治った！",
  ],
  ["피카츄는 독 상태가 되었다!", "Pikachu was poisoned!", "ピカチュウはどく状態になった！"],
  ["마릴은 맹독 상태가 되었다!", "Marill was badly poisoned!", "マリルはもうどく状態になった！"],
  ["피카츄는 화상 상태가 되었다!", "Pikachu was burned!", "ピカチュウはやけどを負った！"],
  ["피카츄는 마비 상태가 되었다!", "Pikachu was paralyzed!", "ピカチュウはまひしてしまった！"],
  ["피카츄는 잠듦 상태가 되었다!", "Pikachu fell asleep!", "ピカチュウは眠ってしまった！"],
  ["피카츄는 얼음 상태가 되었다!", "Pikachu was frozen solid!", "ピカチュウは凍ってしまった！"],
  [
    "피카츄는 상태이상 상태가 되었다!",
    "Pikachu got a status condition!",
    "ピカチュウは状態異常になった！",
  ],
  [
    "피카츄에게 추가 데미지!",
    "Pikachu took damage from an additional effect!",
    "ピカチュウは追加効果でダメージを受けた！",
  ],
  [
    "피카츄에게 독 데미지!",
    "Pikachu took damage from poison!",
    "ピカチュウはどくでダメージを受けた！",
  ],
  [
    "피카츄는 반동으로 움직일 수 없다!",
    "Pikachu can't move because it must recharge!",
    "ピカチュウは反動で動けない！",
  ],
  [
    "피카츄는 혼란 때문에 행동할 수 없다!",
    "Pikachu can't act because of confusion!",
    "ピカチュウは混乱で動けない！",
  ],
  [
    "피카츄는 풀죽음 때문에 행동할 수 없다!",
    "Pikachu can't act because of flinching!",
    "ピカチュウはひるみで動けない！",
  ],
  [
    "피카츄는 마비 때문에 행동할 수 없다!",
    "Pikachu can't act because of paralysis!",
    "ピカチュウはまひで動けない！",
  ],
  [
    "피카츄는 잠듦 때문에 행동할 수 없다!",
    "Pikachu can't act because of sleep!",
    "ピカチュウはねむりで動けない！",
  ],
  [
    "피카츄는 얼음 때문에 행동할 수 없다!",
    "Pikachu can't act because of being frozen!",
    "ピカチュウはこおりで動けない！",
  ],
  [
    "피카츄는 기술 효과 때문에 행동할 수 없다!",
    "Pikachu can't act because of a move effect!",
    "ピカチュウはわざの効果で動けない！",
  ],
  [
    "피카츄는 솔라빔을 준비하고 있다!",
    "Pikachu is preparing Solar Beam!",
    "ピカチュウはソーラービームを準備している！",
  ],
  [
    "마릴은 공중날기를 준비하고 있다!",
    "Marill is preparing Fly!",
    "マリルはそらをとぶを準備している！",
  ],
  [
    "피카츄는 다음 턴에 쉬어야 한다!",
    "Pikachu must recharge next turn!",
    "ピカチュウは次のターンに休まなければならない！",
  ],
  ["비가 계속되고 있다!", "The rain continues!", "雨が続いている！"],
  ["모래바람가 계속되고 있다!", "The sandstorm continues!", "砂嵐が続いている！"],
  ["비로 날씨가 바뀌었다!", "The weather changed to rain!", "天気が雨に変わった！"],
  [
    "쾌청로 날씨가 바뀌었다!",
    "The weather changed to harsh sunlight!",
    "天気が強い日差しに変わった！",
  ],
  ["싸라기눈로 날씨가 바뀌었다!", "The weather changed to hail!", "天気があられに変わった！"],
  ["날씨 종료로 날씨가 바뀌었다!", "The weather changed to clear skies!", "天気が晴れに変わった！"],
  [
    "피카츄: 방어 효과가 적용되었다!",
    "Pikachu: Protect took effect!",
    "ピカチュウ：まもるの効果が発動した！",
  ],
  ["피카츄: 혼란 효과가 끝났다!", "Pikachu: confusion ended!", "ピカチュウ：混乱の効果が切れた！"],
  ["피카츄의 특성이 발동했다!", "Pikachu's Ability activated!", "ピカチュウの特性が発動した！"],
  ["피카츄: 오랭열매를 사용했다!", "Pikachu used Oran Berry!", "ピカチュウはオレンのみを使った！"],
  [
    "피카츄: 오랭열매의 효과!",
    "Pikachu's Oran Berry took effect!",
    "ピカチュウのオレンのみが発動した！",
  ],
  [
    "피카츄: 지닌 도구의 효과!",
    "Pikachu's held item took effect!",
    "ピカチュウの持ち物が発動した！",
  ],
  ["2번 맞았다!", "Hit 2 times!", "2回当たった！"],
  [
    "피카츄는 전투에서 벗어났다!",
    "Pikachu escaped from battle!",
    "ピカチュウはバトルから逃げ出した！",
  ],
  [
    "피카츄: 100 경험치를 얻었다!",
    "Pikachu gained 100 Exp. Points!",
    "ピカチュウは経験値を100もらった！",
  ],
  [
    "피카츄: 100 경험치를 얻었다! 레벨 10 → 11!",
    "Pikachu gained 100 Exp. Points! Level 10 → 11!",
    "ピカチュウは経験値を100もらった！ レベル10 → 11！",
  ],
  [
    "야생 포켓몬에게만 몬스터볼을 던질 수 있습니다.",
    "You can only throw Poké Balls at wild Pokémon.",
    "モンスターボールは野生のポケモンにだけ投げられます。",
  ],
  [
    "성장 결과를 저장하지 못했습니다. 다시 확인해 주세요.",
    "Couldn't save the growth results. Please confirm again.",
    "成長結果を保存できませんでした。もう一度確認してください。",
  ],
  [
    "파티를 저장하지 못했습니다. 다시 확인해 주세요.",
    "Couldn't save your party. Please confirm again.",
    "手持ちを保存できませんでした。もう一度確認してください。",
  ],
] as const;

for (const [korean, english, japanese] of missedMessages) {
  test(`미번역 문구 회귀: ${korean}`, () => {
    assert.equal(localizeRuntimeText(korean, "en-US"), english);
    assert.equal(localizeRuntimeText(korean, "ja-JP"), japanese);
    assert.equal(localizeRuntimeText(korean, "ko-KR"), korean);
  });
}

for (const [status, korean, english, japanese] of [
  ["normal", "정상", "Normal", "正常"],
  ["poisoned", "독", "Poisoned", "どく"],
  ["badlyPoisoned", "맹독", "Badly poisoned", "もうどく"],
  ["burned", "화상", "Burned", "やけど"],
  ["paralyzed", "마비", "Paralyzed", "まひ"],
  ["asleep", "잠듦", "Asleep", "ねむり"],
  ["frozen", "얼음", "Frozen", "こおり"],
  ["fainted", "전투불능", "Fainted", "ひんし"],
] as const) {
  test(`상태 표시: ${status}`, () => {
    assert.equal(localizePokemonStatus(status, "ko-KR"), korean);
    assert.equal(localizePokemonStatus(status, "en-US"), english);
    assert.equal(localizePokemonStatus(status, "ja-JP"), japanese);
  });
}

test("알 수 없는 상태 코드와 이미 번역된 메시지를 보존한다", () => {
  assert.equal(localizePokemonStatus("future-status", "en-US"), "future-status");
  assert.equal(
    localizeRuntimeText("Move selection time is up.", "en-US"),
    "Move selection time is up.",
  );
});

for (const [korean, english, japanese] of [
  [
    "기술 선택 시간이 끝났습니다. 선택하지 않은 기술은 배우지 않습니다.",
    "Move selection time is up. Unselected moves will not be learned.",
    "わざを選ぶ時間が終了しました。選ばなかったわざは覚えません。",
  ],
  [
    "다음 경기가 배정되어 선택한 기술을 반영하지 못했습니다.",
    "The next match was assigned before the selected moves could be saved.",
    "次の試合が決まったため、選んだわざを反映できませんでした。",
  ],
  [
    "포획한 피카츄, 파티가 가득 차 PC 박스로 전송했습니다.",
    "Your party was full, so the caught Pikachu was sent to the PC Box.",
    "捕まえたピカチュウは手持ちがいっぱいのためPCボックスへ送られました。",
  ],
] as const) {
  test(`알림 배너 렌더링: ${korean}`, () => {
    for (const [locale, expected] of [
      ["ko-KR", korean],
      ["en-US", english],
      ["ja-JP", japanese],
    ] as const) {
      const markup = renderToStaticMarkup(
        createElement(PokeLoungeNoticeBanner, {
          copy: getPokeLoungeCopy(locale),
          message: korean,
          tone: "info",
          onClose() {},
        }),
      );
      assert.ok(markup.includes(expected), markup);
      if (locale !== "ko-KR") assert.ok(!markup.includes(korean), markup);
    }
  });
}

for (const interaction of [
  "전광석화를 배우기 위해 몸통박치기를 잊도록 선택했습니다.",
  "방어를 배우기 위해 공격을 잊도록 선택했습니다.",
  "공격을 배우기 위해 방어를 잊도록 선택했습니다.",
  "공격을 배우기 위해 공격을 잊도록 선택했습니다.",
  "전광석화을(를) 배우기 위해 몸통박치기을(를) 잊도록 선택했습니다.",
]) {
  test(`스크린리더 기술 교체 안내: ${interaction}`, () => {
    const raw = `내 피카츄 HP 20/30. 상대 마릴 HP 10/20. ${interaction}`;
    assert.ok(
      localizePokeLoungeAccessibleSceneStatus(raw, "en-US").endsWith(
        "Selected the move to forget before learning the new move.",
      ),
    );
    assert.ok(
      localizePokeLoungeAccessibleSceneStatus(raw, "ja-JP").endsWith(
        "新しいわざを覚えるため、忘れるわざを選びました。",
      ),
    );
    assert.equal(localizePokeLoungeAccessibleSceneStatus(raw, "ko-KR"), raw);
  });
}

test("몬스터볼 명령을 스크린리더에서 가방이나 일반 갱신 안내로 바꾸지 않는다", () => {
  const raw = "내 피카츄 HP 20/30. 상대 마릴 HP 10/20. 전투 명령 몬스터볼 선택.";
  assert.ok(
    localizePokeLoungeAccessibleSceneStatus(raw, "en-US").endsWith(
      "Battle command selected: Poké Ball.",
    ),
  );
  assert.ok(
    localizePokeLoungeAccessibleSceneStatus(raw, "ja-JP").endsWith(
      "バトルコマンド「モンスターボール」を選択。",
    ),
  );
});

for (const [romId, english, japanese] of [
  [155, "Oran Berry", "オレンのみ"],
  [158, "Sitrus Berry", "オボンのみ"],
  [234, "Leftovers", "たべのこし"],
  [270, "Life Orb", "いのちのたま"],
] as const) {
  test(`4세대 ROM 번호와 PokeAPI 번호가 다른 지닌 도구: ${romId}`, () => {
    const name = GEN4_ROM_ITEMS[romId].name;
    assert.equal(localizeItemName(name, "ko-KR"), name);
    assert.equal(localizeItemName(name, "en-US"), english);
    assert.equal(localizeItemName(name, "ja-JP"), japanese);
    assert.equal(
      localizeRuntimeText(`피카츄: ${name}의 효과!`, "en-US"),
      `Pikachu's ${english} took effect!`,
    );
    assert.equal(
      localizeRuntimeText(`피카츄: ${name}의 효과!`, "ja-JP"),
      `ピカチュウの${japanese}が発動した！`,
    );
  });
}

test("야생전 상대 트레이너 라벨도 포켓몬 이름과 함께 번역한다", () => {
  assert.equal(localizeTrainerName("야생 꼬링크", "en-US"), "Wild Shinx");
  assert.equal(localizeTrainerName("야생 꼬링크", "ja-JP"), "野生のコリンク");
  assert.equal(localizeTrainerName("야생 꼬링크", "ko-KR"), "야생 꼬링크");
  assert.equal(localizeTrainerName("Player 1", "en-US"), "Player 1");
});

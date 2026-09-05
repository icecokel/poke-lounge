import assert from "node:assert/strict";
import test from "node:test";
import {
  localizeItemDescription,
  localizeItemName,
  localizeMoveName,
  localizePokemonName,
  localizeRuntimeText,
  localizeTrainerName,
  localizeTypeName,
} from "./runtime-game-localization";

const HANGUL = /[가-힣]/;

test("공식 게임 용어를 영어와 일본어로 지역화한다", function testCase() {
  assert.equal(localizePokemonName("리아코", "en-US"), "Totodile");
  assert.equal(localizePokemonName("리아코", "ja-JP"), "ワニノコ");
  assert.equal(localizeMoveName("물기", "en-US"), "Bite");
  assert.equal(localizeMoveName("물기", "ja-JP"), "かみつく");
  assert.equal(localizeTypeName("물", "en-US"), "Water");
  assert.equal(localizeTypeName("Water", "ja-JP"), "みず");
  assert.equal(localizeItemName("상처약", "en-US"), "Potion");
  assert.equal(localizeItemName("상처약", "ja-JP"), "キズぐすり");
  assert.equal(localizeTrainerName("미러 트레이너", "en-US"), "Mirror Trainer");
  assert.equal(localizeTrainerName("미러 트레이너", "ja-JP"), "ミラートレーナー");
  assert.match(localizeItemDescription("원문", "상처약", "en-US"), /restores the HP/i);
  assert.match(localizeItemDescription("원문", "상처약", "ja-JP"), /ＨＰ/);
});

test("전투·필드·토너먼트의 동적 문장을 의미를 유지해 지역화한다", function testCase() {
  const samples = [
    "야생 리아코가 나타났다!",
    "가랏! 리아코!",
    "리아코의 물기!",
    "효과는 굉장했다!",
    "효과가 별로인 듯하다...",
    "효과가 없는 것 같다...",
    "리아코의 공격은 빗나갔다!",
    "리아코는 몸이 저려서 움직일 수 없다!",
    "리아코는 반동 데미지를 입었다!",
    "리아코는 이미 독에 걸려 있다!",
    "리아코는 이미 상태 이상이다!",
    "리아코는 독에 걸렸다!",
    "리아코는 화상을 입었다!",
    "리아코는 마비되어 기술이 나오기 어려워졌다!",
    "리아코 64 경험치를 얻었다!",
    "팀 전원이 각각 500 경험치를 얻었다!\n₽ 300을 얻었다!",
    "리아코 경험치 64과 ₽ 300을 얻었다!",
    "₽ 300을 얻었다!",
    "리아코는 Lv.14가 되었다!",
    "반바지 꼬마 오성가 리아코을 내보냈다!",
    "리아코의 공격은 더 이상 오르지 않는다!",
    "리아코의 방어가 올랐다!",
    "리아코의 스피드가 크게 떨어졌다!",
    "리아코는 물기를 배웠다!",
    "리아코는 독 데미지를 입었다!",
    "리아코는 물기를 잊고 깨물어부수기를 배웠다!",
    "리아코는 물기를 배우지 않았다!",
    "리아코에게 상처약을 사용했다!",
    "리아코의 HP가 회복됐다!",
    "리아코는 다시 일어났다!",
    "리아코의 레벨이 올랐다!",
    "리아코의 독이 사라졌다!",
    "상처약을 구매했다.",
    "상처약을 사용할 대상을 선택해라.",
    "기술이 물기에서 깨물어부수기로 바뀌었다!",
    "물기 습득을 취소했다.",
    "리아코을 PC 박스에 보관했다.",
    "리아코을 파티로 데려왔다.",
    "리아코와 파티 포켓몬을 교체했다.",
    "3이 나왔다. 예측 성공! ₽ 1,000을 받았다.",
    "2가 나왔다. 예측 실패. ₽ 500을 잃었다.",
    "포획한 리아코, 파티가 가득 차 PC 박스로 전송했습니다.",
    "...오잉!?\n리아코의 모습이...!",
    "축하합니다! 리아코\n엘리게이로 진화했습니다!",
    "A · 기본 상점",
    "라운지 마을 · 서쪽 야생초원",
    "라운드 1/3 준비 중 · 00:30",
    "라운드 1/3\n다른 플레이어를 기다리는 중...",
    "미러 트레이너가 리아코을 내보냈다!",
    "8강 · #4 Player 4 vs #5 Player 5",
    "부전승 · #1 Player 1 · #3 Player 3",
    "이후 · 4강 2경기 → 결승",
    "내 위치 · 부전승 · 4강 진출",
    "내 상태 · #4 Player 4 · 참가 · 준비 · 접속",
    "우승 · 공동 1위 Player 1 · 이번 +50 · 방 점수 120",
    "서버 방을 만들지 못했습니다 (503). 연결을 확인한 뒤 다시 시도해 주세요.",
    "파티 정보를 서버와 동기화하지 못했습니다 (409). 다시 시도해 주세요.",
  ];

  for (const locale of ["en-US", "ja-JP"] as const) {
    for (const sample of samples) {
      const result = localizeRuntimeText(sample, locale);
      assert.doesNotMatch(result, HANGUL, `${locale}: ${sample} -> ${result}`);
    }
  }
});

test("한국어 로케일은 ROM 원문을 그대로 유지한다", function testCase() {
  assert.equal(localizePokemonName("리아코", "ko-KR"), "리아코");
  assert.equal(localizeRuntimeText("리아코의 물기!", "ko-KR"), "리아코의 물기!");
});

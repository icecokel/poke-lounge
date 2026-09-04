import { resolvePokeLoungeLocale, type PokeLoungeLocale } from "../../../poke-lounge-copy";
import type { BattlePresentationState } from "../battle/battle-ui-store";
import type { MobileBattleUiState } from "../ui/mobile-battle-ui";
import type { MobileWorldUiState } from "../ui/mobile-world-ui";
import catalogJson from "./runtime-game-terms.generated.json";

type RuntimeTranslationLocale = Exclude<PokeLoungeLocale, "ko-KR">;
type LocalizedTerm = Record<RuntimeTranslationLocale, string>;
type LocalizedItem = Record<
  RuntimeTranslationLocale,
  { readonly description: string; readonly name: string }
>;

interface RuntimeTermCatalog {
  readonly pokemon: Record<string, LocalizedTerm>;
  readonly moves: Record<string, LocalizedTerm>;
  readonly types: Record<string, LocalizedTerm>;
  readonly items: Record<string, LocalizedItem>;
}

const catalog = catalogJson as RuntimeTermCatalog;

const AI_TRAINER_NAMES: Record<string, LocalizedTerm> = {
  상대: { "en-US": "Opponent", "ja-JP": "相手" },
  "미러 트레이너": { "en-US": "Mirror Trainer", "ja-JP": "ミラートレーナー" },
  "반바지 꼬마 오성": { "en-US": "Youngster Osung", "ja-JP": "たんぱんこぞう オソン" },
  "반바지 꼬마 강철": { "en-US": "Youngster Gangcheol", "ja-JP": "たんぱんこぞう ガンチョル" },
  "반바지 꼬마 정수": { "en-US": "Youngster Jeongsu", "ja-JP": "たんぱんこぞう ジョンス" },
  "곤충채집소년 미키": { "en-US": "Bug Catcher Miki", "ja-JP": "むしとりしょうねん ミキ" },
  "곤충채집소년 광일": { "en-US": "Bug Catcher Gwangil", "ja-JP": "むしとりしょうねん グァンイル" },
  "피크닉걸 은향": { "en-US": "Picnicker Eunhyang", "ja-JP": "ピクニックガール ウニャン" },
  "캠프보이 고광": { "en-US": "Camper Gogwang", "ja-JP": "キャンプボーイ ゴグァン" },
  "낚시꾼 세형": { "en-US": "Fisher Sehyung", "ja-JP": "つりびと セヒョン" },
  "낚시꾼 주원": { "en-US": "Fisher Juwon", "ja-JP": "つりびと ジュウォン" },
  "낚시꾼 태명": { "en-US": "Fisher Taemyeong", "ja-JP": "つりびと テミョン" },
  "새조련사 선정": { "en-US": "Bird Keeper Seonjeong", "ja-JP": "とりつかい ソンジョン" },
  "등산가 스톰": { "en-US": "Hiker Storm", "ja-JP": "やまおとこ ストーム" },
  "애호가클럽 동휘": { "en-US": "Pokéfan Donghwi", "ja-JP": "だいすきクラブ ドンフィ" },
  "쌍둥이 아롱&다롱": { "en-US": "Twins Arong & Darong", "ja-JP": "ふたごちゃん アロン＆ダロン" },
  "불놀이꾼 다인": { "en-US": "Firebreather Dain", "ja-JP": "ひふきやろう ダイン" },
  "선원 시현": { "en-US": "Sailor Sihyeon", "ja-JP": "ふなのり シヒョン" },
  "저글러 죤": { "en-US": "Juggler John", "ja-JP": "ジャグラー ジョン" },
  "피크닉걸 진미": { "en-US": "Picnicker Jinmi", "ja-JP": "ピクニックガール ジンミ" },
};

const EXACT_RUNTIME_TEXT: Record<string, LocalizedTerm> = {
  "전투가 종료되었다. 확인을 누르면 필드로 돌아간다.": {
    "en-US": "The battle is over. Confirm to return to the field.",
    "ja-JP": "バトルが終了しました。決定するとフィールドに戻ります。",
  },
  "전투가 종료되었습니다.": { "en-US": "The battle has ended.", "ja-JP": "バトルが終了しました。" },
  "도망칠 수 없었다!": { "en-US": "Couldn't escape!", "ja-JP": "逃げられなかった！" },
  "도망칠 수 없다!": { "en-US": "Can't escape!", "ja-JP": "逃げられない！" },
  "무사히 도망쳤다!": { "en-US": "Got away safely!", "ja-JP": "無事に逃げ切れた！" },
  "아직 사용할 수 없다.": { "en-US": "You can't use that yet.", "ja-JP": "まだ使えません。" },
  "지금은 쓸 수 없다.": { "en-US": "You can't use that now.", "ja-JP": "今は使えません。" },
  "효과가 없다.": { "en-US": "It had no effect.", "ja-JP": "効果がありません。" },
  "효과가 없는 것 같다...": {
    "en-US": "It doesn't seem to affect the target...",
    "ja-JP": "効果がないようだ...",
  },
  "효과는 굉장했다!": {
    "en-US": "It's super effective!",
    "ja-JP": "効果は抜群だ！",
  },
  "효과가 별로인 듯하다...": {
    "en-US": "It's not very effective...",
    "ja-JP": "効果はいまひとつのようだ...",
  },
  "트레이너전에서는 사용할 수 없다.": {
    "en-US": "You can't use that in a Trainer battle.",
    "ja-JP": "トレーナー戦では使えません。",
  },
  "서버 대전에서는 사용할 수 없습니다.": {
    "en-US": "You can't use that in a server battle.",
    "ja-JP": "サーバー対戦では使えません。",
  },
  "선택한 행동을 사용할 수 없습니다.": {
    "en-US": "That action is unavailable.",
    "ja-JP": "選んだ行動は使えません。",
  },
  "교체할 수 없다.": { "en-US": "You can't switch now.", "ja-JP": "交代できません。" },
  "빈 슬롯이다.": { "en-US": "That slot is empty.", "ja-JP": "そのスロットは空です。" },
  "쓰러진 포켓몬은 나올 수 없다.": {
    "en-US": "A fainted Pokémon can't battle.",
    "ja-JP": "ひんしのポケモンは出せません。",
  },
  "이미 나와 있다.": {
    "en-US": "That Pokémon is already in battle.",
    "ja-JP": "すでにバトル中です。",
  },
  "그 기술은 사용할 수 없다.": {
    "en-US": "That move can't be used.",
    "ja-JP": "そのわざは使えません。",
  },
  "급소에 맞았다!": { "en-US": "A critical hit!", "ja-JP": "急所に当たった！" },
  "상대 포켓몬은 쓰러졌다!": {
    "en-US": "The opposing Pokémon fainted!",
    "ja-JP": "相手のポケモンは倒れた！",
  },
  "승리했다!": { "en-US": "You won!", "ja-JP": "勝利した！" },
  "승리했습니다.": { "en-US": "You won.", "ja-JP": "勝利しました。" },
  "패배했다!": { "en-US": "You lost!", "ja-JP": "敗北した！" },
  "패배했습니다.": { "en-US": "You lost.", "ja-JP": "敗北しました。" },
  "교체할 포켓몬을 선택해 주세요.": {
    "en-US": "Choose a Pokémon to switch in.",
    "ja-JP": "交代するポケモンを選んでください。",
  },
  "상대의 선택을 기다리는 중...": {
    "en-US": "Waiting for the other trainer...",
    "ja-JP": "相手の選択を待っています...",
  },
  "서버 상태를 다시 불러오는 중...": {
    "en-US": "Reloading server status...",
    "ja-JP": "サーバーの状態を再読み込みしています...",
  },
  "아래 터치 화면에서 행동을 선택하세요.": {
    "en-US": "Choose an action on the touch controls below.",
    "ja-JP": "下のタッチ画面で行動を選んでください。",
  },
  "전투 처리를 기다리는 중입니다.": {
    "en-US": "Waiting for the battle to resolve.",
    "ja-JP": "バトル処理を待っています。",
  },
  "효과 미지원": { "en-US": "Effect unsupported", "ja-JP": "効果未対応" },
  "부가 효과 미지원": { "en-US": "Secondary effect unsupported", "ja-JP": "追加効果未対応" },
  "포켓몬이 모두 회복됐다.": {
    "en-US": "All of your Pokémon are fully healed.",
    "ja-JP": "ポケモンはみんな元気になりました。",
  },
  "상품을 불러오는 중…": { "en-US": "Loading items…", "ja-JP": "商品を読み込んでいます…" },
  "판매 목록을 불러오지 못했다. 상점을 닫고 다시 시도해 주세요.": {
    "en-US": "The item list couldn't be loaded. Close the shop and try again.",
    "ja-JP": "商品一覧を読み込めませんでした。店を閉じてもう一度お試しください。",
  },
  "아직 살 수 있는 상품이 없다.": {
    "en-US": "There are no items available to buy yet.",
    "ja-JP": "まだ購入できる商品がありません。",
  },
  "돈이 부족하다.": { "en-US": "You don't have enough money.", "ja-JP": "お金が足りません。" },
  "구매할 수 없다.": { "en-US": "You can't buy that.", "ja-JP": "購入できません。" },
  "사용할 아이템이 없다.": {
    "en-US": "There are no usable items.",
    "ja-JP": "使えるどうぐがありません。",
  },
  "사용할 아이템이 없습니다.": {
    "en-US": "There are no usable items.",
    "ja-JP": "使えるどうぐがありません。",
  },
  "대상 포켓몬이 없다.": {
    "en-US": "There is no target Pokémon.",
    "ja-JP": "対象のポケモンがいません。",
  },
  "사용할 아이템을 다시 선택해라.": {
    "en-US": "Choose an item again.",
    "ja-JP": "使うどうぐを選び直してください。",
  },
  "기술 교체를 완료할 수 없다.": {
    "en-US": "Move replacement couldn't be completed.",
    "ja-JP": "わざの入れ替えを完了できません。",
  },
  "기술 교체 선택을 완료할 수 없다.": {
    "en-US": "Move replacement couldn't be completed.",
    "ja-JP": "わざの入れ替えを完了できません。",
  },
  "마지막 포켓몬은 보관할 수 없다.": {
    "en-US": "You can't store your last Pokémon.",
    "ja-JP": "最後のポケモンは預けられません。",
  },
  "선택한 파티 슬롯이 비어 있다.": {
    "en-US": "The selected party slot is empty.",
    "ja-JP": "選んだ手持ちスロットは空です。",
  },
  "박스가 비어 있다.": { "en-US": "The Box is empty.", "ja-JP": "ボックスは空です。" },
  "교체할 파티 포켓몬을 선택해라.": {
    "en-US": "Choose a party Pokémon to swap.",
    "ja-JP": "入れ替える手持ちポケモンを選んでください。",
  },
  "기절한 포켓몬은 선두 슬롯으로 교체할 수 없다.": {
    "en-US": "A fainted Pokémon can't be moved into the lead slot.",
    "ja-JP": "ひんしのポケモンは先頭スロットに移せません。",
  },
  "선택한 박스 슬롯이 비어 있다.": {
    "en-US": "The selected Box slot is empty.",
    "ja-JP": "選んだボックスのスロットは空です。",
  },
  "선택할 수 없는 예측이다.": {
    "en-US": "That prediction is unavailable.",
    "ja-JP": "その予想は選べません。",
  },
  "정산할 수 없다.": { "en-US": "The result couldn't be settled.", "ja-JP": "精算できません。" },
  "사용할 수 없는 아이템이다.": {
    "en-US": "That item can't be used.",
    "ja-JP": "そのどうぐは使えません。",
  },
  "멀티플레이 방의 최대 인원 8명이 모두 접속 중입니다.": {
    "en-US": "The multiplayer room is full with 8 connected players.",
    "ja-JP": "マルチプレイルームは接続中の8人で満員です。",
  },
  "쓰러진 포켓몬에게는 사용할 수 없다.": {
    "en-US": "You can't use that on a fainted Pokémon.",
    "ja-JP": "ひんしのポケモンには使えません。",
  },
  "필드 탐색": { "en-US": "Exploring the field", "ja-JP": "フィールド探索中" },
  "필드 조작": { "en-US": "Field controls", "ja-JP": "フィールド操作" },
  "필드 단축키": { "en-US": "Field shortcuts", "ja-JP": "フィールドのショートカット" },
  "필드 터치 조작": { "en-US": "Field touch controls", "ja-JP": "フィールドのタッチ操作" },
  "기술 교체": { "en-US": "Replace a move", "ja-JP": "わざの入れ替え" },
  "사용할 포켓몬": { "en-US": "Choose a Pokémon", "ja-JP": "使うポケモン" },
  가방: { "en-US": "Bag", "ja-JP": "バッグ" },
  "PC 박스": { "en-US": "PC Box", "ja-JP": "PCボックス" },
  "주사위 겜블": { "en-US": "Dice game", "ja-JP": "サイコロゲーム" },
  파티: { "en-US": "Party", "ja-JP": "手持ち" },
  "기본 상점": { "en-US": "Poké Mart", "ja-JP": "フレンドリィショップ" },
  "희귀 상점": { "en-US": "Rare shop", "ja-JP": "レアショップ" },
  상점: { "en-US": "Shop", "ja-JP": "ショップ" },
  "파티 회복": { "en-US": "Heal party", "ja-JP": "手持ちを回復" },
  "솔로 챌린지": { "en-US": "Solo challenge", "ja-JP": "ソロチャレンジ" },
  낮다: { "en-US": "Lower", "ja-JP": "小さい" },
  같다: { "en-US": "Equal", "ja-JP": "同じ" },
  높다: { "en-US": "Higher", "ja-JP": "大きい" },
  "준비 시간이 끝났습니다": {
    "en-US": "Preparation time is over",
    "ja-JP": "準備時間が終了しました",
  },
  "토너먼트 대기 중": { "en-US": "Waiting for the tournament", "ja-JP": "トーナメント待機中" },
  "경기 결과 전송 중": { "en-US": "Sending match result", "ja-JP": "試合結果を送信中" },
  "경기 결과 확인 중": { "en-US": "Checking match result", "ja-JP": "試合結果を確認中" },
  "서버 상태를 복구하고 있습니다": {
    "en-US": "Restoring server status",
    "ja-JP": "サーバーの状態を復旧しています",
  },
  "경기 결과 동기화 실패": {
    "en-US": "Match result sync failed",
    "ja-JP": "試合結果の同期に失敗しました",
  },
  "서버 상태를 다시 불러오고 있습니다": {
    "en-US": "Reloading server status",
    "ja-JP": "サーバーの状態を再読み込みしています",
  },
  "서버 토너먼트": { "en-US": "Server tournament", "ja-JP": "サーバートーナメント" },
  "전투 규칙 · 육성 파티 · 레벨 유지": {
    "en-US": "Battle rules · trained party · levels retained",
    "ja-JP": "バトルルール · 育成した手持ち · レベル維持",
  },
  "원격 캐주얼전 미지원 · 로그인 후 재참가 또는 방 나가기": {
    "en-US": "Remote casual battles are unavailable · sign in and rejoin, or leave the room",
    "ja-JP": "リモートカジュアル戦は未対応 · ログインして再参加するか、ルームを退出してください",
  },
  "대진 확정 대기": { "en-US": "Waiting for the bracket", "ja-JP": "組み合わせ確定待ち" },
  "대기실 · 모든 사람이 준비하면 방장이 시작": {
    "en-US": "Lobby · the host starts when everyone is ready",
    "ja-JP": "ロビー · 全員の準備後にホストが開始",
  },
  "토너먼트 완료": { "en-US": "Tournament complete", "ja-JP": "トーナメント完了" },
  "전투 준비 중": { "en-US": "Preparing battle", "ja-JP": "バトル準備中" },
  "방이 종료되었습니다": { "en-US": "The room has closed", "ja-JP": "ルームが終了しました" },
  "대진 준비 중": { "en-US": "Preparing bracket", "ja-JP": "組み合わせ準備中" },
  "참가 정보 확인 중": { "en-US": "Checking participant details", "ja-JP": "参加情報を確認中" },
  "서버 권위전 · 공개 랭킹 반영": {
    "en-US": "Server-authoritative match · counts toward public ranking",
    "ja-JP": "サーバー権威試合 · 公開ランキング対象",
  },
  "서버 권위전 · 공개 랭킹 미반영": {
    "en-US": "Server-authoritative match · not included in public ranking",
    "ja-JP": "サーバー権威試合 · 公開ランキング対象外",
  },
  "캐주얼전 · 공개 랭킹 미반영": {
    "en-US": "Casual match · not included in public ranking",
    "ja-JP": "カジュアル戦 · 公開ランキング対象外",
  },
  "경기 권위 확정 대기 · 공개 랭킹 반영 여부 확인 중": {
    "en-US": "Waiting for match verification · checking public ranking eligibility",
    "ja-JP": "試合検証待ち · 公開ランキング対象を確認中",
  },
  "솔로 모드": { "en-US": "Solo mode", "ja-JP": "ソロモード" },
  "랭킹 미반영": { "en-US": "Not included in ranking", "ja-JP": "ランキング対象外" },
  "계정 기록": { "en-US": "Account record", "ja-JP": "アカウント記録" },
  "토너먼트 진행": { "en-US": "Tournament in progress", "ja-JP": "トーナメント進行中" },
  결과: { "en-US": "Result", "ja-JP": "結果" },
  "최종 결과": { "en-US": "Final results", "ja-JP": "最終結果" },
  "라운드 대기": { "en-US": "Waiting for round", "ja-JP": "ラウンド待機中" },
  "다른 플레이어를 기다리는 중...": {
    "en-US": "Waiting for other players...",
    "ja-JP": "ほかのプレイヤーを待っています...",
  },
  "챔피언십 종료": { "en-US": "Finish championship", "ja-JP": "チャンピオンシップ終了" },
  "다음 라운드 시작": { "en-US": "Start next round", "ja-JP": "次のラウンドを開始" },
  "공개 랭킹 반영": {
    "en-US": "Counts toward public ranking",
    "ja-JP": "公開ランキング対象",
  },
  "공개 랭킹 미반영": {
    "en-US": "Not included in public ranking",
    "ja-JP": "公開ランキング対象外",
  },
  "라운지 마을 · 서쪽 야생초원": {
    "en-US": "Lounge Town · West Wilds",
    "ja-JP": "ラウンジタウン · 西の草原",
  },
  "라운지 마을 · 중앙 광장": {
    "en-US": "Lounge Town · Central Plaza",
    "ja-JP": "ラウンジタウン · 中央広場",
  },
  "라운지 마을 · 남쪽 산책로": {
    "en-US": "Lounge Town · South Path",
    "ja-JP": "ラウンジタウン · 南の遊歩道",
  },
};

interface RuntimeTextPattern {
  readonly pattern: RegExp;
  readonly replace: Record<
    RuntimeTranslationLocale,
    (match: string, ...groups: string[]) => string
  >;
}

const RUNTIME_TEXT_PATTERNS: readonly RuntimeTextPattern[] = [
  pattern(
    /^야생 (.+)[이가] 나타났다!$/,
    (_, name) => `A wild ${name} appeared!`,
    (_, name) => `野生の${name}が現れた！`,
  ),
  pattern(
    /^가랏! (.+)!$/,
    (_, name) => `Go! ${name}!`,
    (_, name) => `行け！ ${name}！`,
  ),
  pattern(
    /^(.+)의 공격은 빗나갔다!$/,
    (_, name) => `${name}'s attack missed!`,
    (_, name) => `${name}の攻撃は外れた！`,
  ),
  pattern(
    /^(.+)[은는] 몸이 저려서 움직일 수 없다!$/,
    (_, name) => `${name} is paralyzed and can't move!`,
    (_, name) => `${name}は体がしびれて動けない！`,
  ),
  pattern(
    /^(.+)[은는] 반동 데미지를 입었다!$/,
    (_, name) => `${name} was hurt by recoil!`,
    (_, name) => `${name}は反動でダメージを受けた！`,
  ),
  pattern(
    /^(.+)[은는] 이미 독에 걸려 있다!$/,
    (_, name) => `${name} is already poisoned!`,
    (_, name) => `${name}はすでにどく状態だ！`,
  ),
  pattern(
    /^(.+)[은는] 이미 상태 이상이다!$/,
    (_, name) => `${name} already has a status condition!`,
    (_, name) => `${name}はすでに状態異常だ！`,
  ),
  pattern(
    /^(.+)[은는] 독에 걸렸다!$/,
    (_, name) => `${name} was poisoned!`,
    (_, name) => `${name}はどく状態になった！`,
  ),
  pattern(
    /^(.+)[은는] 화상을 입었다!$/,
    (_, name) => `${name} was burned!`,
    (_, name) => `${name}はやけどを負った！`,
  ),
  pattern(
    /^(.+)[은는] 마비되어 기술이 나오기 어려워졌다!$/,
    (_, name) => `${name} was paralyzed! It may be unable to move!`,
    (_, name) => `${name}はまひして、わざが出にくくなった！`,
  ),
  pattern(
    /^(.+)[은는] 독 데미지를 입었다!$/,
    (_, name) => `${name} was hurt by poison!`,
    (_, name) => `${name}はどくのダメージを受けた！`,
  ),
  pattern(
    /^(.+)[은는] 화상 데미지를 입었다!$/,
    (_, name) => `${name} was hurt by its burn!`,
    (_, name) => `${name}はやけどのダメージを受けた！`,
  ),
  pattern(
    /^(.+)[은는] 쓰러졌다!$/,
    (_, name) => `${name} fainted!`,
    (_, name) => `${name}は倒れた！`,
  ),
  pattern(
    /^(.+), 부탁해!$/,
    (_, name) => `Go, ${name}!`,
    (_, name) => `${name}、頼んだ！`,
  ),
  pattern(
    /^(.+)[을를] 던졌다!$/,
    (_, item) => `Threw a ${item}!`,
    (_, item) => `${item}を投げた！`,
  ),
  pattern(
    /^(.+)[을를] 잡았다!$/,
    (_, name) => `Caught ${name}!`,
    (_, name) => `${name}を捕まえた！`,
  ),
  pattern(
    /^(.+)[이가] 볼에서 나왔다!$/,
    (_, name) => `${name} broke free!`,
    (_, name) => `${name}がボールから出てしまった！`,
  ),
  pattern(
    /^(.+)[이가] 없다!$/,
    (_, name) => `You don't have any ${name}!`,
    (_, name) => `${name}を持っていない！`,
  ),
  pattern(
    /^(.+) 경험치를 (\d+) 얻었다!$/,
    (_, name, amount) => `${name} gained ${amount} Exp. Points!`,
    (_, name, amount) => `${name}は経験値を${amount}もらった！`,
  ),
  pattern(
    /^(.+) (\d+) 경험치를 얻었다!$/,
    (_, name, amount) => `${name} gained ${amount} Exp. Points!`,
    (_, name, amount) => `${name}は経験値を${amount}もらった！`,
  ),
  pattern(
    /^(.+) 경험치 (\d+)과 (.+)[을를] 얻었다!$/,
    (_, name, amount, money) => `${name} gained ${amount} Exp. Points and ${money}!`,
    (_, name, amount, money) => `${name}は経験値${amount}と${money}をもらった！`,
  ),
  pattern(
    /^(₽ .+)[을를] 얻었다!$/,
    (_, money) => `Received ${money}!`,
    (_, money) => `${money}を手に入れた！`,
  ),
  pattern(
    /^(.+)[은는] Lv\.(\d+)[이가] 되었다!$/,
    (_, name, level) => `${name} grew to Lv.${level}!`,
    (_, name, level) => `${name}はLv.${level}になった！`,
  ),
  pattern(
    /^(.+)가 (.+)[을를] 내보냈다!$/,
    (_, trainer, name) => `${trainer} sent out ${name}!`,
    (_, trainer, name) => `${trainer}は${name}を繰り出した！`,
  ),
  pattern(
    /^(.+)의 (공격|방어|스피드|명중률)[은는이가] 더 이상 (오르지|떨어지지) 않는다!$/,
    (_, name, stat, direction) =>
      `${name}'s ${translateStat(stat, "en-US")} won't go ${direction === "오르지" ? "any higher" : "any lower"}!`,
    (_, name, stat, direction) =>
      `${name}の${translateStat(stat, "ja-JP")}はこれ以上${direction === "오르지" ? "上がらない" : "下がらない"}！`,
  ),
  pattern(
    /^(.+)의 (공격|방어|스피드|명중률)[이가] 올랐다!$/,
    (_, name, stat) => `${name}'s ${translateStat(stat, "en-US")} rose!`,
    (_, name, stat) => `${name}の${translateStat(stat, "ja-JP")}が上がった！`,
  ),
  pattern(
    /^(.+)의 (공격|방어|스피드|명중률)[이가] (크게 )?떨어졌다!$/,
    (_, name, stat, sharply) =>
      `${name}'s ${translateStat(stat, "en-US")} ${sharply ? "harshly " : ""}fell!`,
    (_, name, stat, sharply) =>
      `${name}の${translateStat(stat, "ja-JP")}が${sharply ? "がくっと" : ""}下がった！`,
  ),
  pattern(
    /^(.+)[은는] (.+)[을를] 잊고 (.+)[을를] 배웠다!$/,
    (_, name, oldMove, newMove) => `${name} forgot ${oldMove} and learned ${newMove}!`,
    (_, name, oldMove, newMove) => `${name}は${oldMove}を忘れて${newMove}を覚えた！`,
  ),
  pattern(
    /^(.+)[은는] (.+)[을를] 배웠다!$/,
    (_, name, move) => `${name} learned ${move}!`,
    (_, name, move) => `${name}は${move}を覚えた！`,
  ),
  pattern(
    /^(.+)[은는] (.+)[을를] 배우지 않았다!$/,
    (_, name, move) => `${name} did not learn ${move}.`,
    (_, name, move) => `${name}は${move}を覚えなかった。`,
  ),
  pattern(
    /^(.+)에게 (.+)[을를] 사용했다!$/,
    (_, name, item) => `Used ${item} on ${name}!`,
    (_, name, item) => `${name}に${item}を使った！`,
  ),
  pattern(
    /^(.+)의 HP가 회복됐다!$/,
    (_, name) => `${name}'s HP was restored!`,
    (_, name) => `${name}のHPが回復した！`,
  ),
  pattern(
    /^(.+)[은는] 다시 일어났다!$/,
    (_, name) => `${name} recovered from fainting!`,
    (_, name) => `${name}は元気を取り戻した！`,
  ),
  pattern(
    /^(.+)의 레벨이 올랐다!$/,
    (_, name) => `${name} gained a level!`,
    (_, name) => `${name}のレベルが上がった！`,
  ),
  pattern(
    /^(.+)의 독이 사라졌다!$/,
    (_, name) => `${name} was cured of poison!`,
    (_, name) => `${name}のどくが治った！`,
  ),
  pattern(
    /^(.+)의 (.+)!$/,
    (match, name, move) => (catalog.moves[move] ? `${name} used ${move}!` : match),
    (match, name, move) => (catalog.moves[move] ? `${name}の${move}！` : match),
  ),
  pattern(
    /^(.+)[을를] 구매했다\.$/,
    (_, item) => `Bought ${item}.`,
    (_, item) => `${item}を購入しました。`,
  ),
  pattern(
    /^(.+)[을를] 사용할 대상을 선택해라\.$/,
    (_, item) => `Choose a Pokémon to use ${item} on.`,
    (_, item) => `${item}を使うポケモンを選んでください。`,
  ),
  pattern(
    /^기술이 (.+)에서 (.+)로 바뀌었다!$/,
    (_, oldMove, newMove) => `${oldMove} was replaced by ${newMove}!`,
    (_, oldMove, newMove) => `${oldMove}を忘れて${newMove}を覚えた！`,
  ),
  pattern(
    /^(.+) 습득을 취소했다\.$/,
    (_, move) => `Stopped learning ${move}.`,
    (_, move) => `${move}を覚えるのをやめました。`,
  ),
  pattern(
    /^(.+)[을를] PC 박스에 보관했다\.$/,
    (_, name) => `Stored ${name} in the PC Box.`,
    (_, name) => `${name}をPCボックスに預けました。`,
  ),
  pattern(
    /^(.+)[을를] 파티로 데려왔다\.$/,
    (_, name) => `Added ${name} to your party.`,
    (_, name) => `${name}を手持ちに加えました。`,
  ),
  pattern(
    /^(.+)와 파티 포켓몬을 교체했다\.$/,
    (_, name) => `Swapped a party Pokémon with ${name}.`,
    (_, name) => `手持ちのポケモンと${name}を入れ替えました。`,
  ),
  pattern(
    /^(\d+)[이가] 나왔다\. 예측 성공! (.+)[을를] 받았다\.$/,
    (_, roll, reward) => `Rolled ${roll}. Correct! You received ${reward}.`,
    (_, roll, reward) => `${roll}が出ました。予想成功！ ${reward}を受け取りました。`,
  ),
  pattern(
    /^(\d+)[이가] 나왔다\. 예측 실패\. (.+)[을를] 잃었다\.$/,
    (_, roll, stake) => `Rolled ${roll}. Wrong prediction. You lost ${stake}.`,
    (_, roll, stake) => `${roll}が出ました。予想失敗。${stake}を失いました。`,
  ),
  pattern(
    /^포획한 (.+), 파티가 가득 차 PC 박스로 전송했습니다\.$/,
    (_, name) => `Your party was full, so the caught ${name} was sent to the PC Box.`,
    (_, name) => `捕まえた${name}は手持ちがいっぱいのためPCボックスへ送られました。`,
  ),
  pattern(
    /^\.\.\.오잉!\?$/,
    () => `...What!?`,
    () => `……おや！？`,
  ),
  pattern(
    /^(.+)의 모습이\.\.\.!$/,
    (_, name) => `${name} is evolving...!`,
    (_, name) => `${name}の様子が……！`,
  ),
  pattern(
    /^축하합니다! (.+)$/,
    (_, name) => `Congratulations! ${name}`,
    (_, name) => `おめでとう！ ${name}`,
  ),
  pattern(
    /^(.+)로 진화했습니다!$/,
    (_, name) => `Evolved into ${name}!`,
    (_, name) => `${name}に進化した！`,
  ),
  pattern(
    /^(.+) · (기본 상점|희귀 상점|PC 박스|파티 회복|솔로 챌린지|주사위 겜블)$/,
    (_, key, action) => `${key} · ${localizeRuntimeText(action, "en-US")}`,
    (_, key, action) => `${key} · ${localizeRuntimeText(action, "ja-JP")}`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+) 대진 안내$/,
    (_, round, total) => `Round ${round}/${total} matchups`,
    (_, round, total) => `ラウンド ${round}/${total} 組み合わせ`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+) 시작까지$/,
    (_, round, total) => `Round ${round}/${total} starts in`,
    (_, round, total) => `ラウンド ${round}/${total} 開始まで`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+)$/,
    (_, round, total) => `Round ${round}/${total}`,
    (_, round, total) => `ラウンド ${round}/${total}`,
  ),
  pattern(
    /^랭크 (.+) · 점수 (.+)$/,
    (_, rank, score) => `Rank ${rank} · Score ${score}`,
    (_, rank, score) => `ランク ${rank} · スコア ${score}`,
  ),
  pattern(
    /^(.+) 후 전투 시작$/,
    (_, time) => `Battle starts in ${time}`,
    (_, time) => `${time}後にバトル開始`,
  ),
  pattern(
    /^참가 (\d+)\/8 · 준비 (\d+)\/(\d+) · 접속 (\d+)\/(\d+) · 관전 (\d+)$/,
    (_, participants, ready, readyTotal, connected, total, spectators) =>
      `Players ${participants}/8 · Ready ${ready}/${readyTotal} · Connected ${connected}/${total} · Spectators ${spectators}`,
    (_, participants, ready, readyTotal, connected, total, spectators) =>
      `参加 ${participants}/8 · 準備 ${ready}/${readyTotal} · 接続 ${connected}/${total} · 観戦 ${spectators}`,
  ),
  pattern(
    /^현재 경기 · (.+)$/,
    (_, match) => `Current match · ${match}`,
    (_, match) => `現在の試合 · ${match}`,
  ),
  pattern(
    /^(8강|4강|결승) · (.+)$/,
    (_, stage, matches) => `${translateTournamentStatus(stage, "en-US")} · ${matches}`,
    (_, stage, matches) => `${translateTournamentStatus(stage, "ja-JP")} · ${matches}`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+) · 다른 플레이어를 기다리는 중\.\.\.$/,
    (_, round, total) => `Round ${round}/${total} · Waiting for other players...`,
    (_, round, total) => `ラウンド ${round}/${total} · ほかのプレイヤーを待っています...`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+) 준비 중 · (.+)$/,
    (_, round, total, time) => `Round ${round}/${total} preparation · ${time}`,
    (_, round, total, time) => `ラウンド ${round}/${total} 準備中 · ${time}`,
  ),
  pattern(
    /^토너먼트 진행 · 대진 (\d+)$/,
    (_, match) => `Tournament in progress · Match ${match}`,
    (_, match) => `トーナメント進行中 · 第${match}試合`,
  ),
  pattern(
    /^내 누적 순위 · (\d+)위 · (.+)점$/,
    (_, rank, score) => `Overall rank · ${rank} · ${score} points`,
    (_, rank, score) => `累計順位 · ${rank}位 · ${score}点`,
  ),
  pattern(
    /^내 상태 · (.+)$/,
    (_, status) => `My status · ${translateTournamentStatus(status, "en-US")}`,
    (_, status) => `自分の状態 · ${translateTournamentStatus(status, "ja-JP")}`,
  ),
  pattern(
    /^내 위치 · (.+)$/,
    (_, position) => `My position · ${translateTournamentStatus(position, "en-US")}`,
    (_, position) => `自分の位置 · ${translateTournamentStatus(position, "ja-JP")}`,
  ),
  pattern(
    /^부전승 · (.+)$/,
    (_, names) => `Byes · ${names}`,
    (_, names) => `不戦勝 · ${names}`,
  ),
  pattern(
    /^이후 · (.+)$/,
    (_, rounds) => `Next · ${translateTournamentStatus(rounds, "en-US")}`,
    (_, rounds) => `次 · ${translateTournamentStatus(rounds, "ja-JP")}`,
  ),
  pattern(
    /^라운드 (\d+)\/(\d+) 결과$/,
    (_, round, total) => `Round ${round}/${total} result`,
    (_, round, total) => `ラウンド ${round}/${total} 結果`,
  ),
  pattern(
    /^(우승 · )?(공동 )?(\d+)위 (.+) · 이번 \+(.+) · 방 점수 (.+)$/,
    (_, champion, tie, rank, name, roundScore, roomScore) =>
      `${champion ? "Champion · " : ""}${tie ? "Tied " : ""}#${rank} ${name} · This round +${roundScore} · Room score ${roomScore}`,
    (_, champion, tie, rank, name, roundScore, roomScore) =>
      `${champion ? "優勝 · " : ""}${tie ? "同率 " : ""}${rank}位 ${name} · 今回 +${roundScore} · ルームスコア ${roomScore}`,
  ),
  pattern(
    /^(\d+)위$/,
    (_, rank) => `#${rank}`,
    (_, rank) => `${rank}位`,
  ),
  pattern(
    /^이번 \+(.+)$/,
    (_, score) => `This round +${score}`,
    (_, score) => `今回 +${score}`,
  ),
  pattern(
    /^방 점수 (.+)$/,
    (_, score) => `Room score ${score}`,
    (_, score) => `ルームスコア ${score}`,
  ),
  pattern(
    /^서버 방을 만들지 못했습니다(.*)\. 연결을 확인한 뒤 다시 시도해 주세요\.$/,
    (_, status) =>
      `Could not create the server room${status}. Check your connection and try again.`,
    (_, status) =>
      `サーバールームを作成できませんでした${status}。接続を確認してもう一度お試しください。`,
  ),
  pattern(
    /^서버 방에 참가하지 못했습니다(.*)\. 방 코드와 연결을 확인해 주세요\.$/,
    (_, status) => `Could not join the server room${status}. Check the room code and connection.`,
    (_, status) =>
      `サーバールームに参加できませんでした${status}。ルームコードと接続を確認してください。`,
  ),
  pattern(
    /^서버 경기 참가 정보를 확인하지 못했습니다(.*)\. 다시 시도해 주세요\.$/,
    (_, status) => `Could not verify server match participation${status}. Try again.`,
    (_, status) =>
      `サーバー試合の参加情報を確認できませんでした${status}。もう一度お試しください。`,
  ),
  pattern(
    /^파티 정보를 서버와 동기화하지 못했습니다(.*)\. 다시 시도해 주세요\.$/,
    (_, status) => `Could not sync party data with the server${status}. Try again.`,
    (_, status) => `手持ち情報をサーバーと同期できませんでした${status}。もう一度お試しください。`,
  ),
  pattern(
    /^서버 방 연결을 복구하지 못했습니다(.*)\. 다시 시도해 주세요\.$/,
    (_, status) => `Could not restore the server room connection${status}. Try again.`,
    (_, status) =>
      `サーバールームへの接続を復旧できませんでした${status}。もう一度お試しください。`,
  ),
];

export function localizePokemonName(name: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  if (resolvedLocale === "ko-KR") return name;
  if (name.startsWith("야생 ")) {
    return resolvedLocale === "en-US"
      ? `Wild ${translateTerm(catalog.pokemon, name.slice(3), resolvedLocale)}`
      : `野生の${translateTerm(catalog.pokemon, name.slice(3), resolvedLocale)}`;
  }
  return translateTerm(catalog.pokemon, name, resolvedLocale);
}

export function localizeTrainerName(name: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  return resolvedLocale === "ko-KR" ? name : translateTerm(AI_TRAINER_NAMES, name, resolvedLocale);
}

export function localizeMoveName(name: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  return resolvedLocale === "ko-KR" ? name : translateTerm(catalog.moves, name, resolvedLocale);
}

export function localizeTypeName(name: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  if (resolvedLocale === "ko-KR") return name;
  if (name === "없음") return resolvedLocale === "en-US" ? "None" : "なし";
  const direct = translateTerm(catalog.types, name, resolvedLocale);
  if (direct !== name) return direct;
  const sourceName = Object.keys(catalog.types).find(function findItem(candidate) {
    return catalog.types[candidate]?.["en-US"].toLowerCase() === name.toLowerCase();
  });
  return sourceName ? translateTerm(catalog.types, sourceName, resolvedLocale) : name;
}

export function localizeItemName(name: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  return resolvedLocale === "ko-KR" ? name : (catalog.items[name]?.[resolvedLocale].name ?? name);
}

export function localizeItemDescription(
  description: string,
  canonicalName: string,
  locale?: string | null,
): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  return resolvedLocale === "ko-KR"
    ? description
    : (catalog.items[canonicalName]?.[resolvedLocale].description ?? description);
}

export function localizeRuntimeText(text: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  if (resolvedLocale === "ko-KR" || !text) return text;
  return text
    .split("\n")
    .map(function mapLine(line) {
      const exact = EXACT_RUNTIME_TEXT[line]?.[resolvedLocale];
      const translated =
        exact ??
        RUNTIME_TEXT_PATTERNS.reduce(function reduceLine(current, entry) {
          return current === line && entry.pattern.test(line)
            ? line.replace(entry.pattern, entry.replace[resolvedLocale])
            : current;
        }, line);
      return localizeKnownTerms(translated, resolvedLocale);
    })
    .join("\n");
}

export function localizeMobileBattleUiState(
  state: MobileBattleUiState,
  locale?: string | null,
): MobileBattleUiState {
  return {
    ...state,
    message: state.message ? localizeRuntimeText(state.message, locale) : null,
    moves: state.moves.map(move => ({
      ...move,
      name: localizeMoveName(move.name, locale),
      type: localizeTypeName(move.type, locale),
      effectNotice: move.effectNotice ? localizeRuntimeText(move.effectNotice, locale) : null,
    })),
    party: state.party.map(pokemon => ({
      ...pokemon,
      name: localizePokemonName(pokemon.name, locale),
      status: pokemon.status ? localizePokemonStatus(pokemon.status, locale) : null,
    })),
    items: state.items.map(item => ({ ...item, name: localizeItemName(item.name, locale) })),
    moveReplacement: state.moveReplacement
      ? {
          ...state.moveReplacement,
          pokemonName: localizePokemonName(state.moveReplacement.pokemonName, locale),
          newMoveName: localizeMoveName(state.moveReplacement.newMoveName, locale),
          newMoveType: localizeTypeName(state.moveReplacement.newMoveType, locale),
        }
      : null,
  };
}

export function localizeBattlePresentationState(
  state: BattlePresentationState,
  locale?: string | null,
): BattlePresentationState {
  return {
    ...state,
    message: state.message ? localizeRuntimeText(state.message, locale) : null,
    player: { ...state.player, name: localizePokemonName(state.player.name, locale) },
    opponent: { ...state.opponent, name: localizePokemonName(state.opponent.name, locale) },
  };
}

export function localizeMobileWorldUiState(
  state: MobileWorldUiState,
  locale?: string | null,
): MobileWorldUiState {
  return {
    ...state,
    title: localizeRuntimeText(state.title, locale),
    message: localizeRuntimeText(state.message, locale),
    selectedItemName: localizeItemName(state.selectedItemName, locale),
    selectedItemDescription: localizeItemDescription(
      state.selectedItemDescription,
      state.selectedItemName,
      locale,
    ),
    items: state.items.map(item => ({
      ...item,
      description: localizeItemDescription(item.description, item.name, locale),
      name: localizeItemName(item.name, locale),
    })),
    party: state.party.map(pokemon => ({
      ...pokemon,
      name: localizePokemonName(pokemon.name, locale),
      status: pokemon.status ? localizePokemonStatus(pokemon.status, locale) : null,
    })),
    box: state.box.map(pokemon => ({
      ...pokemon,
      name: localizePokemonName(pokemon.name, locale),
      status: pokemon.status ? localizePokemonStatus(pokemon.status, locale) : null,
    })),
    moveReplacement: state.moveReplacement
      ? {
          ...state.moveReplacement,
          pokemonName: localizePokemonName(state.moveReplacement.pokemonName, locale),
          newMoveName: localizeMoveName(state.moveReplacement.newMoveName, locale),
          moves: state.moveReplacement.moves.map(move => ({
            ...move,
            name: localizeMoveName(move.name, locale),
          })),
        }
      : null,
    dice: state.dice
      ? {
          ...state.dice,
          options: state.dice.options.map(option => ({
            ...option,
            label: localizeRuntimeText(option.label, locale),
          })),
        }
      : null,
  };
}

export function localizePokemonStatus(status: string, locale?: string | null): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);
  const labels: Record<PokeLoungeLocale, Record<string, string>> = {
    "ko-KR": {
      normal: "정상",
      poisoned: "독",
      burned: "화상",
      paralyzed: "마비",
      fainted: "전투불능",
    },
    "en-US": {
      normal: "Normal",
      poisoned: "Poisoned",
      burned: "Burned",
      paralyzed: "Paralyzed",
      fainted: "Fainted",
    },
    "ja-JP": {
      normal: "正常",
      poisoned: "どく",
      burned: "やけど",
      paralyzed: "まひ",
      fainted: "ひんし",
    },
  };
  return labels[resolvedLocale][status] ?? status;
}

function pattern(
  patternValue: RegExp,
  english: (match: string, ...groups: string[]) => string,
  japanese: (match: string, ...groups: string[]) => string,
): RuntimeTextPattern {
  return { pattern: patternValue, replace: { "en-US": english, "ja-JP": japanese } };
}

function translateTerm(
  terms: Record<string, LocalizedTerm>,
  value: string,
  locale: RuntimeTranslationLocale,
): string {
  return terms[value]?.[locale] ?? value;
}

function localizeKnownTerms(text: string, locale: RuntimeTranslationLocale): string {
  return termReplacements.reduce(function replaceTerm(current, term) {
    return current.includes(term.source) ? current.replaceAll(term.source, term[locale]) : current;
  }, text);
}

const termReplacements = [
  ...Object.entries(AI_TRAINER_NAMES).map(([source, value]) => ({ source, ...value })),
  ...Object.entries(catalog.pokemon).map(([source, value]) => ({ source, ...value })),
  ...Object.entries(catalog.moves).map(([source, value]) => ({ source, ...value })),
  ...Object.entries(catalog.items).map(([source, value]) => ({
    source,
    "en-US": value["en-US"].name,
    "ja-JP": value["ja-JP"].name,
  })),
  { source: "아이템", "en-US": "item", "ja-JP": "どうぐ" },
  { source: "포켓몬", "en-US": "Pokémon", "ja-JP": "ポケモン" },
].sort(function compareItems(left, right) {
  return right.source.length - left.source.length;
});

function translateStat(stat: string, locale: RuntimeTranslationLocale): string {
  const stats: Record<RuntimeTranslationLocale, Record<string, string>> = {
    "en-US": { 공격: "Attack", 방어: "Defense", 스피드: "Speed", 명중률: "accuracy" },
    "ja-JP": { 공격: "攻撃", 방어: "防御", 스피드: "素早さ", 명중률: "命中率" },
  };
  return stats[locale][stat] ?? stat;
}

function translateTournamentStatus(value: string, locale: RuntimeTranslationLocale): string {
  const phrases: Record<RuntimeTranslationLocale, Record<string, string>> = {
    "en-US": {
      관전: "Spectating",
      참가: "Playing",
      접속: "Connected",
      "연결 끊김": "Disconnected",
      준비: "Ready",
      "준비 전": "Not ready",
      우승: "Champion",
      탈락: "Eliminated",
      진출: "Advanced",
      상대: "Opponent",
      "다음 상대": "Next opponent",
      "다음 대진 대기": "Waiting for the next match",
      "최종 순위 확정 대기": "Waiting for final standings",
      "부전승 진출": "Advanced with a bye",
      부전승: "Bye",
      결승: "Final",
      "4강": "Semifinal",
      "8강": "Quarterfinal",
      경기: "match",
    },
    "ja-JP": {
      관전: "観戦",
      참가: "参加",
      접속: "接続",
      "연결 끊김": "切断",
      준비: "準備完了",
      "준비 전": "準備前",
      우승: "優勝",
      탈락: "敗退",
      진출: "進出",
      상대: "相手",
      "다음 상대": "次の相手",
      "다음 대진 대기": "次の対戦待ち",
      "최종 순위 확정 대기": "最終順位の確定待ち",
      "부전승 진출": "不戦勝で進出",
      부전승: "不戦勝",
      결승: "決勝",
      "4강": "準決勝",
      "8강": "準々決勝",
      경기: "試合",
    },
  };
  const matchCountLocalized = value.replace(/(\d+)경기/g, function replaceMatchCount(_, count) {
    return locale === "en-US" ? `${count} matches` : `${count}試合`;
  });
  return Object.entries(phrases[locale])
    .sort(function compareItems(left, right) {
      return right[0].length - left[0].length;
    })
    .reduce(function replacePhrase(current, [source, replacement]) {
      return current.replaceAll(source, replacement);
    }, matchCountLocalized);
}

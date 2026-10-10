import { resolvePokeLoungeLocale } from "../../../poke-lounge-copy";

const COPY = {
  "ko-KR": {
    title: "화면으로 배우는 게임 안내",
    description: "밝게 표시된 곳을 눌러 다음 안내로 이동하세요.",
    preview: "실제 플레이 화면 미리보기",
    previous: "이전",
    next: "다음",
    done: "안내 마치기",
    close: "안내 닫기",
    controls: "터치 · 키보드 조작법",
    replay: "처음부터 다시 보기",
    steps: [
      {
        title: "준비가 되면 함께 출발!",
        body: "대기실에서 준비를 누르세요. 모두 준비되면 방장이 게임을 시작합니다. 빈자리는 AI가 채워요.",
        target: "준비와 게임 시작 버튼",
      },
      {
        title: "첫 파트너를 골라요",
        body: "함께할 포켓몬을 고른 뒤 ‘이 포켓몬으로 시작’을 누르세요. 포켓몬 선택은 게임 시작 후 진행됩니다.",
        target: "첫 파트너 선택 영역",
      },
      {
        title: "필드를 자유롭게 탐험해요",
        body: "조이스틱을 드래그해 이동하세요. 풀숲에서는 야생 포켓몬을 만날 수 있어요.",
        target: "필드 이동 조이스틱",
      },
      {
        title: "대화하고 파티를 살펴봐요",
        body: "대화 버튼으로 주변 대상과 이야기하세요. 포켓몬 버튼을 누르면 내 파티를 확인할 수 있어요.",
        target: "대화와 포켓몬 버튼",
      },
      {
        title: "싸운다 → 기술 선택",
        body: "‘싸운다’를 누르고 사용할 기술을 선택하세요. 기술마다 PP가 있고, 화면의 HP로 전투 상황을 확인할 수 있어요.",
        target: "싸운다 버튼",
      },
      {
        title: "상황에 맞게 행동해요",
        body: "야생전에서는 몬스터볼로 포획하거나 도망갈 수 있어요. 포켓몬 버튼에서는 출전 포켓몬을 교체합니다. 대회에서는 포획과 도망을 사용할 수 없어요.",
        target: "포획, 도망, 포켓몬 교체 버튼",
      },
    ],
  },
  "en-US": {
    title: "A visual guide to playing",
    description: "Select the highlighted area to continue the guide.",
    preview: "Actual gameplay preview",
    previous: "Previous",
    next: "Next",
    done: "Finish guide",
    close: "Close guide",
    controls: "Touch · keyboard controls",
    replay: "Start again",
    steps: [
      {
        title: "Get ready together",
        body: "Press Ready in the lounge. The host can start when everyone is ready. AI fills the remaining spots.",
        target: "Ready and Start game buttons",
      },
      {
        title: "Choose your first partner",
        body: "Select a Pokémon, then confirm your choice. Partner selection takes place after the host starts the game.",
        target: "Partner selection area",
      },
      {
        title: "Explore the field",
        body: "Drag the joystick to move. Wild Pokémon can appear in tall grass.",
        target: "Movement joystick",
      },
      {
        title: "Talk and check your party",
        body: "Tap Talk to interact with nearby characters. Tap Pokémon to view your party.",
        target: "Talk and Pokémon buttons",
      },
      {
        title: "Fight, then choose a move",
        body: "Select Fight, then the move you want to use. Moves have limited PP. Watch HP to follow the battle.",
        target: "Fight button",
      },
      {
        title: "Choose your next action",
        body: "In wild battles, use a Poké Ball to catch or Run to escape. Open Pokémon to switch your active partner. Catching and running are unavailable in tournament battles.",
        target: "Catch, Run and Pokémon buttons",
      },
    ],
  },
  "ja-JP": {
    title: "画面でわかるゲーム案内",
    description: "明るく表示された場所を押すと、次の案内に進みます。",
    preview: "実際のプレイ画面のプレビュー",
    previous: "前へ",
    next: "次へ",
    done: "案内を終える",
    close: "案内を閉じる",
    controls: "タッチ・キーボード操作",
    replay: "最初から見る",
    steps: [
      {
        title: "準備ができたら出発！",
        body: "待機室で準備を押しましょう。全員の準備ができたらホストが開始します。空き枠にはAIが参加します。",
        target: "準備とゲーム開始ボタン",
      },
      {
        title: "最初のパートナーを選ぼう",
        body: "ポケモンを選び、開始ボタンで確定しましょう。パートナーはゲーム開始後に選びます。",
        target: "パートナー選択エリア",
      },
      {
        title: "フィールドを探索しよう",
        body: "ジョイスティックをドラッグして移動します。草むらで野生のポケモンに出会えます。",
        target: "移動ジョイスティック",
      },
      {
        title: "会話とパーティの確認",
        body: "会話ボタンで近くの相手と話しましょう。ポケモンボタンでパーティを確認できます。",
        target: "会話とポケモンボタン",
      },
      {
        title: "たたかう → 技を選ぶ",
        body: "たたかうを押して使う技を選びます。技にはPPがあります。HPでバトルの状況を確認しましょう。",
        target: "たたかうボタン",
      },
      {
        title: "状況に合わせて行動",
        body: "野生戦ではモンスターボールで捕獲したり、逃げたりできます。ポケモンボタンで交代できます。大会では捕獲と逃走はできません。",
        target: "捕獲・逃走・交代ボタン",
      },
    ],
  },
};

export function getRoomGameGuideCopy(locale: string) {
  return COPY[resolvePokeLoungeLocale(locale)];
}

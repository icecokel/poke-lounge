export type PokeLoungeLocale = "ko-KR" | "en-US" | "ja-JP";

type PokeLoungeRandomNameWords = readonly [string, string, string, string, string];

export interface PokeLoungeCopy {
  locale: PokeLoungeLocale;
  unknownTrainer: string;
  volumeMuted: string;
  volumeLabel(percent: number): string;
  volumeAriaLabel(percent: number): string;
  uiLarge: string;
  uiNormal: string;
  connectionConnected: string;
  connectionConnecting: string;
  connectionDisconnected: string;
  autosaveLocal: string;
  autosaveLocalFallback: string;
  autosaveSaving: string;
  autosaveError: string;
  autosavePending: string;
  autosaveSaved: string;
  autosaveReady: string;
  gameRegionLabel: string;
  settingsOpenLabel: string;
  fullscreenOn: string;
  fullscreenOff: string;
  statusRailLabel: string;
  hydrationLoading: string;
  hydrationLocalFallback: string;
  hydrationRetry: string;
  hydrationRetrying: string;
  hydrationRetryAfterRoom: string;
  hydrationConflictTitle: string;
  hydrationConflictDescription: string;
  hydrationUseServer: string;
  hydrationUseLocal: string;
  hydrationDecideLater: string;
  hydrationIdentityError: string;
  noticeConfirm: string;
  settingsTitle: string;
  settingsDescription: string;
  settingsFullscreen: string;
  settingsUiSizeAria: string;
  settingsShare: string;
  settingsLocalShare: string;
  settingsShareCopied: string;
  settingsShareFailed: string;
  settingsSolo: string;
  settingsRankingTitle: string;
  settingsRankingCaption: string;
  settingsRankingLoading: string;
  settingsRankingError: string;
  settingsRankingRetry: string;
  settingsRankingEmpty: string;
  settingsClose: string;
  settingsExit: string;
  exitTitle: string;
  exitDescription: string;
  exitContinue: string;
  exitConfirm: string;
  partySlotsTitle: string;
  partySlotLabel(slot: number): string;
  partySlotEmpty: string;
  partySlotLead: string;
  leaveTitle: string;
  leaveDescription: string;
  leaveContinue: string;
  leaveConfirm: string;
  resultEyebrow: string;
  resultPlayTime(seconds: number): string;
  resultUnranked: string;
  resultStarPrompt: string;
  resultStar: string;
  resultRetry: string;
  resultRoomEntry: string;
  resultLobby: string;
  accessibleHelp: string;
  mobile: {
    exploreDeckLabel: string;
    exploreHint: string;
    battleDeckLabel: string;
    moveUp: string;
    moveLeft: string;
    moveRight: string;
    moveDown: string;
    interact: string;
    bag: string;
    menu: string;
    next: string;
    back: string;
    fight: string;
    party: string;
    run: string;
    chooseMove: string;
    chooseParty: string;
    chooseItem: string;
    replaceMove: string;
    moveReplacementPrompt(pokemonName: string, newMoveName: string): string;
    forgetMove: string;
    doNotLearnMove: string;
    confirmMoveReplacement: string;
    help: string;
    battleHelpChoose: string;
    battleHelpAdvance: string;
    battleHelpBack: string;
    use: string;
    buy: string;
    deposit: string;
    withdraw: string;
    setLead: string;
    roll: string;
    pcParty: string;
    pcBox: string;
    wallet: string;
    waiting: string;
    roundWaiting: string;
    spectating: string;
    spectatingCompleted: string;
    preparing: string;
    actionSending: string;
    connectionRecovering: string;
  };
  startup: {
    title: string;
    description: string;
    retry: string;
    retrying: string;
    lobby: string;
  };
  lobby: {
    title: string;
    participantCount(count: number): string;
    participantListLabel: string;
    hostBadge: string;
    ready: string;
    notReady: string;
    connected: string;
    disconnected: string;
    partyReady: string;
    partyMissing: string;
    readyAction: string;
    cancelReadyAction: string;
    startAction: string;
    hostReady: string;
    guestWaiting: string;
    ownPartyMissingReason: string;
    mutationFailed: string;
    startDisabledReason: Record<"players" | "connection" | "party" | "ready" | "mutation", string>;
  };
  roomEntry: {
    title: string;
    fanNotice: string;
    soloTitle: string;
    soloDescription: string;
    continue: string;
    newGame: string;
    localTestTitle: string;
    localTestDescription: string;
    localTestStart: string;
    localTestContinue: string;
    localTestExit: string;
    localTestRequestFailed: string;
    multiplayerNameLabel: string;
    multiplayerNameDescription: string;
    multiplayerNamePlaceholder: string;
    multiplayerNameRequired: string;
    multiplayerNameModifiers: PokeLoungeRandomNameWords;
    multiplayerNameNouns: PokeLoungeRandomNameWords;
    multiplayerEntryTitle: string;
    multiplayerEntrySubmit: string;
    localDescription: string;
    multiplayerTitle: string;
    multiplayerDescription: string;
    temporaryPasswordLabel: string;
    temporaryPasswordDescription: string;
    temporaryPasswordPlaceholder: string;
    temporaryPasswordRequired: string;
    multiplayerConnect: string;
    multiplayerConnectFailed: string;
    preparing: string;
    newGameTitle: string;
    newGameDescription: string;
    cancel: string;
    resetAndStart: string;
    freshSession: string;
    leaveTournamentTitle: string;
    leaveTournamentDescription: string;
    leaveRoomTitle: string;
    leaveRoomDescription: string;
    leaveRoom: string;
  };
}

const KOREAN_COPY: PokeLoungeCopy = {
  locale: "ko-KR",
  unknownTrainer: "이름 없는 트레이너",
  volumeMuted: "소리 꺼짐",
  volumeLabel: percent => `소리 ${percent}%`,
  volumeAriaLabel: percent => (percent === 0 ? "소리 음소거" : `소리 볼륨 ${percent}퍼센트`),
  uiLarge: "UI 크게",
  uiNormal: "UI 보통",
  connectionConnected: "방 연결됨",
  connectionConnecting: "방 연결 중",
  connectionDisconnected: "방 연결 끊김",
  autosaveLocal: "현재 탭에 자동 저장",
  autosaveLocalFallback: "계정 저장 중지 · 현재 탭에 저장",
  autosaveSaving: "계정에 저장 중",
  autosaveError: "저장 실패 · 재시도 대기",
  autosavePending: "변경사항 저장 대기",
  autosaveSaved: "계정에 저장됨",
  autosaveReady: "계정 저장 준비됨",
  gameRegionLabel: "Poke Lounge 게임 화면",
  settingsOpenLabel: "Poke Lounge 설정 열기",
  fullscreenOn: "전체화면 켜기",
  fullscreenOff: "전체화면 끄기",
  statusRailLabel: "게임 저장과 연결 상태",
  hydrationLoading: "저장된 모험을 불러오는 중입니다.",
  hydrationLocalFallback:
    "계정 저장을 불러오지 못해 현재 탭의 로컬 상태로 시작했습니다. 다시 연결하면 현재 탭의 진행을 유지한 채 계정 저장을 재개합니다.",
  hydrationRetry: "계정 저장 다시 연결",
  hydrationRetrying: "계정 저장 연결 중",
  hydrationRetryAfterRoom: "방을 나간 뒤 다시 연결",
  hydrationConflictTitle: "저장 진행을 선택해 주세요",
  hydrationConflictDescription:
    "계정과 현재 탭에 서로 다른 진행이 있습니다. 계정 저장을 사용하면 현재 탭 진행이 바뀌고, 현재 탭 진행을 저장하면 계정 저장을 덮어씁니다.",
  hydrationUseServer: "계정 저장 사용",
  hydrationUseLocal: "현재 탭 진행 저장",
  hydrationDecideLater: "나중에 결정",
  hydrationIdentityError: "계정 저장 식별 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
  noticeConfirm: "확인",
  settingsTitle: "설정과 검증 랭킹",
  settingsDescription: "화면과 소리를 조절하고 현재 방·저장 상태를 확인합니다.",
  settingsFullscreen: "전체화면",
  settingsUiSizeAria: "UI 사이즈 2단계",
  settingsShare: "링크 공유",
  settingsLocalShare: "같은 기기 다른 탭용 링크 복사",
  settingsShareCopied: "링크 복사됨",
  settingsShareFailed: "복사 실패",
  settingsSolo: "솔로 플레이",
  settingsRankingTitle: "검증된 1:1 랭킹",
  settingsRankingCaption: "서버 검증 결과만 반영",
  settingsRankingLoading: "랭킹을 불러오는 중입니다.",
  settingsRankingError: "랭킹을 불러오지 못했습니다.",
  settingsRankingRetry: "다시 시도",
  settingsRankingEmpty: "아직 검증된 기록이 없습니다.",
  settingsClose: "닫기",
  settingsExit: "게임 종료",
  exitTitle: "게임을 종료할까요?",
  exitDescription: "현재 진행은 저장되며 게임 센터로 이동합니다.",
  exitContinue: "계속 플레이",
  exitConfirm: "게임 종료",
  partySlotsTitle: "파티 슬롯",
  partySlotLabel: slot => `슬롯 ${slot}`,
  partySlotEmpty: "비어 있음",
  partySlotLead: "선두",
  leaveTitle: "방에서 나갈까요?",
  leaveDescription: "현재 방 연결이 해제됩니다.",
  leaveContinue: "계속 플레이",
  leaveConfirm: "방 나가기",
  resultEyebrow: "플레이 결과",
  resultPlayTime: seconds => `플레이 시간 ${seconds}초`,
  resultUnranked: "일반 플레이 결과 · 공개 검증 랭킹 미반영",
  resultStarPrompt: "친구와 즐거웠다면 GitHub Star로 Poke Lounge를 응원해 주세요.",
  resultStar: "GitHub에서 Star",
  resultRetry: "다시 플레이",
  resultRoomEntry: "새 방 선택",
  resultLobby: "게임 로비로",
  accessibleHelp: "게임 조작 도움말은 H 키 또는 물음표 버튼으로 열 수 있습니다.",
  mobile: {
    exploreDeckLabel: "필드 조작",
    exploreHint: "방향 이동 · A 상호작용",
    battleDeckLabel: "전투 조작",
    moveUp: "위로 이동",
    moveLeft: "왼쪽으로 이동",
    moveRight: "오른쪽으로 이동",
    moveDown: "아래로 이동",
    interact: "대화",
    bag: "가방",
    menu: "메뉴",
    next: "다음",
    back: "뒤로",
    fight: "싸운다",
    party: "포켓몬",
    run: "도망",
    chooseMove: "기술 선택",
    chooseParty: "포켓몬 교체",
    chooseItem: "아이템 선택",
    replaceMove: "잊을 기술 선택",
    moveReplacementPrompt: (pokemonName, newMoveName) =>
      `${pokemonName}의 새 기술 ${newMoveName}. 잊을 기술을 선택하세요.`,
    forgetMove: "이 기술을 잊기",
    doNotLearnMove: "배우지 않기",
    confirmMoveReplacement: "선택한 기술 잊기",
    help: "조작 안내",
    battleHelpChoose: "화면의 싸운다·가방·포켓몬·도망 버튼으로 행동을 선택합니다.",
    battleHelpAdvance: "전투 문구를 확인한 뒤 다음 버튼을 누릅니다.",
    battleHelpBack: "기술·가방·포켓몬 선택에서 이전 화면으로 돌아갑니다.",
    use: "사용",
    buy: "구매",
    deposit: "보관",
    withdraw: "데려오기",
    setLead: "선두로 지정",
    roll: "굴리기",
    pcParty: "파티",
    pcBox: "박스",
    wallet: "보유",
    waiting: "상대의 선택을 기다리는 중...",
    roundWaiting: "다른 플레이어를 기다리는 중...",
    spectating: "다른 플레이어의 경기 관전 중...",
    spectatingCompleted: "관전 중인 경기가 종료되었습니다.",
    preparing: "전투를 준비하는 중...",
    actionSending: "행동을 서버에 전송하는 중...",
    connectionRecovering: "연결을 복구하는 중...",
  },
  startup: {
    title: "게임을 시작하지 못했습니다",
    description:
      "필요한 게임 데이터나 화면 코드를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
    retry: "다시 시도",
    retrying: "다시 불러오는 중...",
    lobby: "입장 화면으로 돌아가기",
  },
  lobby: {
    title: "챔피언십 대기실",
    participantCount: count => `참가자 ${count}/6`,
    participantListLabel: "챔피언십 참가자",
    hostBadge: "방장",
    ready: "준비 완료",
    notReady: "준비 전",
    connected: "접속 중",
    disconnected: "연결 끊김",
    partyReady: "파티 완료",
    partyMissing: "파티 확인 필요",
    readyAction: "준비",
    cancelReadyAction: "준비 취소",
    startAction: "챔피언십 시작",
    hostReady: "모든 조건이 갖춰졌습니다.",
    guestWaiting: "방장이 챔피언십을 시작할 때까지 기다려 주세요.",
    ownPartyMissingReason: "파티가 서버에 반영되면 준비할 수 있습니다.",
    mutationFailed: "요청을 반영하지 못했습니다. 최신 대기실 상태를 확인해 주세요.",
    startDisabledReason: {
      players: "참가자가 2명 이상 필요합니다.",
      connection: "연결이 끊긴 참가자가 있습니다.",
      party: "파티 준비가 끝나지 않은 참가자가 있습니다.",
      ready: "아직 준비하지 않은 참가자가 있습니다.",
      mutation: "대기실 상태를 반영하는 중입니다.",
    },
  },
  roomEntry: {
    title: "플레이 방식 선택",
    fanNotice:
      "Poke Lounge는 친구들과 함께 즐기기 위해 만든 비공식 팬 게임입니다. Pokémon 관련 권리는 각 권리자에게 있습니다.",
    soloTitle: "혼자 플레이",
    soloDescription: "저장된 모험이 있으면 이어서 하고, 없으면 새 모험을 시작합니다.",
    continue: "이어하기",
    newGame: "새 게임",
    localTestTitle: "로컬 싱글 테스트",
    localTestDescription:
      "고정 테스트 계정에 진행도를 저장하며 전투, 상호작용, 이어하기 완성도를 반복 확인합니다. 멀티플레이 테스트에는 사용하지 않습니다.",
    localTestStart: "테스트 모드로 시작",
    localTestContinue: "테스트 모드 계속",
    localTestExit: "테스트 모드 종료",
    localTestRequestFailed:
      "로컬 싱글 테스트 모드를 전환하지 못했습니다. 로컬 환경 설정을 확인한 뒤 다시 시도해 주세요.",
    multiplayerNameLabel: "트레이너 닉네임",
    multiplayerNameDescription: "같은 월드의 친구에게 표시됩니다. 최대 12자",
    multiplayerNamePlaceholder: "닉네임 입력",
    multiplayerNameRequired: "멀티플레이에 사용할 닉네임을 입력해 주세요.",
    multiplayerNameModifiers: ["용감한", "재빠른", "명랑한", "신비한", "빛나는"],
    multiplayerNameNouns: ["트레이너", "탐험가", "모험가", "승부사", "수집가"],
    multiplayerEntryTitle: "멀티플레이 입장",
    multiplayerEntrySubmit: "입장하기",
    localDescription:
      "같은 기기의 같은 브라우저 프로필에서 연 다른 탭끼리만 연결됩니다. 다른 기기나 브라우저 프로필에서는 참가할 수 없습니다.",
    multiplayerTitle: "멀티플레이",
    multiplayerDescription:
      "친구와 같은 임시 비밀번호를 입력하면 같은 월드에서 서로의 움직임을 볼 수 있습니다.",
    temporaryPasswordLabel: "임시 비밀번호",
    temporaryPasswordDescription:
      "함께 플레이할 친구끼리 같은 값을 입력하세요. 비밀번호 원문은 저장하거나 전송하지 않습니다.",
    temporaryPasswordPlaceholder: "임시 비밀번호 입력",
    temporaryPasswordRequired: "멀티플레이에 사용할 임시 비밀번호를 입력해 주세요.",
    multiplayerConnect: "접속하고 즐기기",
    multiplayerConnectFailed: "멀티플레이 접속 정보를 만들지 못했습니다. 다시 시도해 주세요.",
    preparing: "준비 중...",
    newGameTitle: "새 게임을 시작할까요?",
    newGameDescription:
      "현재 브라우저에 저장된 모험과 세션 진행 상황이 초기화됩니다. 이 작업은 되돌릴 수 없습니다.",
    cancel: "취소",
    resetAndStart: "초기화 후 시작",
    freshSession: "멀티플레이 연결 정보가 만료되어 입장 화면으로 돌아왔습니다. 다시 접속해 주세요.",
    leaveTournamentTitle: "경기에서 나갈까요?",
    leaveTournamentDescription: "지금 나가면 진행 중인 경기가 기권 처리될 수 있습니다.",
    leaveRoomTitle: "방에서 나갈까요?",
    leaveRoomDescription: "현재 준비 상태와 방 연결이 해제됩니다.",
    leaveRoom: "방 나가기",
  },
};

const ENGLISH_COPY: PokeLoungeCopy = {
  ...KOREAN_COPY,
  locale: "en-US",
  unknownTrainer: "Unnamed Trainer",
  volumeMuted: "Muted",
  volumeLabel: percent => `Volume ${percent}%`,
  volumeAriaLabel: percent => (percent === 0 ? "Mute sound" : `Sound volume ${percent} percent`),
  uiLarge: "Large UI",
  uiNormal: "Normal UI",
  connectionConnected: "Room connected",
  connectionConnecting: "Connecting to room",
  connectionDisconnected: "Room disconnected",
  autosaveLocal: "Autosaved in this tab",
  autosaveLocalFallback: "Account save paused · saved in this tab",
  autosaveSaving: "Saving to account",
  autosaveError: "Save failed · waiting to retry",
  autosavePending: "Changes waiting to save",
  autosaveSaved: "Saved to account",
  autosaveReady: "Account save ready",
  gameRegionLabel: "Poke Lounge game screen",
  settingsOpenLabel: "Open Poke Lounge settings",
  fullscreenOn: "Enter fullscreen",
  fullscreenOff: "Exit fullscreen",
  statusRailLabel: "Game save and connection status",
  hydrationLoading: "Loading your saved adventure.",
  hydrationLocalFallback:
    "We couldn't load your account save, so the game started with local data in this tab. Reconnecting resumes account saves while keeping this tab's progress.",
  hydrationRetry: "Reconnect account save",
  hydrationRetrying: "Reconnecting account save",
  hydrationRetryAfterRoom: "Reconnect after leaving the room",
  hydrationConflictTitle: "Choose which progress to keep",
  hydrationConflictDescription:
    "Your account and this tab contain different progress. Using the account save changes this tab; saving this tab overwrites the account save.",
  hydrationUseServer: "Use account save",
  hydrationUseLocal: "Save this tab's progress",
  hydrationDecideLater: "Decide later",
  hydrationIdentityError: "We could not verify the account save identity. Sign in again.",
  noticeConfirm: "OK",
  settingsTitle: "Settings and verified ranking",
  settingsDescription: "Adjust the display and sound, and check the current room and save status.",
  settingsFullscreen: "Fullscreen",
  settingsUiSizeAria: "Two-step UI size",
  settingsShare: "Copy invite link",
  settingsLocalShare: "Copy link for another tab on this device",
  settingsShareCopied: "Link copied",
  settingsShareFailed: "Copy failed",
  settingsSolo: "Solo play",
  settingsRankingTitle: "Verified 1v1 ranking",
  settingsRankingCaption: "Verified server results only",
  settingsRankingLoading: "Loading ranking.",
  settingsRankingError: "Could not load the ranking.",
  settingsRankingRetry: "Try again",
  settingsRankingEmpty: "No verified records yet.",
  settingsClose: "Close",
  settingsExit: "Exit game",
  exitTitle: "Exit the game?",
  exitDescription: "Your current progress will be saved before returning to the game center.",
  exitContinue: "Keep playing",
  exitConfirm: "Exit game",
  partySlotsTitle: "Party slots",
  partySlotLabel: slot => `Slot ${slot}`,
  partySlotEmpty: "Empty",
  partySlotLead: "Lead",
  leaveTitle: "Leave the room?",
  leaveDescription: "Your current room connection will end.",
  leaveContinue: "Keep playing",
  leaveConfirm: "Leave room",
  resultEyebrow: "Play result",
  resultPlayTime: seconds => `Play time ${seconds}s`,
  resultUnranked: "Standard play result · not included in the public verified ranking",
  resultStarPrompt: "Had fun with friends? Support Poke Lounge with a GitHub Star.",
  resultStar: "Star on GitHub",
  resultRetry: "Play again",
  resultRoomEntry: "Choose another room",
  resultLobby: "Game lobby",
  accessibleHelp: "Open the controls guide with H or the question-mark button.",
  mobile: {
    exploreDeckLabel: "Field controls",
    exploreHint: "Move · A to interact",
    battleDeckLabel: "Battle controls",
    moveUp: "Move up",
    moveLeft: "Move left",
    moveRight: "Move right",
    moveDown: "Move down",
    interact: "Talk",
    bag: "Bag",
    menu: "Menu",
    next: "Next",
    back: "Back",
    fight: "Fight",
    party: "Pokémon",
    run: "Run",
    chooseMove: "Choose a move",
    chooseParty: "Choose Pokémon",
    chooseItem: "Choose an item",
    replaceMove: "Choose a move to forget",
    moveReplacementPrompt: (pokemonName, newMoveName) =>
      `${pokemonName} can learn ${newMoveName}. Choose a move to forget.`,
    forgetMove: "Forget this move",
    doNotLearnMove: "Do not learn",
    confirmMoveReplacement: "Forget selected move",
    help: "Controls",
    battleHelpChoose: "Choose an action with the Fight, Bag, Pokémon, or Run buttons.",
    battleHelpAdvance: "Read the battle message, then press Next.",
    battleHelpBack: "Return from move, Bag, or Pokémon selection with Back.",
    use: "Use",
    buy: "Buy",
    deposit: "Store",
    withdraw: "Take out",
    setLead: "Set lead",
    roll: "Roll",
    pcParty: "Party",
    pcBox: "Box",
    wallet: "Wallet",
    waiting: "Waiting for the other trainer...",
    roundWaiting: "Waiting for the other players...",
    spectating: "Watching another player's match...",
    spectatingCompleted: "The match you were watching has ended.",
    preparing: "Preparing the battle...",
    actionSending: "Sending your action to the server...",
    connectionRecovering: "Restoring the connection...",
  },
  startup: {
    title: "Could not start the game",
    description:
      "Required game data or screen code could not be loaded. Check your connection and try again.",
    retry: "Try again",
    retrying: "Loading again...",
    lobby: "Back to play selection",
  },
  lobby: {
    title: "Championship Lobby",
    participantCount: count => `Players ${count}/6`,
    participantListLabel: "Championship players",
    hostBadge: "Host",
    ready: "Ready",
    notReady: "Not ready",
    connected: "Connected",
    disconnected: "Disconnected",
    partyReady: "Party ready",
    partyMissing: "Party needed",
    readyAction: "Ready",
    cancelReadyAction: "Cancel ready",
    startAction: "Start championship",
    hostReady: "Everyone is ready to start.",
    guestWaiting: "Wait for the host to start the championship.",
    ownPartyMissingReason: "You can ready up after your party reaches the server.",
    mutationFailed: "The request failed. Check the latest lobby state and try again.",
    startDisabledReason: {
      players: "At least two players are required.",
      connection: "A player is disconnected.",
      party: "A player's party is not ready.",
      ready: "A player is not ready yet.",
      mutation: "Updating the lobby.",
    },
  },
  roomEntry: {
    title: "Choose how to play",
    fanNotice:
      "Poke Lounge is an unofficial fan game made for playing with friends. Pokémon rights belong to their respective owners.",
    soloTitle: "Solo play",
    soloDescription: "Continue a saved adventure, or start a new one if no save exists.",
    continue: "Continue",
    newGame: "New game",
    localTestTitle: "Local solo test",
    localTestDescription:
      "Save progress to a fixed test account while repeatedly checking battles, interactions, and continue behavior. This mode is not for multiplayer testing.",
    localTestStart: "Start test mode",
    localTestContinue: "Continue test mode",
    localTestExit: "Exit test mode",
    localTestRequestFailed:
      "Could not switch local solo test mode. Check the local environment setup and try again.",
    multiplayerNameLabel: "Trainer nickname",
    multiplayerNameDescription: "Shown to friends in the same world. Up to 12 characters.",
    multiplayerNamePlaceholder: "Enter a nickname",
    multiplayerNameRequired: "Enter a nickname for multiplayer.",
    multiplayerNameModifiers: ["Brave", "Swift", "Merry", "Mystic", "Shiny"],
    multiplayerNameNouns: ["Ace", "Scout", "Hero", "Tamer", "Champ"],
    multiplayerEntryTitle: "Join multiplayer",
    multiplayerEntrySubmit: "Join",
    localDescription:
      "Only tabs opened in the same browser profile on this device can connect. Other devices and browser profiles cannot join.",
    multiplayerTitle: "Multiplayer",
    multiplayerDescription:
      "Enter the same temporary password as a friend to see each other move in the same world.",
    temporaryPasswordLabel: "Temporary password",
    temporaryPasswordDescription:
      "Use the same value as the friends you want to play with. The original password is never stored or sent.",
    temporaryPasswordPlaceholder: "Enter a temporary password",
    temporaryPasswordRequired: "Enter a temporary password for multiplayer.",
    multiplayerConnect: "Connect and play",
    multiplayerConnectFailed: "Could not prepare multiplayer access. Try again.",
    preparing: "Preparing...",
    newGameTitle: "Start a new game?",
    newGameDescription:
      "This clears the adventure and session progress stored in this browser. This cannot be undone.",
    cancel: "Cancel",
    resetAndStart: "Reset and start",
    freshSession:
      "The multiplayer session expired, so you were returned to play selection. Connect again.",
    leaveTournamentTitle: "Leave the match?",
    leaveTournamentDescription: "Leaving now may count as forfeiting the active match.",
    leaveRoomTitle: "Leave the room?",
    leaveRoomDescription: "Your ready state and room connection will be cleared.",
    leaveRoom: "Leave room",
  },
};

const JAPANESE_COPY: PokeLoungeCopy = {
  ...KOREAN_COPY,
  locale: "ja-JP",
  unknownTrainer: "名前のないトレーナー",
  volumeMuted: "ミュート",
  volumeLabel: percent => `音量 ${percent}%`,
  volumeAriaLabel: percent => (percent === 0 ? "音をミュート" : `音量 ${percent}パーセント`),
  uiLarge: "UIを大きく",
  uiNormal: "UIを標準に",
  connectionConnected: "ルーム接続済み",
  connectionConnecting: "ルーム接続中",
  connectionDisconnected: "ルーム切断",
  autosaveLocal: "このタブに自動保存",
  autosaveLocalFallback: "アカウント保存を停止中・このタブに保存",
  autosaveSaving: "アカウントに保存中",
  autosaveError: "保存失敗・再試行待ち",
  autosavePending: "変更の保存待ち",
  autosaveSaved: "アカウントに保存済み",
  autosaveReady: "アカウント保存の準備完了",
  gameRegionLabel: "ポケラウンジのゲーム画面",
  settingsOpenLabel: "ポケラウンジの設定を開く",
  fullscreenOn: "全画面表示にする",
  fullscreenOff: "全画面表示を終了",
  statusRailLabel: "ゲームの保存と接続状況",
  hydrationLoading: "保存された冒険を読み込んでいます。",
  hydrationLocalFallback:
    "アカウントのセーブデータを読み込めなかったため、このタブのローカルデータで開始しました。再接続すると、このタブの進行を維持したままアカウント保存を再開します。",
  hydrationRetry: "アカウント保存を再接続",
  hydrationRetrying: "アカウント保存に再接続中",
  hydrationRetryAfterRoom: "ルーム退出後に再接続",
  hydrationConflictTitle: "残す進行を選んでください",
  hydrationConflictDescription:
    "アカウントとこのタブに異なる進行があります。アカウント保存を使うとこのタブが変わり、このタブの進行を保存するとアカウント保存を上書きします。",
  hydrationUseServer: "アカウント保存を使用",
  hydrationUseLocal: "このタブの進行を保存",
  hydrationDecideLater: "あとで決める",
  hydrationIdentityError:
    "アカウント保存の識別情報を確認できません。もう一度ログインしてください。",
  noticeConfirm: "確認",
  settingsTitle: "設定と検証済みランキング",
  settingsDescription: "画面と音を調整し、現在のルームと保存状況を確認します。",
  settingsFullscreen: "全画面表示",
  settingsUiSizeAria: "2段階のUIサイズ",
  settingsShare: "招待リンクをコピー",
  settingsLocalShare: "この端末の別タブ用リンクをコピー",
  settingsShareCopied: "リンクをコピーしました",
  settingsShareFailed: "コピーに失敗しました",
  settingsSolo: "ソロプレイ",
  settingsRankingTitle: "検証済み1対1ランキング",
  settingsRankingCaption: "サーバー検証済み結果のみ",
  settingsRankingLoading: "ランキングを読み込んでいます。",
  settingsRankingError: "ランキングを読み込めませんでした。",
  settingsRankingRetry: "再試行",
  settingsRankingEmpty: "検証済み記録はまだありません。",
  settingsClose: "閉じる",
  settingsExit: "ゲームを終了",
  exitTitle: "ゲームを終了しますか？",
  exitDescription: "現在の進行状況を保存してゲームセンターに戻ります。",
  exitContinue: "プレイを続ける",
  exitConfirm: "ゲームを終了",
  partySlotsTitle: "手持ちスロット",
  partySlotLabel: slot => `スロット ${slot}`,
  partySlotEmpty: "空き",
  partySlotLead: "先頭",
  leaveTitle: "ルームから退出しますか？",
  leaveDescription: "現在のルーム接続が終了します。",
  leaveContinue: "プレイを続ける",
  leaveConfirm: "ルームを退出",
  resultEyebrow: "プレイ結果",
  resultPlayTime: seconds => `プレイ時間 ${seconds}秒`,
  resultUnranked: "通常プレイ結果・公開検証ランキング対象外",
  resultStarPrompt: "友達と楽しめたら、GitHub StarでPoke Loungeを応援してください。",
  resultStar: "GitHubでStar",
  resultRetry: "もう一度プレイ",
  resultRoomEntry: "別のルームを選ぶ",
  resultLobby: "ゲームロビーへ",
  accessibleHelp: "Hキーまたは「？」ボタンで操作ガイドを開けます。",
  mobile: {
    exploreDeckLabel: "フィールド操作",
    exploreHint: "方向で移動 · Aで話す",
    battleDeckLabel: "バトル操作",
    moveUp: "上へ移動",
    moveLeft: "左へ移動",
    moveRight: "右へ移動",
    moveDown: "下へ移動",
    interact: "話す",
    bag: "バッグ",
    menu: "メニュー",
    next: "次へ",
    back: "戻る",
    fight: "たたかう",
    party: "ポケモン",
    run: "にげる",
    chooseMove: "わざを選ぶ",
    chooseParty: "ポケモンを交代",
    chooseItem: "どうぐを選ぶ",
    replaceMove: "忘れるわざを選ぶ",
    moveReplacementPrompt: (pokemonName, newMoveName) =>
      `${pokemonName}は${newMoveName}を覚えられます。忘れるわざを選んでください。`,
    forgetMove: "このわざを忘れる",
    doNotLearnMove: "覚えない",
    confirmMoveReplacement: "選んだわざを忘れる",
    help: "操作ガイド",
    battleHelpChoose: "「たたかう」「バッグ」「ポケモン」「にげる」のボタンで行動を選びます。",
    battleHelpAdvance: "バトルメッセージを確認して「次へ」を押します。",
    battleHelpBack: "わざ・バッグ・ポケモン選択から「戻る」で前の画面に戻ります。",
    use: "使う",
    buy: "購入",
    deposit: "預ける",
    withdraw: "連れ出す",
    setLead: "先頭にする",
    roll: "振る",
    pcParty: "手持ち",
    pcBox: "ボックス",
    wallet: "所持金",
    waiting: "相手の選択を待っています...",
    roundWaiting: "ほかのプレイヤーを待っています...",
    spectating: "ほかのプレイヤーの試合を観戦しています...",
    spectatingCompleted: "観戦中の試合が終了しました。",
    preparing: "バトルを準備しています...",
    actionSending: "行動をサーバーに送信しています...",
    connectionRecovering: "接続を復旧しています...",
  },
  startup: {
    title: "ゲームを開始できませんでした",
    description:
      "必要なゲームデータまたは画面コードを読み込めませんでした。接続を確認して再試行してください。",
    retry: "再試行",
    retrying: "再読み込み中...",
    lobby: "プレイ選択に戻る",
  },
  lobby: {
    title: "チャンピオンシップロビー",
    participantCount: count => `参加者 ${count}/6`,
    participantListLabel: "チャンピオンシップ参加者",
    hostBadge: "ホスト",
    ready: "準備完了",
    notReady: "準備前",
    connected: "接続中",
    disconnected: "切断",
    partyReady: "パーティ準備完了",
    partyMissing: "パーティ確認待ち",
    readyAction: "準備完了",
    cancelReadyAction: "準備を取り消す",
    startAction: "チャンピオンシップ開始",
    hostReady: "開始条件がそろいました。",
    guestWaiting: "ホストが開始するまでお待ちください。",
    ownPartyMissingReason: "パーティがサーバーに反映されると準備できます。",
    mutationFailed: "リクエストに失敗しました。最新のロビー状態を確認してください。",
    startDisabledReason: {
      players: "参加者が2人以上必要です。",
      connection: "切断中の参加者がいます。",
      party: "パーティ準備が完了していない参加者がいます。",
      ready: "まだ準備していない参加者がいます。",
      mutation: "ロビー状態を更新しています。",
    },
  },
  roomEntry: {
    title: "プレイ方法を選択",
    fanNotice:
      "ポケラウンジは友達と楽しむための非公式ファンゲームです。Pokémonに関する権利は各権利者に帰属します。",
    soloTitle: "ソロプレイ",
    soloDescription: "保存された冒険があれば続きから、なければ新しい冒険を始めます。",
    continue: "続きから",
    newGame: "ニューゲーム",
    localTestTitle: "ローカルソロテスト",
    localTestDescription:
      "固定テストアカウントに進行を保存しながら、バトル、操作、続きからの完成度を繰り返し確認します。マルチプレイテストには使用しません。",
    localTestStart: "テストモードで開始",
    localTestContinue: "テストモードを続ける",
    localTestExit: "テストモードを終了",
    localTestRequestFailed:
      "ローカルソロテストモードを切り替えられませんでした。ローカル環境の設定を確認して、もう一度お試しください。",
    multiplayerNameLabel: "トレーナーニックネーム",
    multiplayerNameDescription: "同じワールドの友達に表示されます。最大12文字です。",
    multiplayerNamePlaceholder: "ニックネームを入力",
    multiplayerNameRequired: "マルチプレイ用のニックネームを入力してください。",
    multiplayerNameModifiers: ["勇敢な", "素早い", "陽気な", "不思議な", "輝く"],
    multiplayerNameNouns: ["トレーナー", "探検家", "冒険者", "勝負師", "コレクター"],
    multiplayerEntryTitle: "マルチプレイに参加",
    multiplayerEntrySubmit: "参加する",
    localDescription:
      "この端末の同じブラウザプロファイルで開いた別タブ同士だけが接続できます。他の端末やプロファイルからは参加できません。",
    multiplayerTitle: "マルチプレイ",
    multiplayerDescription:
      "友達と同じ一時パスワードを入力すると、同じワールドでお互いの動きを確認できます。",
    temporaryPasswordLabel: "一時パスワード",
    temporaryPasswordDescription:
      "一緒に遊ぶ友達同士で同じ値を入力してください。パスワードの原文は保存も送信もしません。",
    temporaryPasswordPlaceholder: "一時パスワードを入力",
    temporaryPasswordRequired: "マルチプレイ用の一時パスワードを入力してください。",
    multiplayerConnect: "接続して遊ぶ",
    multiplayerConnectFailed: "マルチプレイ接続を準備できませんでした。もう一度お試しください。",
    preparing: "準備中...",
    newGameTitle: "ニューゲームを始めますか？",
    newGameDescription:
      "このブラウザに保存された冒険とセッション進行状況が初期化されます。この操作は元に戻せません。",
    cancel: "キャンセル",
    resetAndStart: "初期化して開始",
    freshSession:
      "マルチプレイ接続情報の期限が切れたため、プレイ選択に戻りました。もう一度接続してください。",
    leaveTournamentTitle: "試合から退出しますか？",
    leaveTournamentDescription: "今退出すると、進行中の試合が棄権扱いになる場合があります。",
    leaveRoomTitle: "ルームから退出しますか？",
    leaveRoomDescription: "準備状態とルーム接続が解除されます。",
    leaveRoom: "ルームを退出",
  },
};

const COPY_BY_LOCALE: Record<PokeLoungeLocale, PokeLoungeCopy> = {
  "ko-KR": KOREAN_COPY,
  "en-US": ENGLISH_COPY,
  "ja-JP": JAPANESE_COPY,
};

export function resolvePokeLoungeLocale(locale: string | null | undefined): PokeLoungeLocale {
  if (locale?.toLowerCase().startsWith("en")) {
    return "en-US";
  }

  if (locale?.toLowerCase().startsWith("ja")) {
    return "ja-JP";
  }

  return "ko-KR";
}

export function resolvePokeLoungeLocaleFromUrl(url: URL): PokeLoungeLocale {
  const routeLocale = url.pathname.split("/").filter(Boolean)[0];
  return resolvePokeLoungeLocale(routeLocale);
}

export function getPokeLoungeCopy(locale: string | null | undefined): PokeLoungeCopy {
  return COPY_BY_LOCALE[resolvePokeLoungeLocale(locale)];
}

export function getPokeLoungeCopyForUrl(url: URL): PokeLoungeCopy {
  return COPY_BY_LOCALE[resolvePokeLoungeLocaleFromUrl(url)];
}

export type PokeLoungeLocale = "ko-KR" | "en-US" | "ja-JP";

type PokeLoungeRandomNameWords = readonly [string, string, string, string, string];

export interface PokeLoungeCopy {
  locale: PokeLoungeLocale;
  unknownTrainer: string;
  aiActivity: Record<"idle" | "moving" | "hunting" | "recovering" | "tournament", string>;
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
  game: {
    starterTitle: string;
    starterOptionsLabel: string;
    starterPreviewLabel: string;
    starterUnavailable: string;
    starterConfirm: string;
    starterAssetMissing(path: string): string;
    resourcesPreparing: string;
    battleHelpLabel: string;
    battleTouchPrompt: string;
    battleEnded: string;
    moveLearnPrompt(moveName: string): string;
    moveReplacementTitle: string;
    chooseSwitchPokemon: string;
    forcedSwitch: string;
    backHint: string;
    emptySlot: string;
    battleProcessing: string;
    currentBattler: string;
    noUsableItems: string;
    moveReplacementUnavailable: string;
    empty: string;
    diceTargetAndBet(target: number, bet: string): string;
    pokemonDetails(name: string, level: number): string;
    emptyPartySlot(slot: number): string;
    experience: string;
    status: string;
    moves: string;
    currentLead: string;
    leadUnavailable: string;
    effectUnsupported: string;
    secondaryEffectUnsupported: string;
    tournamentBracket: string;
    startsAfter(time: string): string;
    battlePreparing: string;
    final: string;
    bye: string;
    statusLabel: Record<"normal" | "poisoned" | "burned" | "paralyzed" | "fainted", string>;
  };
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
    waitingForReplacement: string;
    roundWaiting: string;
    spectating: string;
    spectatingLabel: string;
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
    aiBadge: string;
    ready: string;
    notReady: string;
    connected: string;
    disconnected: string;
    partyReady: string;
    partyMissing: string;
    readyAction: string;
    cancelReadyAction: string;
    addAiAction: string;
    removeAiAction: string;
    startAction: string;
    autoFillNotice: string;
    hostReady: string;
    guestWaiting: string;
    starterSelectionHint: string;
    mutationFailed: string;
    startDisabledReason: Record<"connection" | "party" | "ready" | "mutation", string>;
  };
  roomEntry: {
    title: string;
    fanNotice: string;
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
    roomVisibilityLabel: string;
    roundDurationLabel: string;
    roundDurationOptions: [string, string, string];
    roundDurationDescription: string;
    publicGameTitle: string;
    publicGameDescription: string;
    privateGameTitle: string;
    temporaryPasswordLabel: string;
    temporaryPasswordDescription: string;
    temporaryPasswordPlaceholder: string;
    temporaryPasswordGenerate: string;
    temporaryPasswordRequired: string;
    multiplayerConnect: string;
    multiplayerConnectFailed: string;
    preparing: string;
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
  aiActivity: {
    idle: "대기 중",
    moving: "이동 중",
    hunting: "사냥 중",
    recovering: "회복 중",
    tournament: "대전 중",
  },
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
  settingsTitle: "설정",
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
  game: {
    starterTitle: "첫 파트너 선택",
    starterOptionsLabel: "스타터 포켓몬 선택지",
    starterPreviewLabel: "선택한 스타터 미리보기",
    starterUnavailable: "선택 가능한 스타터가 없습니다.",
    starterConfirm: "이 포켓몬으로 시작",
    starterAssetMissing: path => `ROM 이미지 없음: ${path}`,
    resourcesPreparing: "게임 리소스를 준비하는 중입니다.",
    battleHelpLabel: "전투 도움말",
    battleTouchPrompt: "아래 터치 화면에서 행동을 선택하세요.",
    battleEnded: "전투가 종료되었습니다.",
    moveLearnPrompt: moveName => `${moveName}을 배우려면 잊을 기술 선택`,
    moveReplacementTitle: "기술 교체",
    chooseSwitchPokemon: "교체할 포켓몬 선택",
    forcedSwitch: "필수 교체",
    backHint: "B 돌아가기",
    emptySlot: "빈 슬롯",
    battleProcessing: "전투 처리를 기다리는 중입니다.",
    currentBattler: "전투 중",
    noUsableItems: "사용할 아이템이 없습니다.",
    moveReplacementUnavailable: "기술 교체 정보를 불러올 수 없습니다.",
    empty: "비어 있음",
    diceTargetAndBet: (target, bet) => `기준 ${target} · 배팅 ${bet}`,
    pokemonDetails: (name, level) => `${name} Lv.${level} 상세`,
    emptyPartySlot: slot => `빈 파티 슬롯 ${slot}`,
    experience: "경험치",
    status: "상태",
    moves: "기술",
    currentLead: "현재 선두",
    leadUnavailable: "선두 지정 불가",
    effectUnsupported: "효과 미지원",
    secondaryEffectUnsupported: "부가 효과 미지원",
    tournamentBracket: "토너먼트 대진",
    startsAfter: time => `${time} 후 시작`,
    battlePreparing: "전투 준비 중",
    final: "결승",
    bye: "부전승",
    statusLabel: {
      normal: "정상",
      poisoned: "독",
      burned: "화상",
      paralyzed: "마비",
      fainted: "전투불능",
    },
  },
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
    battleHelpAdvance: "전투 문구는 자동으로 진행됩니다. 결과 화면에서만 확인을 누릅니다.",
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
    waitingForReplacement: "상대가 다음 포켓몬을 고르고 있습니다...",
    roundWaiting: "다른 플레이어를 기다리는 중...",
    spectating: "다른 플레이어의 경기 관전 중...",
    spectatingLabel: "관전 중",
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
    participantCount: count => `참가자 ${count}/8`,
    participantListLabel: "챔피언십 참가자",
    hostBadge: "방장",
    aiBadge: "AI",
    ready: "준비 완료",
    notReady: "준비 전",
    connected: "접속 중",
    disconnected: "연결 끊김",
    partyReady: "파티 완료",
    partyMissing: "파티 확인 필요",
    readyAction: "준비",
    cancelReadyAction: "준비 취소",
    addAiAction: "AI 추가",
    removeAiAction: "제거",
    startAction: "챔피언십 시작",
    autoFillNotice:
      "시작 시 1~3명은 4명까지, 4~7명은 8명까지 AI가 자동 참가하며 준비 단계부터 함께 플레이합니다.",
    hostReady: "모든 조건이 갖춰졌습니다.",
    guestWaiting: "방장이 챔피언십을 시작할 때까지 기다려 주세요.",
    starterSelectionHint: "포켓몬은 게임 시작 후 선택합니다.",
    mutationFailed: "요청을 반영하지 못했습니다. 최신 대기실 상태를 확인해 주세요.",
    startDisabledReason: {
      connection: "연결이 끊긴 참가자가 있습니다.",
      party: "파티 준비가 끝나지 않은 참가자가 있습니다.",
      ready: "아직 준비하지 않은 참가자가 있습니다.",
      mutation: "대기실 상태를 반영하는 중입니다.",
    },
  },
  roomEntry: {
    title: "방 만들기",
    fanNotice:
      "Poke Lounge는 친구들과 함께 즐기기 위해 만든 비공식 팬 게임입니다. Pokémon 관련 권리는 각 권리자에게 있습니다.",
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
    multiplayerTitle: "비공개 방 만들기",
    roundDurationLabel: "라운드 간 준비 시간",
    roundDurationOptions: ["90초", "3분", "5분"],
    roundDurationDescription: "90초 모드에서는 팀의 모든 포켓몬이 같은 양의 경험치를 받습니다.",
    multiplayerDescription: "현재는 비공개 방만 만들 수 있습니다.",
    roomVisibilityLabel: "공개 범위",
    publicGameTitle: "공개",
    publicGameDescription: "준비 중",
    privateGameTitle: "비공개",
    temporaryPasswordLabel: "임시 비밀번호",
    temporaryPasswordDescription:
      "함께 플레이할 친구끼리 같은 영문·숫자 6자리를 입력하세요. 원문은 저장하거나 전송하지 않습니다.",
    temporaryPasswordPlaceholder: "영문·숫자 6자리 입력",
    temporaryPasswordGenerate: "랜덤 생성",
    temporaryPasswordRequired: "영문·숫자 6자리 임시 비밀번호를 입력해 주세요.",
    multiplayerConnect: "비공개 방 만들기",
    multiplayerConnectFailed: "멀티플레이 접속 정보를 만들지 못했습니다. 다시 시도해 주세요.",
    preparing: "준비 중...",
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
  aiActivity: {
    idle: "Idle",
    moving: "Moving",
    hunting: "Hunting",
    recovering: "Recovering",
    tournament: "Battling",
  },
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
  settingsTitle: "Settings",
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
  game: {
    starterTitle: "Choose your first partner",
    starterOptionsLabel: "Starter Pokémon options",
    starterPreviewLabel: "Selected starter preview",
    starterUnavailable: "No starter Pokémon are available.",
    starterConfirm: "Start with this Pokémon",
    starterAssetMissing: path => `ROM image missing: ${path}`,
    resourcesPreparing: "Preparing game resources.",
    battleHelpLabel: "Battle help",
    battleTouchPrompt: "Choose an action on the touch controls below.",
    battleEnded: "The battle has ended.",
    moveLearnPrompt: moveName => `Choose a move to forget before learning ${moveName}`,
    moveReplacementTitle: "Replace a move",
    chooseSwitchPokemon: "Choose a Pokémon to switch in",
    forcedSwitch: "Switch required",
    backHint: "B Back",
    emptySlot: "Empty slot",
    battleProcessing: "Waiting for the battle to resolve.",
    currentBattler: "On field",
    noUsableItems: "There are no usable items.",
    moveReplacementUnavailable: "Move replacement details are unavailable.",
    empty: "Empty",
    diceTargetAndBet: (target, bet) => `Target ${target} · Bet ${bet}`,
    pokemonDetails: (name, level) => `${name} Lv.${level} details`,
    emptyPartySlot: slot => `Empty party slot ${slot}`,
    experience: "Experience",
    status: "Status",
    moves: "Moves",
    currentLead: "Current lead",
    leadUnavailable: "Cannot set as lead",
    effectUnsupported: "Effect unsupported",
    secondaryEffectUnsupported: "Secondary effect unsupported",
    tournamentBracket: "Tournament bracket",
    startsAfter: time => `Starts in ${time}`,
    battlePreparing: "Preparing battle",
    final: "Final",
    bye: "Bye",
    statusLabel: {
      normal: "Normal",
      poisoned: "Poisoned",
      burned: "Burned",
      paralyzed: "Paralyzed",
      fainted: "Fainted",
    },
  },
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
    battleHelpAdvance: "Battle messages advance automatically. Confirm only the final result.",
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
    waitingForReplacement: "The other trainer is choosing their next Pokémon...",
    roundWaiting: "Waiting for the other players...",
    spectating: "Watching another player's match...",
    spectatingLabel: "Spectating",
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
    participantCount: count => `Players ${count}/8`,
    participantListLabel: "Championship players",
    hostBadge: "Host",
    aiBadge: "AI",
    ready: "Ready",
    notReady: "Not ready",
    connected: "Connected",
    disconnected: "Disconnected",
    partyReady: "Party ready",
    partyMissing: "Party needed",
    readyAction: "Ready",
    cancelReadyAction: "Cancel ready",
    addAiAction: "Add AI",
    removeAiAction: "Remove",
    startAction: "Start championship",
    autoFillNotice:
      "When the room starts, AI fills 1–3 players to 4 and 4–7 players to 8, then joins from preparation onward.",
    hostReady: "Everyone is ready to start.",
    guestWaiting: "Wait for the host to start the championship.",
    starterSelectionHint: "Choose your Pokémon after the host starts the game.",
    mutationFailed: "The request failed. Check the latest lobby state and try again.",
    startDisabledReason: {
      connection: "A player is disconnected.",
      party: "A player's party is not ready.",
      ready: "A player is not ready yet.",
      mutation: "Updating the lobby.",
    },
  },
  roomEntry: {
    title: "Create a room",
    fanNotice:
      "Poke Lounge is an unofficial fan game made for playing with friends. Pokémon rights belong to their respective owners.",
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
    multiplayerTitle: "Create a private room",
    roundDurationLabel: "Preparation between rounds",
    roundDurationOptions: ["90 sec", "3 min", "5 min"],
    roundDurationDescription:
      "In 90-second mode, every party Pokémon receives the full amount of experience.",
    multiplayerDescription: "Only private rooms can be created right now.",
    roomVisibilityLabel: "Visibility",
    publicGameTitle: "Public",
    publicGameDescription: "Coming soon",
    privateGameTitle: "Private",
    temporaryPasswordLabel: "Temporary password",
    temporaryPasswordDescription:
      "Enter the same 6-character letter and number code as your friends. The original is never stored or sent.",
    temporaryPasswordPlaceholder: "Enter 6 letters or numbers",
    temporaryPasswordGenerate: "Generate",
    temporaryPasswordRequired: "Enter a 6-character letter and number code.",
    multiplayerConnect: "Create private room",
    multiplayerConnectFailed: "Could not prepare multiplayer access. Try again.",
    preparing: "Preparing...",
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
  aiActivity: {
    idle: "待機中",
    moving: "移動中",
    hunting: "探索中",
    recovering: "回復中",
    tournament: "対戦中",
  },
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
  settingsTitle: "設定",
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
  game: {
    starterTitle: "最初のパートナーを選ぶ",
    starterOptionsLabel: "最初のポケモン候補",
    starterPreviewLabel: "選んだポケモンのプレビュー",
    starterUnavailable: "選べるポケモンがいません。",
    starterConfirm: "このポケモンで始める",
    starterAssetMissing: path => `ROM画像がありません: ${path}`,
    resourcesPreparing: "ゲームリソースを準備しています。",
    battleHelpLabel: "バトル操作ガイド",
    battleTouchPrompt: "下のタッチ画面で行動を選んでください。",
    battleEnded: "バトルが終了しました。",
    moveLearnPrompt: moveName => `${moveName}を覚えるために忘れるわざを選ぶ`,
    moveReplacementTitle: "わざの入れ替え",
    chooseSwitchPokemon: "交代するポケモンを選ぶ",
    forcedSwitch: "交代必須",
    backHint: "B 戻る",
    emptySlot: "空きスロット",
    battleProcessing: "バトル処理を待っています。",
    currentBattler: "バトル中",
    noUsableItems: "使えるどうぐがありません。",
    moveReplacementUnavailable: "わざの入れ替え情報を読み込めません。",
    empty: "空き",
    diceTargetAndBet: (target, bet) => `基準 ${target} · ベット ${bet}`,
    pokemonDetails: (name, level) => `${name} Lv.${level} 詳細`,
    emptyPartySlot: slot => `空きパーティスロット ${slot}`,
    experience: "経験値",
    status: "状態",
    moves: "わざ",
    currentLead: "現在の先頭",
    leadUnavailable: "先頭にできません",
    effectUnsupported: "効果未対応",
    secondaryEffectUnsupported: "追加効果未対応",
    tournamentBracket: "トーナメント表",
    startsAfter: time => `${time}後に開始`,
    battlePreparing: "バトル準備中",
    final: "決勝",
    bye: "不戦勝",
    statusLabel: {
      normal: "正常",
      poisoned: "どく",
      burned: "やけど",
      paralyzed: "まひ",
      fainted: "ひんし",
    },
  },
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
    battleHelpAdvance: "バトルメッセージは自動で進みます。結果画面でのみ確認を押します。",
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
    waitingForReplacement: "相手が次のポケモンを選んでいます...",
    roundWaiting: "ほかのプレイヤーを待っています...",
    spectating: "ほかのプレイヤーの試合を観戦しています...",
    spectatingLabel: "観戦中",
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
    participantCount: count => `参加者 ${count}/8`,
    participantListLabel: "チャンピオンシップ参加者",
    hostBadge: "ホスト",
    aiBadge: "AI",
    ready: "準備完了",
    notReady: "準備前",
    connected: "接続中",
    disconnected: "切断",
    partyReady: "パーティ準備完了",
    partyMissing: "パーティ確認待ち",
    readyAction: "準備完了",
    cancelReadyAction: "準備を取り消す",
    addAiAction: "AIを追加",
    removeAiAction: "削除",
    startAction: "チャンピオンシップ開始",
    autoFillNotice:
      "開始時に1～3人なら4人、4～7人なら8人までAIが自動参加し、準備段階から一緒にプレイします。",
    hostReady: "開始条件がそろいました。",
    guestWaiting: "ホストが開始するまでお待ちください。",
    starterSelectionHint: "ポケモンはゲーム開始後に選びます。",
    mutationFailed: "リクエストに失敗しました。最新のロビー状態を確認してください。",
    startDisabledReason: {
      connection: "切断中の参加者がいます。",
      party: "パーティ準備が完了していない参加者がいます。",
      ready: "まだ準備していない参加者がいます。",
      mutation: "ロビー状態を更新しています。",
    },
  },
  roomEntry: {
    title: "ルームを作成",
    fanNotice:
      "ポケラウンジは友達と楽しむための非公式ファンゲームです。Pokémonに関する権利は各権利者に帰属します。",
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
    multiplayerTitle: "非公開ルームを作成",
    roundDurationLabel: "ラウンド間の準備時間",
    roundDurationOptions: ["90秒", "3分", "5分"],
    roundDurationDescription: "90秒モードでは、手持ちの全ポケモンが同じ量の経験値を獲得します。",
    multiplayerDescription: "現在作成できるのは非公開ルームのみです。",
    roomVisibilityLabel: "公開範囲",
    publicGameTitle: "公開",
    publicGameDescription: "準備中",
    privateGameTitle: "非公開",
    temporaryPasswordLabel: "一時パスワード",
    temporaryPasswordDescription:
      "一緒に遊ぶ友達同士で同じ半角英数字6文字を入力してください。原文は保存も送信もしません。",
    temporaryPasswordPlaceholder: "半角英数字6文字を入力",
    temporaryPasswordGenerate: "ランダム生成",
    temporaryPasswordRequired: "半角英数字6文字の一時パスワードを入力してください。",
    multiplayerConnect: "非公開ルームを作成",
    multiplayerConnectFailed: "マルチプレイ接続を準備できませんでした。もう一度お試しください。",
    preparing: "準備中...",
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

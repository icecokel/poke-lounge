import { findCurrentMatch } from "../network/tournament-projection";
import type { GameState, PlayerPokemon } from "../state/game-state-store";
import { resolvePokeLoungeLocale, type PokeLoungeLocale } from "../../../poke-lounge-copy";

interface AccessibleSummaryCopy {
  trainerPreparing: string;
  noParty: string;
  solo: string;
  room(connectionStatus: string): string;
  tournament: string;
  waiting(ready: number, total: number): string;
  roundStarting: string;
  tournamentComplete: string;
  roomClosed: string;
  opponent(displayName: string): string;
  waitingForMatch: string;
  spectator: string;
  participant: string;
  ranked: string;
  unranked: string;
  party(
    partySize: number,
    pokemon: PlayerPokemon,
    hp: string,
    status: string,
    moves: string,
  ): string;
  hp(currentHp: number, maxHp: number): string;
  hpUnknown: string;
  status(status: string): string;
  moves(moves: string): string;
  connection: Record<GameState["session"]["connectionStatus"], string>;
  pokemonStatus: Record<NonNullable<PlayerPokemon["status"]>, string>;
}

const ACCESSIBLE_SUMMARY_COPY: Record<PokeLoungeLocale, AccessibleSummaryCopy> = {
  "ko-KR": {
    trainerPreparing: "트레이너 정보를 준비하는 중입니다.",
    noParty: "파티 포켓몬을 선택하지 않았습니다.",
    solo: "솔로 플레이, 공개 랭킹 미반영.",
    room: connectionStatus => `멀티플레이, ${connectionStatus}.`,
    tournament: "토너먼트.",
    waiting: (ready, total) => `대기실, 준비 ${ready}/${total}.`,
    roundStarting: "대회 시작 전 준비 중.",
    tournamentComplete: "토너먼트 완료.",
    roomClosed: "방 종료.",
    opponent: displayName => `현재 상대 ${displayName}.`,
    waitingForMatch: "다음 대진 대기 중.",
    spectator: "내 상태 관전.",
    participant: "내 상태 참가.",
    ranked: "공개 랭킹 반영 경기.",
    unranked: "공개 랭킹 미반영 경기.",
    party: (partySize, pokemon, hp, status, moves) =>
      `파티 ${partySize}마리. 선두 ${pokemon.name} 레벨 ${pokemon.level}, ${hp}${status}.${moves}`,
    hp: (currentHp, maxHp) => `HP ${currentHp}/${maxHp}`,
    hpUnknown: "HP 정보 없음",
    status: status => `, 상태 ${status}`,
    moves: moves => ` 기술 ${moves}.`,
    connection: {
      online: "연결됨",
      connecting: "연결 중",
      offline: "연결 끊김",
    },
    pokemonStatus: {
      poisoned: "독",
      burned: "화상",
      paralyzed: "마비",
      fainted: "전투불능",
      normal: "정상",
    },
  },
  "en-US": {
    trainerPreparing: "Preparing trainer information.",
    noParty: "No party Pokémon selected.",
    solo: "Solo play, not included in the public ranking.",
    room: connectionStatus => `Multiplayer, ${connectionStatus}.`,
    tournament: "Tournament.",
    waiting: (ready, total) => `Lobby, ${ready} of ${total} ready.`,
    roundStarting: "Preparing to start the tournament.",
    tournamentComplete: "Tournament complete.",
    roomClosed: "Room closed.",
    opponent: displayName => `Current opponent: ${displayName}.`,
    waitingForMatch: "Waiting for the next match.",
    spectator: "Your role: spectator.",
    participant: "Your role: participant.",
    ranked: "This match counts toward the public ranking.",
    unranked: "This match does not count toward the public ranking.",
    party: (partySize, pokemon, hp, status, moves) =>
      `Party of ${partySize}. Lead ${pokemon.name}, level ${pokemon.level}, ${hp}${status}.${moves}`,
    hp: (currentHp, maxHp) => `HP ${currentHp}/${maxHp}`,
    hpUnknown: "HP unavailable",
    status: status => `, status ${status}`,
    moves: moves => ` Moves: ${moves}.`,
    connection: {
      online: "connected",
      connecting: "connecting",
      offline: "disconnected",
    },
    pokemonStatus: {
      poisoned: "poisoned",
      burned: "burned",
      paralyzed: "paralyzed",
      fainted: "fainted",
      normal: "normal",
    },
  },
  "ja-JP": {
    trainerPreparing: "トレーナー情報を準備しています。",
    noParty: "パーティのポケモンが選択されていません。",
    solo: "ソロプレイ、公開ランキング対象外。",
    room: connectionStatus => `マルチプレイ、${connectionStatus}。`,
    tournament: "トーナメント。",
    waiting: (ready, total) => `ロビー、準備完了 ${ready}/${total}。`,
    roundStarting: "大会開始前の準備中。",
    tournamentComplete: "トーナメント完了。",
    roomClosed: "ルーム終了。",
    opponent: displayName => `現在の相手 ${displayName}。`,
    waitingForMatch: "次の対戦を待っています。",
    spectator: "自分の役割は観戦者です。",
    participant: "自分の役割は参加者です。",
    ranked: "公開ランキング対象の試合です。",
    unranked: "公開ランキング対象外の試合です。",
    party: (partySize, pokemon, hp, status, moves) =>
      `パーティ ${partySize}匹。先頭 ${pokemon.name}、レベル ${pokemon.level}、${hp}${status}。${moves}`,
    hp: (currentHp, maxHp) => `HP ${currentHp}/${maxHp}`,
    hpUnknown: "HP情報なし",
    status: status => `、状態 ${status}`,
    moves: moves => ` わざ: ${moves}。`,
    connection: {
      online: "接続済み",
      connecting: "接続中",
      offline: "切断",
    },
    pokemonStatus: {
      poisoned: "どく",
      burned: "やけど",
      paralyzed: "まひ",
      fainted: "ひんし",
      normal: "正常",
    },
  },
};

export function createAccessibleGameSummary(state: GameState, locale?: string | null): string {
  const copy = ACCESSIBLE_SUMMARY_COPY[resolvePokeLoungeLocale(locale)];
  const player = state.playersById[state.currentPlayerId];

  if (!player) {
    return copy.trainerPreparing;
  }

  const activePokemon =
    player.party.find(function findItem(slot) {
      return slot.slotIndex === player.activePartySlotIndex;
    })?.pokemon ??
    player.party.find(function findItem(slot) {
      return slot.pokemon;
    })?.pokemon;
  const partySummary = activePokemon
    ? createPokemonSummary(
        activePokemon,
        player.party.filter(function filterItem(slot) {
          return slot.pokemon;
        }).length,
        copy,
      )
    : copy.noParty;
  const projection = state.tournament.serverProjection;

  if (!projection) {
    const modeSummary =
      state.session.roomId && state.session.roomId !== "local-preview"
        ? copy.room(copy.connection[state.session.connectionStatus])
        : copy.solo;

    return `${modeSummary} ${partySummary}`;
  }

  const activeMatch = findCurrentMatch(
    projection.tournament.bracket,
    projection.tournament.activeMatchId,
  );
  const ownParticipant = projection.participants.find(function findItem(participant) {
    return participant.playerId === projection.ownPlayerId;
  });
  const opponent = activeMatch?.participantIds.includes(projection.ownPlayerId)
    ? [activeMatch.participantA, activeMatch.participantB].find(function findItem(participant) {
        return participant.playerId !== projection.ownPlayerId;
      })
    : null;
  const readyParticipants = projection.participants.filter(function filterItem(participant) {
    return participant.role === "participant" && participant.ready;
  }).length;
  const totalParticipants = projection.participants.filter(function filterItem(participant) {
    return participant.role === "participant";
  }).length;
  const stageSummary =
    projection.roomStatus === "waiting"
      ? copy.waiting(readyParticipants, totalParticipants)
      : projection.roomStatus === "round-started"
        ? copy.roundStarting
        : projection.roomStatus === "completed"
          ? copy.tournamentComplete
          : projection.roomStatus === "closed"
            ? copy.roomClosed
            : opponent
              ? copy.opponent(opponent.displayName)
              : copy.waitingForMatch;
  const roleSummary = ownParticipant?.role === "spectator" ? copy.spectator : copy.participant;
  const rankingSummary =
    projection.competitionKind === "ranked-head-to-head" ? copy.ranked : copy.unranked;

  return `${copy.tournament} ${stageSummary} ${roleSummary} ${rankingSummary} ${partySummary}`;
}

interface AccessibleSceneCopy {
  field: string;
  battleHealth(
    playerCurrent: string,
    playerMax: string,
    opponentCurrent: string,
    opponentMax: string,
  ): string;
  battleCommand(command: string): string;
  moveSelected(pp: string, maxPp: string): string;
  chooseMove: string;
  partySelected(currentHp: string, maxHp: string): string;
  chooseParty: string;
  bagSelected(quantity: string): string;
  chooseBagItem: string;
  bagTarget(hp: string): string;
  bagEmpty: string;
  battleUpdated: string;
  gameUpdated: string;
  command: Record<string, string>;
}

const ACCESSIBLE_SCENE_COPY: Record<Exclude<PokeLoungeLocale, "ko-KR">, AccessibleSceneCopy> = {
  "en-US": {
    field: "Exploring the field",
    battleHealth: (playerCurrent, playerMax, opponentCurrent, opponentMax) =>
      `Your Pokémon HP ${playerCurrent}/${playerMax}. Opponent Pokémon HP ${opponentCurrent}/${opponentMax}.`,
    battleCommand: command => `Battle command selected: ${command}.`,
    moveSelected: (pp, maxPp) => `Move selected. PP ${pp}/${maxPp}.`,
    chooseMove: "Choose a move.",
    partySelected: (currentHp, maxHp) =>
      `Pokémon selected for switching. HP ${currentHp}/${maxHp}.`,
    chooseParty: "Choose a Pokémon to switch in.",
    bagSelected: quantity => `Bag item selected. ${quantity} remaining.`,
    chooseBagItem: "Choose an item to use.",
    bagTarget: hp => `Bag target selected. HP ${hp}.`,
    bagEmpty: "There are no usable items in the bag.",
    battleUpdated: "Battle status updated.",
    gameUpdated: "Game status updated.",
    command: {
      싸운다: "Fight",
      가방: "Bag",
      포켓몬: "Pokémon",
      도망: "Run",
    },
  },
  "ja-JP": {
    field: "フィールド探索中",
    battleHealth: (playerCurrent, playerMax, opponentCurrent, opponentMax) =>
      `自分のポケモン HP ${playerCurrent}/${playerMax}。相手のポケモン HP ${opponentCurrent}/${opponentMax}。`,
    battleCommand: command => `バトルコマンド「${command}」を選択。`,
    moveSelected: (pp, maxPp) => `わざを選択。PP ${pp}/${maxPp}。`,
    chooseMove: "使用するわざを選んでください。",
    partySelected: (currentHp, maxHp) => `交代するポケモンを選択。HP ${currentHp}/${maxHp}。`,
    chooseParty: "交代するポケモンを選んでください。",
    bagSelected: quantity => `バッグのどうぐを選択。残り ${quantity}個。`,
    chooseBagItem: "使用するどうぐを選んでください。",
    bagTarget: hp => `バッグの対象を選択。HP ${hp}。`,
    bagEmpty: "バッグに使用できるどうぐがありません。",
    battleUpdated: "バトル状況が更新されました。",
    gameUpdated: "ゲーム状況が更新されました。",
    command: {
      싸운다: "たたかう",
      가방: "バッグ",
      포켓몬: "ポケモン",
      도망: "にげる",
    },
  },
};

const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/;

export function localizePokeLoungeAccessibleSceneStatus(
  rawStatus: string,
  locale?: string | null,
): string {
  const resolvedLocale = resolvePokeLoungeLocale(locale);

  if (resolvedLocale === "ko-KR") {
    return rawStatus;
  }

  const copy = ACCESSIBLE_SCENE_COPY[resolvedLocale];
  if (rawStatus === "필드 탐색") {
    return copy.field;
  }

  const battle = rawStatus.match(/^내 .+ HP (\d+)\/(\d+)\. 상대 .+ HP (\d+)\/(\d+)\.(?: (.*))?$/);
  if (battle) {
    const [, playerCurrent, playerMax, opponentCurrent, opponentMax, interaction = ""] = battle;
    return `${copy.battleHealth(playerCurrent, playerMax, opponentCurrent, opponentMax)} ${localizeBattleInteraction(interaction, copy)}`.trim();
  }

  const bagTarget = rawStatus.match(/^가방 대상 .+, HP ([^.]+)\./);
  if (bagTarget) {
    return copy.bagTarget(bagTarget[1]);
  }

  const bagItem = rawStatus.match(/^가방 .+, 보유 (\d+)개\./);
  if (bagItem) {
    return copy.bagSelected(bagItem[1]);
  }

  if (rawStatus.startsWith("가방에 사용할 아이템이 없습니다.")) {
    return copy.bagEmpty;
  }

  return HANGUL_PATTERN.test(rawStatus) ? copy.gameUpdated : rawStatus;
}

function localizeBattleInteraction(interaction: string, copy: AccessibleSceneCopy): string {
  if (!interaction) {
    return copy.battleUpdated;
  }

  const command = interaction.match(/^전투 명령 (싸운다|가방|포켓몬|도망) 선택\.$/);
  if (command) {
    return copy.battleCommand(copy.command[command[1]] ?? command[1]);
  }

  const move = interaction.match(/^기술 .+ 선택\. PP (\d+)\/(\d+)\.$/);
  if (move) {
    return copy.moveSelected(move[1], move[2]);
  }

  if (interaction === "사용할 기술을 선택하세요.") {
    return copy.chooseMove;
  }

  const party = interaction.match(/^교체 대상 .+, HP (\d+)\/(\d+)\.$/);
  if (party) {
    return copy.partySelected(party[1], party[2]);
  }

  if (interaction === "교체할 포켓몬을 선택하세요.") {
    return copy.chooseParty;
  }

  const bag = interaction.match(/^가방 .+ 선택\. 보유 (\d+)개\.$/);
  if (bag) {
    return copy.bagSelected(bag[1]);
  }

  if (interaction === "사용할 아이템을 선택하세요.") {
    return copy.chooseBagItem;
  }

  return HANGUL_PATTERN.test(interaction) ? copy.battleUpdated : interaction;
}

function createPokemonSummary(
  pokemon: PlayerPokemon,
  partySize: number,
  copy: AccessibleSummaryCopy,
): string {
  const hp =
    typeof pokemon.currentHp === "number" && typeof pokemon.maxHp === "number"
      ? copy.hp(Math.max(0, pokemon.currentHp), Math.max(0, pokemon.maxHp))
      : copy.hpUnknown;
  const status =
    pokemon.status && pokemon.status !== "normal"
      ? copy.status(copy.pokemonStatus[pokemon.status])
      : "";
  const moves = pokemon.moves?.length
    ? copy.moves(
        pokemon.moves
          .slice(0, 4)
          .map(function mapItem(move) {
            return `${move.name} PP ${move.pp}/${move.maxPp}`;
          })
          .join(", "),
      )
    : "";

  return copy.party(partySize, pokemon, hp, status, moves);
}

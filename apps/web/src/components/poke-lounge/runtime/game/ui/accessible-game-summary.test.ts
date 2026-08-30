import assert from "node:assert/strict";
import test from "node:test";
import { createTournamentBracketState } from "@poke-lounge/battle";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import { createGameStateStore } from "../state/gameStateStore";
import {
  createAccessibleGameSummary,
  localizePokeLoungeAccessibleSceneStatus,
} from "./accessible-game-summary";

test("접근성 요약은 솔로 파티의 HP와 기술 PP 및 랭킹 제외를 설명한다", () => {
  const store = createGameStateStore();
  store.setStarterPokemon({
    speciesId: 155,
    name: "브케인",
    level: 10,
    currentHp: 24,
    maxHp: 30,
    status: "normal",
    moves: [{ id: 33, name: "몸통박치기", pp: 31, maxPp: 35 }],
  });
  store.setSession({
    sessionId: "local-preview-session",
    roomId: "local-preview",
    connectionStatus: "online",
  });

  const summary = createAccessibleGameSummary(store.getState());

  assert.match(summary, /솔로 플레이/);
  assert.match(summary, /공개 랭킹 미반영/);
  assert.match(summary, /선두 브케인 레벨 10/);
  assert.match(summary, /HP 24\/30/);
  assert.match(summary, /몸통박치기 PP 31\/35/);
});

test("접근성 요약은 영어와 일본어 경로에서 핵심 상태를 현지화한다", () => {
  const store = createGameStateStore();
  store.setStarterPokemon({
    speciesId: 155,
    name: "Cyndaquil",
    level: 10,
    currentHp: 24,
    maxHp: 30,
  });

  const englishSummary = createAccessibleGameSummary(store.getState(), "en-US");
  const japaneseSummary = createAccessibleGameSummary(store.getState(), "ja-JP");

  assert.match(englishSummary, /Solo play/);
  assert.match(englishSummary, /Lead Cyndaquil, level 10/);
  assert.match(japaneseSummary, /ソロプレイ/);
  assert.match(japaneseSummary, /先頭 Cyndaquil、レベル 10/);
});

test("접근성 요약은 내부 멀티플레이 방 코드를 노출하지 않는다", () => {
  const store = createGameStateStore();
  store.setSession({
    sessionId: "session-1",
    roomId: "SECRET",
    connectionStatus: "online",
  });

  const summary = createAccessibleGameSummary(store.getState());

  assert.match(summary, /멀티플레이, 연결됨/);
  assert.doesNotMatch(summary, /SECRET/);
});

test("부전승 플레이어에게 다른 참가자의 현재 경기를 상대라고 안내하지 않는다", () => {
  const bracket = createTournamentBracketState(
    Array.from({ length: 3 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
    })),
    1,
  );
  const projection: TournamentStateRoomPayload = {
    revision: 1,
    roomCode: "ROOM01",
    hostPlayerId: "player-1",
    roundIndex: 1,
    roomStatus: "tournament",
    roomRound: {
      index: 1,
      phase: "tournament",
      durationMs: 180_000,
      startedAtMs: 1_000,
      endsAtMs: 181_000,
    },
    participants: bracket.participants.map(participant => ({
      ...participant,
      role: "participant",
      ready: true,
      partyReady: true,
      connected: true,
    })),
    tournament: {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound?.matches[0]?.matchId ?? null,
      activeMatchAuthority: "server",
      cumulativeScores: {},
    },
    ownPlayerId: "player-1",
    activeMatchTransport: "authority",
    competitionKind: "tournament-unranked",
    finalStandings: [],
    resultSync: { matchId: null, status: "idle" },
  };
  const store = createGameStateStore();
  store.applyTournamentSnapshotFromRoom(projection, 1_000);

  const summary = createAccessibleGameSummary(store.getState());

  assert.match(summary, /다음 대진 대기 중/);
  assert.doesNotMatch(summary, /현재 상대 Player/);
});

test("영어와 일본어 접근성 이벤트는 전투·가방 핵심 상태를 현지화한다", () => {
  const battleStatus =
    "내 브케인 HP 24/30. 상대 치코리타 HP 18/30. 기술 몸통박치기 선택. PP 31/35.";
  const englishBattle = localizePokeLoungeAccessibleSceneStatus(battleStatus, "en-US");
  const japaneseBattle = localizePokeLoungeAccessibleSceneStatus(battleStatus, "ja-JP");

  assert.equal(
    englishBattle,
    "Your Pokémon HP 24/30. Opponent Pokémon HP 18/30. Move selected. PP 31/35.",
  );
  assert.equal(
    japaneseBattle,
    "自分のポケモン HP 24/30。相手のポケモン HP 18/30。 わざを選択。PP 31/35。",
  );
  assert.doesNotMatch(englishBattle, /[\u3131-\u318e\uac00-\ud7a3]/);
  assert.doesNotMatch(japaneseBattle, /[\u3131-\u318e\uac00-\ud7a3]/);

  assert.equal(
    localizePokeLoungeAccessibleSceneStatus(
      "가방 상처약, 보유 3개. 피카츄에게 상처약을 사용했다!",
      "en-US",
    ),
    "Bag item selected. 3 remaining.",
  );
});

test("알 수 없는 한국어 접근성 이벤트는 다른 로케일에 원문을 노출하지 않는다", () => {
  assert.equal(
    localizePokeLoungeAccessibleSceneStatus("새로운 한국어 상태", "en-US"),
    "Game status updated.",
  );
  assert.equal(
    localizePokeLoungeAccessibleSceneStatus("새로운 한국어 상태", "ja-JP"),
    "ゲーム状況が更新されました。",
  );
});

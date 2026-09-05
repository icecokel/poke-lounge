import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_STRUGGLE_MOVE_ID,
} from "@poke-lounge/battle/competitive-ruleset-config";
import {
  isLegalAuthoritativeAction,
  toAuthoritativeBattleState,
} from "../battle/authoritative-battle-adapter";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  resetRuntimeGameDataJsonStateForTest,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
} from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import type {
  CompetitiveProjection,
  CompetitiveRoomProjectionEvent,
} from "../network/local-preview-room";
import {
  createCompetitiveBattleLaunchCache,
  isCompetitiveAssignmentForPlayer,
  shouldPreemptLocalBattleForRound,
} from "./competitive-battle-launch";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test.before(async function callback() {
  await loadRuntimeGameDataJson(async function callback(input) {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    if (
      ![
        POKEMON_DATA_JSON_PATH,
        ITEM_DATA_JSON_PATH,
        LEVEL_UP_MOVE_TABLE_JSON_PATH,
        WILD_BATTLE_MOVE_SETS_JSON_PATH,
        BATTLE_POKEMON_ASSETS_JSON_PATH,
      ].includes(requestPath)
    ) {
      return new Response(null, { status: 404 });
    }
    return new Response(
      fs.readFileSync(path.join(webRoot, "public", requestPath.replace(/^\//, "")), "utf8"),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
});

test.after(function callback() {
  return resetRuntimeGameDataJsonStateForTest();
});

function createProjection(
  matchId: string,
  bracketMatchId: string,
  playerIds: [string, string],
): CompetitiveProjection {
  return {
    matchId,
    bracketMatchId,
    kind: "tournament-unranked",
    assignmentRevision: 1,
    rulesetVersion: 2,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 0,
    turnEndsAtMs: 30_000,
    status: "active",
    playerIds,
    stateHash: "b".repeat(64),
    currentState: {
      rulesetVersion: 2,
      turn: 0,
      participantIds: playerIds,
      playersById: Object.fromEntries(
        playerIds.map(function mapItem(playerId) {
          return [
            playerId,
            {
              playerId,
              activeSlotIndex: 0,
              team: [
                {
                  slotIndex: 0,
                  speciesId: playerId === playerIds[0] ? 7 : 158,
                  level: playerId === playerIds[0] ? 11 : 13,
                  maxHp: 34,
                  currentHp: 34,
                  status: "normal" as const,
                  statStages: {
                    attack: 0,
                    defense: 0,
                    specialAttack: 0,
                    specialDefense: 0,
                    speed: 0,
                    accuracy: 0,
                    evasion: 0,
                  },
                  moves: [{ moveId: 55, pp: 25 }],
                },
              ],
            },
          ];
        }),
      ),
      terminal: null,
    },
    submittedPlayerIds: [],
    terminal: null,
  };
}

test("authoritative terminal state는 기존 WorldScene 복귀 위치를 보존한다", function testCase() {
  const projection = createProjection(
    "11111111-1111-4111-8111-111111111111",
    "game-round-1-bracket-1-match-1",
    ["seed-4", "seed-5"],
  );
  const terminal = {
    winnerPlayerId: "seed-5",
    loserPlayerId: "seed-4",
    reason: "faint" as const,
    scoreByPlayerId: { "seed-4": 50 as const, "seed-5": 100 as const },
  };
  const returnToWorld = {
    mapKey: "new-bark-town",
    x: 656,
    y: 446,
    facing: "front" as const,
  };
  const state = toAuthoritativeBattleState(
    {
      ...projection,
      status: "completed",
      terminal,
      currentState: { ...projection.currentState, terminal },
    },
    "seed-5",
    returnToWorld,
  );

  assert.equal(state.phase, "ended");
  assert.deepEqual(state.returnToWorld, returnToWorld);
  assert.equal(state.player.pokemon.name, "리아코");
  assert.equal(state.player.pokemon.level, 13);
  assert.equal(state.player.pokemon.attack, 25);
  assert.deepEqual(
    state.player.pokemon.moves.map(function mapItem(move) {
      return {
        power: move.power,
        accuracy: move.accuracy,
        maxPp: move.maxPp,
      };
    }),
    [{ power: 40, accuracy: 100, maxPp: 25 }],
  );
});

test("authoritative battle은 활성 포켓몬의 PP가 모두 0일 때만 발버둥을 허용한다", function testCase() {
  const projection = createProjection(
    "11111111-1111-4111-8111-111111111111",
    "game-round-1-bracket-1-match-1",
    ["seed-4", "seed-5"],
  );
  const activePokemon = projection.currentState.playersById["seed-4"]?.team[0];
  assert.ok(activePokemon);
  activePokemon.moves = activePokemon.moves.map(function mapItem(move) {
    return { ...move, pp: 0 };
  });

  assert.equal(
    isLegalAuthoritativeAction(projection, "seed-4", {
      kind: "move",
      moveId: COMPETITIVE_STRUGGLE_MOVE_ID,
    }),
    true,
  );
});

test("같은 턴 상대 행동 갱신은 현재 기술 선택을 닫지 않는다", function testCase() {
  const projection = createProjection(
    "11111111-1111-4111-8111-111111111111",
    "game-round-1-bracket-1-match-1",
    ["seed-4", "seed-5"],
  );
  const selectingMove = {
    ...toAuthoritativeBattleState(projection, "seed-4"),
    phase: "move-select" as const,
  };

  const peerSubmitted = toAuthoritativeBattleState(
    { ...projection, submittedPlayerIds: ["seed-5"] },
    "seed-4",
    undefined,
    undefined,
    selectingMove,
  );
  const nextTurn = toAuthoritativeBattleState(
    {
      ...projection,
      currentTurn: 1,
      currentState: { ...projection.currentState, turn: 1 },
    },
    "seed-4",
    undefined,
    undefined,
    selectingMove,
  );

  assert.equal(peerSubmitted.phase, "move-select");
  assert.equal(nextTurn.phase, "command");
});

test("미지원 상태 기술은 선택 불가로, 공격 기술의 미지원 부가 효과는 표시만 한다", function testCase() {
  const projection = createProjection(
    "11111111-1111-4111-8111-111111111111",
    "game-round-1-bracket-1-match-1",
    ["seed-4", "seed-5"],
  );
  const activePokemon = projection.currentState.playersById["seed-4"]?.team[0];
  assert.ok(activePokemon);
  activePokemon.moves = [
    { moveId: 97, pp: 30 },
    { moveId: 2, pp: 25 },
    { moveId: 82, pp: 10 },
    { moveId: 69, pp: 20 },
  ];

  const state = toAuthoritativeBattleState(projection, "seed-4");

  assert.deepEqual(
    state.player.pokemon.moves.map(function mapItem(move) {
      return {
        moveId: move.id,
        name: move.name,
        support: move.competitiveEffectSupport,
      };
    }),
    [
      { moveId: 97, name: "고속이동", support: "unsupported-primary" },
      { moveId: 2, name: "태권당수", support: "unsupported-secondary" },
      { moveId: 82, name: "용의분노", support: undefined },
      { moveId: 69, name: "지구던지기", support: "unsupported-primary" },
    ],
  );
  assert.equal(
    isLegalAuthoritativeAction(projection, "seed-4", { kind: "move", moveId: 97 }),
    false,
  );
  assert.equal(isLegalAuthoritativeAction(projection, "seed-4", { kind: "move", moveId: 2 }), true);
  assert.equal(
    isLegalAuthoritativeAction(projection, "seed-4", { kind: "move", moveId: 69 }),
    false,
  );
});

test("WorldScene은 handed-off old key만 완료하고 next assignment를 한 번만 launch한다", function testCase() {
  const cache = createCompetitiveBattleLaunchCache();
  const oldEvent: CompetitiveRoomProjectionEvent = {
    projection: createProjection(
      "11111111-1111-4111-8111-111111111111",
      "game-round-1-bracket-1-match-1",
      ["seed-4", "seed-5"],
    ),
    ownPlayerId: "seed-5",
  };
  const nextEvent: CompetitiveRoomProjectionEvent = {
    projection: createProjection(
      "22222222-2222-4222-8222-222222222222",
      "game-round-1-bracket-2-match-1",
      ["seed-1", "seed-5"],
    ),
    ownPlayerId: "seed-5",
  };
  assert.equal(cache.begin(oldEvent), true);
  cache.update(nextEvent);

  cache.complete(oldEvent.projection.matchId, oldEvent.projection.assignmentRevision);
  cache.update(oldEvent);

  assert.equal(
    cache.get(oldEvent.projection.matchId, oldEvent.projection.assignmentRevision),
    null,
  );
  assert.equal(cache.begin(oldEvent), false);
  assert.equal(
    cache.get(nextEvent.projection.matchId, nextEvent.projection.assignmentRevision)?.projection
      .matchId,
    nextEvent.projection.matchId,
  );
  assert.equal(cache.begin(nextEvent), true);
  assert.equal(cache.begin(nextEvent), false);
});

test("상대 포켓몬 교체 전에는 선택을 막고 새 포켓몬이 나온 뒤 재개한다", function testCase() {
  const projection = createProjection(
    "11111111-1111-4111-8111-111111111111",
    "game-round-1-bracket-1-match-1",
    ["seed-4", "seed-5"],
  );
  const opponent = projection.currentState.playersById["seed-5"];
  const active = opponent.team[0];
  opponent.team = [
    { ...active, currentHp: 0, status: "fainted" },
    { ...active, slotIndex: 1 },
  ];
  assert.equal(toAuthoritativeBattleState(projection, "seed-4").phase, "resolving");
  assert.match(toAuthoritativeBattleState(projection, "seed-4").messageQueue[0], /다음 포켓몬/);
  assert.equal(
    isLegalAuthoritativeAction(projection, "seed-4", { kind: "move", moveId: 55 }),
    false,
  );
  assert.equal(toAuthoritativeBattleState(projection, "seed-5").phase, "party-select");
  assert.equal(
    isLegalAuthoritativeAction(projection, "seed-5", { kind: "switch", slotIndex: 1 }),
    true,
  );
  opponent.activeSlotIndex = 1;
  projection.currentTurn += 1;
  assert.equal(toAuthoritativeBattleState(projection, "seed-4").phase, "command");
});

test("공식 배정은 해당 플레이어의 진행 중인 로컬 전투만 선점한다", function testCase() {
  const event: CompetitiveRoomProjectionEvent = {
    projection: createProjection(
      "11111111-1111-4111-8111-111111111111",
      "game-round-1-bracket-1-match-1",
      ["seed-4", "seed-5"],
    ),
    ownPlayerId: "seed-4",
  };

  assert.equal(isCompetitiveAssignmentForPlayer(event), true);
  assert.equal(isCompetitiveAssignmentForPlayer({ ...event, ownPlayerId: "spectator" }), false);
  assert.equal(
    isCompetitiveAssignmentForPlayer({
      ...event,
      ownPlayerId: "spectator",
      spectating: true,
      viewPlayerId: "seed-4",
    }),
    true,
  );
  assert.equal(
    isCompetitiveAssignmentForPlayer({
      ...event,
      projection: { ...event.projection, status: "completed" },
    }),
    false,
  );
});

test("라운드 준비가 끝나면 로컬 전투를 월드로 돌려보낸다", function testCase() {
  const round = { phase: "round-started" as const, endsAtMs: 10_000 };

  assert.equal(shouldPreemptLocalBattleForRound("round-started", round, 10_000, false), true);
  assert.equal(shouldPreemptLocalBattleForRound("round-started", round, 9_999, false), false);
  assert.equal(shouldPreemptLocalBattleForRound("round-started", round, 10_000, true), false);
});

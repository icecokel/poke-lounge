import assert from "node:assert/strict";
import test from "node:test";
import { COMPETITIVE_RULESET_HASH } from "@poke-lounge/battle/competitive-ruleset-config";
import {
  CompetitiveProjectionSchemaError,
  parseCompetitiveProjection,
  parseCompetitiveProjectionContract,
  parseCompetitiveRoomSnapshotContract,
} from "./competitive-projection";

function createProjection(
  input: {
    matchId?: string;
    bracketMatchId?: string;
    playerIds?: readonly [string, string];
  } = {},
) {
  const playerIds = input.playerIds ?? (["player-4", "player-5"] as const);
  const playersById = Object.fromEntries(
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
              status: "normal",
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
  );

  return {
    matchId: input.matchId ?? "123e4567-e89b-42d3-a456-426614174000",
    bracketMatchId: input.bracketMatchId ?? "game-round-1-bracket-1-match-1",
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
      playersById,
      terminal: null,
    },
    submittedPlayerIds: [],
    terminal: null,
  };
}

function createCompletedProjection() {
  const projection = createProjection();
  const terminal = {
    winnerPlayerId: projection.playerIds[0],
    loserPlayerId: projection.playerIds[1],
    reason: "faint" as const,
    scoreByPlayerId: {
      [projection.playerIds[0]]: 100 as const,
      [projection.playerIds[1]]: 50 as const,
    },
  };

  return {
    ...projection,
    status: "completed" as const,
    currentState: { ...projection.currentState, terminal },
    terminal,
  };
}

function createStableCompletedProjection(
  terminalEventId = "terminal-event-room01-revision-50",
  terminalRoomRevision = 50,
) {
  return {
    ...createCompletedProjection(),
    terminalEventId,
    terminalRoomRevision,
  };
}

test("authority projection은 UUID와 stable bracket match ID를 구분해 적용한다", function testCase() {
  const projection = parseCompetitiveProjection(createProjection());

  assert.equal(projection.matchId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(projection.bracketMatchId, "game-round-1-bracket-1-match-1");
  assert.equal(projection.kind, "tournament-unranked");
  assert.equal(projection.turnEndsAtMs, 30_000);
});

test("authority projection은 브라우저가 공유하는 실제 ruleset hash만 적용한다", function testCase() {
  assert.equal(
    parseCompetitiveProjection(createProjection()).rulesetHash,
    COMPETITIVE_RULESET_HASH,
  );
  assert.throws(function callback() {
    return parseCompetitiveProjection({
      ...createProjection(),
      rulesetHash: "a".repeat(64),
    });
  }, CompetitiveProjectionSchemaError);
});

test("bracket match ID가 빠진 authority projection은 거부한다", function testCase() {
  const projection: Record<string, unknown> = { ...createProjection() };
  delete projection.bracketMatchId;

  assert.throws(function callback() {
    return parseCompetitiveProjection(projection);
  }, CompetitiveProjectionSchemaError);
});

test("turn deadline이 빠진 authority projection은 거부한다", function testCase() {
  const projection: Record<string, unknown> = { ...createProjection() };
  delete projection.turnEndsAtMs;

  assert.throws(function callback() {
    return parseCompetitiveProjection(projection);
  }, CompetitiveProjectionSchemaError);
});

test("terminal projection은 stable event metadata를 보존한다", function testCase() {
  const parsed = parseCompetitiveProjectionContract(createStableCompletedProjection());

  assert.equal(parsed.projection.terminalEventId, "terminal-event-room01-revision-50");
  assert.equal(parsed.projection.terminalRoomRevision, 50);
  assert.equal(parsed.terminalMetadataState, "stable");
});

test("완료 직후 metadata 누락 projection은 recovery 신호와 null로 복구한다", function testCase() {
  const parsed = parseCompetitiveProjectionContract(createCompletedProjection());

  assert.equal(parsed.projection.terminalEventId, null);
  assert.equal(parsed.projection.terminalRoomRevision, null);
  assert.equal(parsed.terminalMetadataState, "legacy-recovery-required");
});

test("완료 직후 null metadata projection도 recovery 신호로 읽는다", function testCase() {
  const parsed = parseCompetitiveProjectionContract({
    ...createCompletedProjection(),
    terminalEventId: null,
    terminalRoomRevision: null,
  });

  assert.equal(parsed.projection.terminalEventId, null);
  assert.equal(parsed.projection.terminalRoomRevision, null);
  assert.equal(parsed.terminalMetadataState, "legacy-recovery-required");
});

test("terminal event metadata가 한쪽만 있으면 거부한다", function testCase() {
  assert.throws(function callback() {
    return parseCompetitiveProjection({
      ...createCompletedProjection(),
      terminalEventId: "terminal-event-room01-revision-50",
    });
  }, CompetitiveProjectionSchemaError);
});

test("non-terminal projection은 metadata가 없어도 null과 not-terminal 상태로 정규화한다", function testCase() {
  const parsed = parseCompetitiveProjectionContract(createProjection());

  assert.equal(parsed.projection.terminalEventId, null);
  assert.equal(parsed.projection.terminalRoomRevision, null);
  assert.equal(parsed.terminalMetadataState, "not-terminal");
});

test("room snapshot의 누락 transitions는 빈 배열로, competitive 누락은 omitted로 읽는다", function testCase() {
  const parsed = parseCompetitiveRoomSnapshotContract({ revision: 50 });

  assert.deepEqual(parsed.competitiveTransitions, []);
  assert.deepEqual(parsed.competitiveAssignments, []);
  assert.equal("competitive" in parsed, false);
});

test("room snapshot은 같은 bracket 단계의 경쟁전 여러 개를 함께 읽는다", function testCase() {
  const assignments = [
    createProjection(),
    createProjection({
      matchId: "223e4567-e89b-42d3-a456-426614174001",
      bracketMatchId: "game-round-1-bracket-1-match-2",
      playerIds: ["player-1", "player-2"],
    }),
  ];

  const parsed = parseCompetitiveRoomSnapshotContract({
    revision: 50,
    competitiveAssignments: assignments,
    competitive: assignments[0],
  });

  assert.deepEqual(
    parsed.competitiveAssignments.map(function mapItem(assignment) {
      return assignment.bracketMatchId;
    }),
    ["game-round-1-bracket-1-match-1", "game-round-1-bracket-1-match-2"],
  );
});

test("room snapshot의 competitive null은 거부한다", function testCase() {
  assert.throws(function callback() {
    return parseCompetitiveRoomSnapshotContract({ revision: 50, competitive: null });
  }, CompetitiveProjectionSchemaError);
});

test("room snapshot은 stable completed transition과 optional current assignment를 함께 읽는다", function testCase() {
  const projection = createStableCompletedProjection();
  const parsed = parseCompetitiveRoomSnapshotContract({
    revision: 50,
    competitiveTransitions: [
      {
        terminalEventId: projection.terminalEventId,
        terminalRoomRevision: projection.terminalRoomRevision,
        projection,
      },
    ],
    competitive: createProjection(),
  });

  assert.equal(parsed.competitiveTransitions.length, 1);
  assert.equal(parsed.competitiveTransitions[0]?.projection.status, "completed");
  assert.equal(parsed.competitive?.status, "active");
  assert.equal(parsed.competitive?.terminalEventId, null);
});

test("transition wrapper와 projection의 terminal metadata가 다르면 거부한다", function testCase() {
  const projection = createStableCompletedProjection();

  assert.throws(function callback() {
    return parseCompetitiveRoomSnapshotContract({
      revision: 50,
      competitiveTransitions: [
        {
          terminalEventId: "different-terminal-event",
          terminalRoomRevision: projection.terminalRoomRevision,
          projection,
        },
      ],
    });
  }, CompetitiveProjectionSchemaError);
});

test("stable metadata가 없는 완료 projection은 transition cache 입력으로 허용하지 않는다", function testCase() {
  assert.throws(function callback() {
    return parseCompetitiveRoomSnapshotContract({
      revision: 50,
      competitiveTransitions: [
        {
          terminalEventId: "terminal-event-room01-revision-50",
          terminalRoomRevision: 50,
          projection: createCompletedProjection(),
        },
      ],
    });
  }, CompetitiveProjectionSchemaError);
});

test("competitiveTransitions는 최대 8개까지만 허용한다", function testCase() {
  const projection = createStableCompletedProjection();
  const transition = {
    terminalEventId: projection.terminalEventId,
    terminalRoomRevision: projection.terminalRoomRevision,
    projection,
  };

  assert.throws(function callback() {
    return parseCompetitiveRoomSnapshotContract({
      revision: 50,
      competitiveTransitions: Array.from({ length: 9 }, function callback() {
        return transition;
      }),
    });
  }, CompetitiveProjectionSchemaError);
});

test("competitiveTransitions가 revision과 event ID 순서를 어기면 거부한다", function testCase() {
  const later = createStableCompletedProjection("terminal-event-b", 50);
  const earlier = {
    ...createStableCompletedProjection("terminal-event-a", 49),
    matchId: "123e4567-e89b-42d3-a456-426614174001",
    bracketMatchId: "game-round-1-bracket-1-match-2",
  };

  assert.throws(function callback() {
    return parseCompetitiveRoomSnapshotContract({
      revision: 50,
      competitiveTransitions: [
        {
          terminalEventId: later.terminalEventId,
          terminalRoomRevision: later.terminalRoomRevision,
          projection: later,
        },
        {
          terminalEventId: earlier.terminalEventId,
          terminalRoomRevision: earlier.terminalRoomRevision,
          projection: earlier,
        },
      ],
    });
  }, CompetitiveProjectionSchemaError);
});

test("서로 다른 team 길이와 비연속 physical slot을 보존한다", function testCase() {
  const projection = createProjection();
  projection.currentState.playersById["player-4"].team = [
    projection.currentState.playersById["player-4"].team[0],
    {
      ...projection.currentState.playersById["player-4"].team[0],
      slotIndex: 2,
      speciesId: 152,
      level: 17,
    },
    {
      ...projection.currentState.playersById["player-4"].team[0],
      slotIndex: 5,
      speciesId: 158,
      level: 13,
    },
  ];
  projection.currentState.playersById["player-4"].activeSlotIndex = 2;

  const parsed = parseCompetitiveProjection(projection);

  assert.deepEqual(
    parsed.currentState.playersById["player-4"].team.map(function mapItem(member) {
      return member.slotIndex;
    }),
    [0, 2, 5],
  );
  assert.equal(parsed.currentState.playersById["player-5"].team.length, 1);
});

for (const [name, mutate] of [
  [
    "7번째 member",
    function callback(projection: ReturnType<typeof createProjection>) {
      const team = projection.currentState.playersById["player-4"].team;
      projection.currentState.playersById["player-4"].team = Array.from(
        { length: 7 },
        function callback(_, slotIndex) {
          return { ...team[0], slotIndex };
        },
      );
    },
  ],
  [
    "duplicate slot",
    function callback(projection: ReturnType<typeof createProjection>) {
      const team = projection.currentState.playersById["player-4"].team;
      projection.currentState.playersById["player-4"].team = [team[0], { ...team[0] }];
    },
  ],
  [
    "invalid HP",
    function callback(projection: ReturnType<typeof createProjection>) {
      projection.currentState.playersById["player-4"].team[0].currentHp = 35;
    },
  ],
  [
    "invalid PP",
    function callback(projection: ReturnType<typeof createProjection>) {
      projection.currentState.playersById["player-4"].team[0].moves[0].pp = 100;
    },
  ],
  [
    "V1 ruleset",
    function callback(projection: ReturnType<typeof createProjection>) {
      projection.rulesetVersion = 1;
      projection.currentState.rulesetVersion = 1;
    },
  ],
] as const) {
  test(`${name} projection은 거부한다`, function testCase() {
    const projection = createProjection();
    mutate(projection);

    assert.throws(function callback() {
      return parseCompetitiveProjection(projection);
    }, CompetitiveProjectionSchemaError);
  });
}

import {
  advanceTournamentAuthorityMatch,
  createTerminalHpScores,
  hashCompetitiveActionRequest,
  isSupportedCompetitiveRuleset,
  resolveTurnReceipts,
  shouldPublishVerifiedHistory,
} from './postgres-competitive-action.repository';
import { PokeLoungeCompetitiveAction } from './competitive-action.entity';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  createTournamentBracketState,
  hashCanonicalState,
} from '@poke-lounge/battle';
import {
  createTestInitialBattleState,
  createTestPartySnapshots,
} from '../../../test/support/competitive-party.fixture';
import type { DataSource, EntityManager } from 'typeorm';
import { PostgresCompetitiveActionRepository } from './postgres-competitive-action.repository';
import { getMetadataArgsStorage } from 'typeorm';
import { PokeLoungeCompetitiveMatch } from '../entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from '../entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeRoom } from '../entities/poke-lounge-room.entity';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { CompetitiveActionResult } from './competitive-action.repository';
import { COMPETITIVE_TURN_DEADLINE_MS } from './competitive-action.repository';
import type { CompetitiveActionProjection } from './competitive-action.types';
import { POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS } from '../poke-lounge-room-policy';

describe('hashCompetitiveActionRequest', () => {
  it('is canonical for the same command and changes with authoritative fields', () => {
    const input = {
      matchId: 'match-1',
      assignmentRevision: 1,
      turn: 0,
      clientCommandId: '00000000-0000-4000-8000-000000000001',
      action: { kind: 'move' as const, moveId: 55 },
    };
    const hash = hashCompetitiveActionRequest(input);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCompetitiveActionRequest({ ...input })).toBe(hash);
    expect(
      hashCompetitiveActionRequest({
        ...input,
        action: { kind: 'switch', slotIndex: 1 },
      }),
    ).not.toBe(hash);
    expect(hashCompetitiveActionRequest({ ...input, turn: 1 })).not.toBe(hash);
  });
});

describe('competitive action resolution guards', () => {
  it('scores the authoritative terminal teams by remaining HP ratio', () => {
    const state = createTestInitialBattleState(['player-1', 'player-2']);
    const player2 = state.playersById['player-2'];
    player2.team[0].currentHp = 0;

    expect(createTerminalHpScores(state)).toEqual({
      'player-1': 100,
      'player-2': 0,
    });
  });

  it('publishes verified history only for ranked head-to-head matches', () => {
    expect(shouldPublishVerifiedHistory('ranked-head-to-head')).toBe(true);
    expect(shouldPublishVerifiedHistory('tournament-unranked')).toBe(false);
  });

  it('stores terminal history IDs in a private nullable JSONB match column', () => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === PokeLoungeCompetitiveMatch &&
        candidate.propertyName === 'historyPublication',
    );

    expect(column?.options).toMatchObject({
      name: 'history_publication',
      type: 'jsonb',
      nullable: true,
      select: false,
    });
  });

  it('updates both turn receipts with one resolved response and timestamp', () => {
    const receipts = [
      { status: 'pending', response: { currentTurn: 0 }, resolvedAt: null },
      { status: 'resolved', response: { currentTurn: 1 }, resolvedAt: null },
    ] as unknown as [PokeLoungeCompetitiveAction, PokeLoungeCompetitiveAction];
    const response = { currentTurn: 1 } as never;
    const resolvedAt = new Date('2026-07-11T00:00:00.000Z');

    resolveTurnReceipts(receipts, response, resolvedAt);

    expect(receipts).toEqual([
      { status: 'resolved', response, resolvedAt },
      { status: 'resolved', response, resolvedAt },
    ]);
  });

  it('accepts only the currently supported persisted ruleset identity', () => {
    expect(
      isSupportedCompetitiveRuleset({
        rulesetVersion: COMPETITIVE_RULESET_VERSION,
        rulesetHash: COMPETITIVE_RULESET_HASH,
      }),
    ).toBe(true);
    expect(
      isSupportedCompetitiveRuleset({
        rulesetVersion: COMPETITIVE_RULESET_VERSION + 1,
        rulesetHash: COMPETITIVE_RULESET_HASH,
      }),
    ).toBe(false);
    expect(
      isSupportedCompetitiveRuleset({
        rulesetVersion: COMPETITIVE_RULESET_VERSION,
        rulesetHash: '0'.repeat(64),
      }),
    ).toBe(false);
  });
});

describe('PostgresCompetitiveActionRepository command replay ordering', () => {
  it.each(['pending', 'resolved'] as const)(
    'replays a stored %s receipt before rejecting an unsupported ruleset',
    async (status) => {
      const input = actionInput();
      const response = {
        matchId: input.matchId,
        assignmentRevision: 1,
        rulesetVersion: COMPETITIVE_RULESET_VERSION,
        rulesetHash: COMPETITIVE_RULESET_HASH,
        currentTurn: status === 'pending' ? 0 : 1,
        status: status === 'pending' ? 'active' : 'completed',
        playerIds: ['player-a', 'player-b'] as [string, string],
        currentState: createTestInitialBattleState(['player-a', 'player-b']),
        stateHash: 'b'.repeat(64),
        submittedPlayerIds: status === 'pending' ? ['player-a'] : [],
        terminal: null,
      };
      const { repository, actionEntityRepository } = repositoryWithReceipt({
        requestHash: hashCompetitiveActionRequest(input),
        response,
        status,
      });

      const result = await repository.submit(input);

      expect(result).toMatchObject({
        outcome: 'replayed',
        response,
        committed: false,
      });
      expect(result.room).toMatchObject({ roomCode: 'ROOM01', revision: 7 });
      expect(actionEntityRepository.save).not.toHaveBeenCalled();
    },
  );

  it('returns command conflict for a changed replay before rejecting an unsupported ruleset', async () => {
    const input = actionInput();
    const { repository, actionEntityRepository } = repositoryWithReceipt({
      requestHash: hashCompetitiveActionRequest(input),
      response: { currentTurn: 0 },
      status: 'pending',
    });

    await expect(
      repository.submit({
        ...input,
        action: { kind: 'switch', slotIndex: 1 },
      }),
    ).resolves.toEqual({ outcome: 'command-conflict' });
    expect(actionEntityRepository.save).not.toHaveBeenCalled();
  });
});

describe('PostgresCompetitiveActionRepository terminal convergence contract', () => {
  it('resolves the submitted action at its deadline and only finishes on faint', async () => {
    const harness = terminalTournamentRepository();
    await harness.repository.submit(harness.firstInput);
    harness.actionQueryResults.splice(2, 0, {
      getOne: () => harness.actionRows[0],
    });
    const deadlineMs =
      harness.actionRows[0].createdAt.getTime() + COMPETITIVE_TURN_DEADLINE_MS;

    const result = await harness.repository.expirePendingTurn({
      roomCode: 'ROOM01',
      matchId: harness.oldMatchId,
      turn: 0,
      nowMs: deadlineMs,
    });

    expect(result).toMatchObject({
      outcome: 'resolved',
      response: {
        status: 'completed',
        terminal: {
          winnerPlayerId: 'player-4',
          loserPlayerId: 'player-5',
          reason: 'faint',
        },
      },
    });
    expect(harness.actionRows[0]).toMatchObject({
      status: 'resolved',
      resolvedAt: new Date(deadlineMs),
    });
  });

  it('rejects a second action submitted after the turn deadline', async () => {
    const harness = terminalTournamentRepository();
    await harness.repository.submit(harness.firstInput);
    harness.actionRows[0].createdAt = new Date(
      Date.now() - COMPETITIVE_TURN_DEADLINE_MS,
    );
    const lateInput = {
      ...harness.secondInput,
      action: { kind: 'move' as const, moveId: 'unknown-move' },
    };

    const result = await harness.repository.submit(lateInput);

    expect(result).toEqual({ outcome: 'turn-conflict' });
    expect(harness.actionRows).toHaveLength(1);
    expect(harness.actionRows[0]?.status).toBe('pending');
  });

  it('returns explicit null terminal metadata for the first pending action', async () => {
    const { harness, pending } = await terminalTournamentEvidence();

    expect(pending).toMatchObject({
      outcome: 'accepted',
      committed: true,
      response: {
        status: 'active',
        submittedPlayerIds: ['player-4'],
        terminalEventId: null,
        terminalRoomRevision: null,
      },
    });
    expect(harness.room.expiresAt.getTime()).toBe(
      harness.room.state.updatedAtMs + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
    );
  });

  it('returns the completed old match and next assignment in one composite terminal snapshot', async () => {
    const { harness, terminal } = await terminalTournamentEvidence();
    const terminalProjection = requireCompletedProjection(terminal.response);
    const transition = requireTerminalTransition(terminal.room);

    expect(terminal).toMatchObject({
      outcome: 'accepted',
      committed: true,
      response: {
        matchId: harness.oldMatchId,
        status: 'completed',
        terminalEventId: terminalProjection.terminalEventId,
        terminalRoomRevision: terminalProjection.terminalRoomRevision,
        terminal: {
          winnerPlayerId: 'player-4',
          loserPlayerId: 'player-5',
        },
      },
      room: {
        revision: harness.terminalRevision,
        competitiveTransitions: [
          {
            terminalEventId: terminalProjection.terminalEventId,
            terminalRoomRevision: harness.terminalRevision,
            projection: {
              matchId: harness.oldMatchId,
              status: 'completed',
              terminalEventId: terminalProjection.terminalEventId,
              terminalRoomRevision: harness.terminalRevision,
              terminal: {
                winnerPlayerId: 'player-4',
                loserPlayerId: 'player-5',
                reason: 'faint',
              },
            },
          },
        ],
        competitive: {
          bracketMatchId: 'game-round-1-bracket-2-match-1',
          status: 'pending',
        },
      },
    });

    expect(transition.terminalEventId).toBe(terminalProjection.terminalEventId);
    expect(transition.projection.terminalEventId).toBe(
      terminalProjection.terminalEventId,
    );
    expect(transition.terminalRoomRevision).toBe(
      terminalProjection.terminalRoomRevision,
    );
    expect(transition.projection.terminalRoomRevision).toBe(
      terminalProjection.terminalRoomRevision,
    );
  });

  it('resolves both action receipts to the same completed projection and event metadata', async () => {
    const { harness, terminal } = await terminalTournamentEvidence();
    const terminalProjection = requireCompletedProjection(terminal.response);

    expect(terminalProjection.terminalEventId).toEqual(expect.any(String));
    expect(terminalProjection.terminalRoomRevision).toBe(
      harness.terminalRevision,
    );
    expect(harness.actionRows).toHaveLength(2);
    for (const actionRow of harness.actionRows) {
      const response = requireCompletedProjection(actionRow.response);

      expect(actionRow.status).toBe('resolved');
      expect(response).toMatchObject({
        matchId: harness.oldMatchId,
        terminalEventId: terminalProjection.terminalEventId,
        terminalRoomRevision: terminalProjection.terminalRoomRevision,
      });
    }
  });

  it('replays the second command with the original terminal event and no new commit', async () => {
    const { harness, terminal, replay } = await terminalTournamentEvidence();
    const terminalProjection = requireCompletedProjection(terminal.response);

    expect(terminalProjection.terminalEventId).toEqual(expect.any(String));
    expect(replay).toMatchObject({
      outcome: 'replayed',
      committed: false,
      response: {
        matchId: harness.oldMatchId,
        terminalEventId: terminalProjection.terminalEventId,
        terminalRoomRevision: terminalProjection.terminalRoomRevision,
      },
    });
  });

  it('keeps tournament-unranked final-turn history at zero writes', async () => {
    const { harness } = await terminalTournamentEvidence();

    expect(harness.historyWriter.write).not.toHaveBeenCalled();
  });
});

describe('advanceTournamentAuthorityMatch', () => {
  it('advances the bracket and creates only the next active unranked assignment', async () => {
    const bracket = createTournamentBracketState(
      Array.from({ length: 5 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      })),
      1,
    );
    const firstMatchId = bracket.currentRound!.matches[0].matchId;
    const room = {
      id: '00000000-0000-4000-8000-000000000001',
      roomCode: 'ROOM01',
      state: {
        roomCode: 'ROOM01',
        status: 'tournament',
        createdAtMs: 0,
        updatedAtMs: 0,
        participants: [],
        partySnapshots: createTestPartySnapshots([
          'player-1',
          'player-2',
          'player-3',
          'player-4',
          'player-5',
        ]),
        round: {
          index: 1,
          phase: 'tournament',
          durationMs: 1,
          startedAtMs: 0,
          endsAtMs: 1,
        },
        tournament: {
          version: 2,
          bracket,
          activeMatchId: firstMatchId,
          activeMatchAuthority: 'server',
          cumulativeScores: {},
        },
        finalStandings: [],
      },
    } as unknown as PokeLoungeRoom;
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) =>
      Promise.resolve({ matchId: value.matchId }),
    );
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveMatch) {
          return {
            create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
            save: matchSave,
          };
        }
        if (entity === PokeLoungeCompetitiveSeat) {
          return {
            find: jest.fn().mockResolvedValue(
              Array.from({ length: 5 }, (_, index) => ({
                playerId: `player-${index + 1}`,
                accountId: `account-${index + 1}`,
              })),
            ),
          };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const completedMatch = {
      roomId: room.id,
      roomCode: room.roomCode,
      matchId: '11111111-1111-4111-8111-111111111111',
      bracketMatchId: firstMatchId,
      kind: 'tournament-unranked',
      assignmentRevision: 1,
      currentState: createTestInitialBattleState(['player-4', 'player-5']),
      completedAt: new Date(2_000),
      terminalResult: {
        winnerPlayerId: 'player-4',
        loserPlayerId: 'player-5',
        reason: 'faint',
        scoreByPlayerId: { 'player-4': 100, 'player-5': 50 },
      },
    } as unknown as PokeLoungeCompetitiveMatch;

    const nextProjection = await advanceTournamentAuthorityMatch(
      manager,
      room,
      completedMatch,
    );

    expect(room.state.tournament.bracket?.currentRound?.roundNumber).toBe(2);
    expect(room.state.tournament.activeMatchId).toBe(
      'game-round-1-bracket-2-match-1',
    );
    expect(room.state.tournament.activeMatchAuthority).toBe('server');
    expect(nextProjection).toMatchObject({
      bracketMatchId: 'game-round-1-bracket-2-match-1',
      kind: 'tournament-unranked',
      status: 'pending',
      submittedPlayerIds: [],
    });
    expect(matchSave).toHaveBeenCalledWith(
      expect.objectContaining({
        bracketMatchId: 'game-round-1-bracket-2-match-1',
        kind: 'tournament-unranked',
        playerAccounts: [
          { playerId: 'player-1', accountId: 'account-1' },
          { playerId: 'player-4', accountId: 'account-4' },
        ],
      }),
    );
    const nextAssignment = matchSave.mock.calls[0]?.[0];
    const frozenMember =
      room.state.partySnapshots['player-4'].competitiveParty.members[0];
    expect(
      nextAssignment?.initialState.playersById['player-4'].team[0],
    ).toMatchObject({
      speciesId: frozenMember.speciesId,
      level: frozenMember.level,
      currentHp: frozenMember.currentHp,
      moves: frozenMember.moves,
    });
  });
});

function actionInput() {
  return {
    roomCode: 'ROOM01',
    matchId: '11111111-1111-4111-8111-111111111111',
    accountId: 'account-a',
    assignmentRevision: 1,
    turn: 0,
    clientCommandId: '00000000-0000-4000-8000-000000000001',
    action: { kind: 'move' as const, moveId: 55 },
  };
}

function repositoryWithReceipt(receipt: {
  requestHash: string;
  response: unknown;
  status: 'pending' | 'resolved';
}) {
  const room = {
    id: 'room-id',
    roomCode: 'ROOM01',
    revision: 7,
    expiresAt: new Date('2026-07-11T01:00:00.000Z'),
    state: {
      roomCode: 'ROOM01',
      revision: 7,
      updatedAtMs: 0,
      participants: [],
    },
  };
  const match = {
    matchId: actionInput().matchId,
    playerAccounts: [
      { playerId: 'player-a', accountId: 'account-a' },
      { playerId: 'player-b', accountId: 'account-b' },
    ],
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: '0'.repeat(64),
  };
  const roomRepository = queryRepository(room);
  const matchRepository = queryRepository(match);
  const actionEntityRepository = queryRepository({
    actorPlayerId: 'player-a',
    clientCommandId: actionInput().clientCommandId,
    ...receipt,
  });
  const manager = {
    getRepository: jest
      .fn()
      .mockReturnValueOnce(roomRepository)
      .mockReturnValueOnce(matchRepository)
      .mockReturnValue(actionEntityRepository),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  } as unknown as DataSource;

  return {
    repository: new PostgresCompetitiveActionRepository(dataSource, {
      write: jest.fn().mockResolvedValue([]),
    }),
    actionEntityRepository,
  };
}

async function terminalTournamentEvidence() {
  const harness = terminalTournamentRepository();
  const pending = requireAcceptedResult(
    await harness.repository.submit(harness.firstInput),
  );
  const terminal = requireAcceptedResult(
    await harness.repository.submit(harness.secondInput),
  );
  const replay = requireAcceptedResult(
    await harness.repository.submit(harness.secondInput),
  );

  return { harness, pending, terminal, replay };
}

function terminalTournamentRepository() {
  const bracket = createTournamentBracketState(
    Array.from({ length: 5 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
    })),
    1,
  );
  const activeBracketMatchId = bracket.currentRound!.matches[0].matchId;
  const oldMatchId = '11111111-1111-4111-8111-111111111111';
  const currentState = createTestInitialBattleState(['player-4', 'player-5']);
  currentState.playersById['player-5'].team.forEach((combatant, index) => {
    combatant.currentHp = index === 0 ? 1 : 0;
  });
  const match = {
    roomId: '00000000-0000-4000-8000-000000000001',
    roomCode: 'ROOM01',
    matchId: oldMatchId,
    bracketMatchId: activeBracketMatchId,
    kind: 'tournament-unranked',
    assignmentRevision: 1,
    playerAccounts: [
      { playerId: 'player-4', accountId: 'account-4' },
      { playerId: 'player-5', accountId: 'account-5' },
    ],
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    serverSeed: 'server-owned-seed',
    initialState: structuredClone(currentState),
    initialStateHash: hashCanonicalState(currentState),
    currentState,
    currentStateHash: hashCanonicalState(currentState),
    currentTurn: 0,
    status: 'pending',
    terminalEventId: null,
    terminalRoomRevision: null,
    terminalResult: null,
    historyPublication: null,
    completedAt: null,
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
  } as unknown as PokeLoungeCompetitiveMatch;
  const room = {
    id: match.roomId,
    roomCode: 'ROOM01',
    revision: 49,
    expiresAt: new Date('2026-07-16T01:00:00.000Z'),
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    state: {
      roomCode: 'ROOM01',
      status: 'tournament',
      createdAtMs: 0,
      updatedAtMs: 0,
      participants: [],
      partySnapshots: createTestPartySnapshots([
        'player-1',
        'player-2',
        'player-3',
        'player-4',
        'player-5',
      ]),
      round: {
        index: 1,
        phase: 'tournament',
        durationMs: 1,
        startedAtMs: 0,
        endsAtMs: 1,
      },
      tournament: {
        version: 2,
        bracket,
        activeMatchId: activeBracketMatchId,
        activeMatchAuthority: 'server',
        cumulativeScores: {},
      },
      finalStandings: [],
    },
  } as unknown as PokeLoungeRoom;
  const actionRows: PokeLoungeCompetitiveAction[] = [];
  let actionQueryCount = 0;
  const actionQueryResults: Array<{
    getOne?: () => PokeLoungeCompetitiveAction | null;
    getMany?: () => PokeLoungeCompetitiveAction[];
  }> = [
    { getOne: () => null },
    { getMany: () => [] },
    { getOne: () => null },
    { getMany: () => [actionRows[0]] },
    {
      getOne: () =>
        actionRows.find(
          (row) => row.clientCommandId === secondInput.clientCommandId,
        ) ?? null,
    },
  ];
  const actionEntityRepository = {
    createQueryBuilder: jest.fn(() => {
      const result = actionQueryResults[actionQueryCount++];
      if (!result) {
        throw new Error('Action query script exhausted');
      }
      return {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn(() => Promise.resolve(result.getOne?.() ?? null)),
        getMany: jest.fn(() => Promise.resolve(result.getMany?.() ?? [])),
      };
    }),
    create: jest.fn((value: PokeLoungeCompetitiveAction) => value),
    save: jest.fn(
      (value: PokeLoungeCompetitiveAction | PokeLoungeCompetitiveAction[]) => {
        if (Array.isArray(value)) {
          actionRows.splice(0, actionRows.length, ...value);
        } else {
          value.createdAt ??= new Date('2099-07-16T00:00:00.000Z');
          if (!actionRows.includes(value)) {
            actionRows.push(value);
          }
        }
        return Promise.resolve(value);
      },
    ),
  };
  const roomRepository = {
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(room),
    })),
    save: jest.fn((value: PokeLoungeRoom) => Promise.resolve(value)),
  };
  const matchRepository = {
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(match),
    })),
    create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
    save: jest.fn((value: PokeLoungeCompetitiveMatch) =>
      Promise.resolve(value),
    ),
  };
  const seatRepository = {
    find: jest.fn().mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        accountId: `account-${index + 1}`,
      })),
    ),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === PokeLoungeRoom) {
        return roomRepository;
      }
      if (entity === PokeLoungeCompetitiveMatch) {
        return matchRepository;
      }
      if (entity === PokeLoungeCompetitiveAction) {
        return actionEntityRepository;
      }
      if (entity === PokeLoungeCompetitiveSeat) {
        return seatRepository;
      }
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  const historyWriter = { write: jest.fn().mockResolvedValue([]) };
  const firstInput = {
    ...actionInput(),
    accountId: 'account-4',
  };
  const secondInput = {
    ...actionInput(),
    accountId: 'account-5',
    clientCommandId: '00000000-0000-4000-8000-000000000002',
  };

  return {
    repository: new PostgresCompetitiveActionRepository(
      dataSource,
      historyWriter,
    ),
    firstInput,
    secondInput,
    oldMatchId,
    terminalRevision: 51,
    actionRows,
    actionQueryResults,
    historyWriter,
    room,
  };
}

type CompletedCompetitiveActionProjection = CompetitiveActionProjection & {
  status: 'completed';
  terminalEventId: string;
  terminalRoomRevision: number;
  terminal: NonNullable<CompetitiveActionProjection['terminal']>;
};

function requireAcceptedResult(
  result: CompetitiveActionResult,
): Extract<CompetitiveActionResult, { outcome: 'accepted' | 'replayed' }> {
  if (result.outcome !== 'accepted' && result.outcome !== 'replayed') {
    throw new Error(
      `Expected accepted competitive action result, received ${result.outcome}`,
    );
  }

  return result;
}

function requireCompletedProjection(
  projection: CompetitiveActionProjection,
): CompletedCompetitiveActionProjection {
  const { terminalEventId, terminalRoomRevision, terminal } = projection;
  if (
    projection.status !== 'completed' ||
    typeof terminalEventId !== 'string' ||
    !Number.isSafeInteger(terminalRoomRevision) ||
    terminalRoomRevision < 0 ||
    !terminal
  ) {
    throw new Error('Expected completed competitive action projection');
  }

  return {
    ...projection,
    status: 'completed',
    terminalEventId,
    terminalRoomRevision,
    terminal,
  };
}

function requireTerminalTransition(room: PokeLoungeRoomSnapshot) {
  const transition = room.competitiveTransitions?.[0];
  if (!transition) {
    throw new Error('Expected terminal transition in composite room snapshot');
  }

  return transition;
}

function queryRepository(result: unknown) {
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    save: jest.fn(),
  };
}

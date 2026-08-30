import type { DataSource, EntityManager } from 'typeorm';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  createTournamentBracketState,
} from '@poke-lounge/battle';
import {
  createTestInitialBattleState,
  createTestPartySnapshots,
} from '../../../test/support/competitive-party.fixture';
import { PostgresCompetitiveMatchRepository } from './postgres-competitive-match.repository';
import {
  POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
} from '../poke-lounge-room-policy';

type SeatRow = {
  sessionId: string;
  playerId: string;
  accountId: string;
};

type ScriptedQueryBuilder = {
  setLock: jest.Mock<ScriptedQueryBuilder, [string]>;
  addSelect: jest.Mock<ScriptedQueryBuilder, [string[]]>;
  where: jest.Mock<ScriptedQueryBuilder, [string, Record<string, unknown>]>;
  andWhere: jest.Mock<ScriptedQueryBuilder, [string]>;
  getOne: jest.Mock<Promise<unknown>, []>;
};

describe('PostgresCompetitiveMatchRepository', () => {
  it('locks the activated room and stores a late second seat and assignment in one transaction', async () => {
    const calls: string[] = [];
    const room = {
      id: 'room-id',
      roomCode: 'ROOM01',
      state: activatedRoomState(),
      revision: 7,
      expiresAt: new Date('2026-07-11T01:00:00.000Z'),
    };
    const existingSeats: SeatRow[] = [
      {
        sessionId: 'session-a',
        playerId: 'player-a',
        accountId: 'account-a',
      },
    ];
    const seatRepository = {
      find: jest.fn<Promise<SeatRow[]>, []>(() =>
        Promise.resolve(existingSeats),
      ),
      create: jest.fn<SeatRow, [SeatRow]>((value) => value),
      save: jest.fn<Promise<SeatRow>, [SeatRow]>((value) => {
        calls.push('seat-save');
        return Promise.resolve(value);
      }),
    };
    type MatchAssignment = ReturnType<typeof assignment>;
    const matchRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(null, calls),
      ),
      create: jest.fn<MatchAssignment, [MatchAssignment]>((value) => value),
      save: jest.fn<Promise<MatchAssignment>, [MatchAssignment]>((value) => {
        calls.push('match-save');
        return Promise.resolve(value);
      }),
    };
    const roomQueryBuilder = chainQueryBuilder(room, calls, true);
    const roomRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(
        () => roomQueryBuilder,
      ),
      save: jest.fn().mockResolvedValue(room),
    };
    const getRepository = jest
      .fn<unknown, [unknown]>()
      .mockReturnValueOnce(roomRepository)
      .mockReturnValueOnce(seatRepository)
      .mockReturnValueOnce(matchRepository)
      .mockReturnValueOnce(roomRepository);
    const manager = {
      getRepository,
    } as unknown as EntityManager;
    const repository = new PostgresCompetitiveMatchRepository(
      managerDataSource(manager),
    );

    const result = await repository.bindSeatAndAssign({
      roomCode: 'room01',
      sessionId: 'session-b',
      accountId: 'account-b',
      createAssignment: (context) => assignment(context),
    });

    expect(roomQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(roomQueryBuilder.andWhere).toHaveBeenCalledWith(
      'room.expiresAt >= CURRENT_TIMESTAMP',
    );
    expect(seatRepository.save).toHaveBeenCalledTimes(1);
    expect(matchRepository.save).toHaveBeenCalledTimes(1);
    expect(roomRepository.save).toHaveBeenCalledTimes(1);
    expect(room.state.tournament.activeMatchAuthority).toBe('server');
    expect(room.expiresAt.getTime()).toBe(
      room.state.updatedAtMs + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
    );
    expect(calls.indexOf('seat-save')).toBeLessThan(
      calls.indexOf('match-save'),
    );
    expect(result).toMatchObject({ outcome: 'assigned' });
  });

  it('renews the operational lease for a newly bound seat before assignment without advancing the room revision', async () => {
    const calls: string[] = [];
    const room = {
      id: 'room-id',
      roomCode: 'ROOM01',
      state: activatedRoomState(),
      revision: 7,
      expiresAt: new Date(1),
      updatedAt: new Date(0),
    };
    const seatRepository = {
      find: jest.fn<Promise<SeatRow[]>, []>().mockResolvedValue([]),
      create: jest.fn<SeatRow, [SeatRow]>((value) => value),
      save: jest.fn<Promise<SeatRow>, [SeatRow]>((value) =>
        Promise.resolve(value),
      ),
    };
    const matchRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(null, calls),
      ),
    };
    const roomRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(room, calls, true),
      ),
      save: jest.fn().mockResolvedValue(room),
    };
    const manager = {
      getRepository: jest
        .fn<unknown, [unknown]>()
        .mockReturnValueOnce(roomRepository)
        .mockReturnValueOnce(seatRepository)
        .mockReturnValueOnce(matchRepository)
        .mockReturnValueOnce(roomRepository),
    } as unknown as EntityManager;
    const repository = new PostgresCompetitiveMatchRepository(
      managerDataSource(manager),
    );
    const leaseWindowStartedAt = Date.now();

    const result = await repository.bindSeatAndAssign({
      roomCode: 'ROOM01',
      sessionId: 'session-a',
      accountId: 'account-a',
      createAssignment: (context) => assignment(context),
    });

    const leaseWindowEndedAt = Date.now();
    expect(result).toEqual({
      outcome: 'bound-casual',
      assignment: null,
      eligible: false,
    });
    expect(seatRepository.save).toHaveBeenCalledTimes(1);
    expect(roomRepository.save).toHaveBeenCalledTimes(1);
    expect(room.revision).toBe(7);
    expect(room.state.updatedAtMs).toBe(0);
    expect(room.expiresAt.getTime()).toBeGreaterThanOrEqual(
      leaseWindowStartedAt + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
    );
    expect(room.expiresAt.getTime()).toBeLessThanOrEqual(
      leaseWindowEndedAt + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
    );
  });

  it('does not extend a pending-only room lease when binding its competitive seat', async () => {
    const calls: string[] = [];
    const pendingUntilMs = Date.now() + POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS;
    const state = {
      ...roomState(['player-a']),
      participants: [
        {
          ...participant('session-a', 'player-a'),
          presencePendingUntilMs: pendingUntilMs,
        },
      ],
    };
    const room = {
      id: 'room-id',
      roomCode: 'ROOM01',
      state,
      revision: 0,
      expiresAt: new Date(pendingUntilMs),
      updatedAt: new Date(state.updatedAtMs),
    };
    const seatRepository = {
      find: jest.fn<Promise<SeatRow[]>, []>().mockResolvedValue([]),
      create: jest.fn<SeatRow, [SeatRow]>((value) => value),
      save: jest.fn<Promise<SeatRow>, [SeatRow]>((value) =>
        Promise.resolve(value),
      ),
    };
    const matchRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(null, calls),
      ),
    };
    const roomRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(room, calls, true),
      ),
      save: jest.fn().mockResolvedValue(room),
    };
    const manager = {
      getRepository: jest
        .fn<unknown, [unknown]>()
        .mockReturnValueOnce(roomRepository)
        .mockReturnValueOnce(seatRepository)
        .mockReturnValueOnce(matchRepository)
        .mockReturnValueOnce(roomRepository),
    } as unknown as EntityManager;
    const repository = new PostgresCompetitiveMatchRepository(
      managerDataSource(manager),
    );

    await expect(
      repository.bindSeatAndAssign({
        roomCode: 'ROOM01',
        sessionId: 'session-a',
        accountId: 'account-a',
        createAssignment: (context) => assignment(context),
      }),
    ).resolves.toMatchObject({ outcome: 'bound-casual' });

    expect(room.expiresAt.getTime()).toBe(pendingUntilMs);
    expect(room.revision).toBe(0);
  });

  it('keeps a third participant seat casual without returning the existing assignment', async () => {
    const calls: string[] = [];
    const existingAssignment = assignment({
      roomId: 'room-id',
      roomCode: 'ROOM01',
      assignmentRevision: 1,
      players: [
        { playerId: 'player-a', accountId: 'account-a' },
        { playerId: 'player-b', accountId: 'account-b' },
      ],
    });
    const seats: SeatRow[] = [
      {
        sessionId: 'session-a',
        playerId: 'player-a',
        accountId: 'account-a',
      },
      {
        sessionId: 'session-b',
        playerId: 'player-b',
        accountId: 'account-b',
      },
    ];
    const seatRepository = {
      find: jest.fn<Promise<SeatRow[]>, []>(() => Promise.resolve(seats)),
      create: jest.fn<SeatRow, [SeatRow]>((value) => value),
      save: jest.fn<Promise<SeatRow>, [SeatRow]>((value) =>
        Promise.resolve(value),
      ),
    };
    const matchRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(existingAssignment, calls),
      ),
    };
    const room = {
      id: 'room-id',
      roomCode: 'ROOM01',
      state: activatedRoomState(['player-a', 'player-b', 'player-c']),
      revision: 7,
      expiresAt: new Date(1),
      updatedAt: new Date(0),
    };
    const roomRepository = {
      createQueryBuilder: jest.fn<ScriptedQueryBuilder, []>(() =>
        chainQueryBuilder(room, calls, true),
      ),
      save: jest.fn().mockResolvedValue(room),
    };
    const manager = {
      getRepository: jest
        .fn<unknown, [unknown]>()
        .mockReturnValueOnce(roomRepository)
        .mockReturnValueOnce(seatRepository)
        .mockReturnValueOnce(matchRepository)
        .mockReturnValueOnce(roomRepository),
    } as unknown as EntityManager;
    const repository = new PostgresCompetitiveMatchRepository(
      managerDataSource(manager),
    );

    const result = await repository.bindSeatAndAssign({
      roomCode: 'ROOM01',
      sessionId: 'session-c',
      accountId: 'account-c',
      createAssignment: (context) => assignment(context),
    });

    expect(seatRepository.save).toHaveBeenCalledTimes(1);
    expect(roomRepository.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: 'bound-ineligible',
      assignment: null,
      eligible: false,
    });
    expect(JSON.stringify(result)).not.toContain(existingAssignment.matchId);
  });

  it('returns eligible false before binding when a third player reuses an assigned account', async () => {
    const calls: string[] = [];
    const existingAssignment = assignment({
      roomId: 'room-id',
      roomCode: 'ROOM01',
      assignmentRevision: 1,
      players: [
        { playerId: 'player-a', accountId: 'account-a' },
        { playerId: 'player-b', accountId: 'account-b' },
      ],
    });
    const seatSave = jest.fn<Promise<SeatRow>, [SeatRow]>((value) =>
      Promise.resolve(value),
    );
    const manager = {
      getRepository: jest
        .fn<unknown, [unknown]>()
        .mockReturnValueOnce({
          createQueryBuilder: () =>
            chainQueryBuilder(
              {
                id: 'room-id',
                roomCode: 'ROOM01',
                state: activatedRoomState(['player-a', 'player-b', 'player-c']),
              },
              calls,
              true,
            ),
        })
        .mockReturnValueOnce({
          find: () =>
            Promise.resolve([
              {
                sessionId: 'session-a',
                playerId: 'player-a',
                accountId: 'account-a',
              },
              {
                sessionId: 'session-b',
                playerId: 'player-b',
                accountId: 'account-b',
              },
            ]),
          create: (value: SeatRow) => value,
          save: seatSave,
        })
        .mockReturnValueOnce({
          createQueryBuilder: () =>
            chainQueryBuilder(existingAssignment, calls),
        }),
    } as unknown as EntityManager;
    const repository = new PostgresCompetitiveMatchRepository(
      managerDataSource(manager),
    );

    await expect(
      repository.bindSeatAndAssign({
        roomCode: 'ROOM01',
        sessionId: 'session-c',
        accountId: 'account-a',
        createAssignment: (context) => assignment(context),
      }),
    ).resolves.toEqual({
      outcome: 'bound-ineligible',
      assignment: null,
      eligible: false,
    });
    expect(seatSave).not.toHaveBeenCalled();
  });
});

function chainQueryBuilder(
  result: unknown,
  calls: string[],
  room = false,
): ScriptedQueryBuilder {
  const builder = {} as ScriptedQueryBuilder;
  builder.setLock = jest.fn<ScriptedQueryBuilder, [string]>(() => builder);
  builder.addSelect = jest.fn<ScriptedQueryBuilder, [string[]]>(() => builder);
  builder.where = jest.fn<
    ScriptedQueryBuilder,
    [string, Record<string, unknown>]
  >(() => builder);
  builder.andWhere = jest.fn<ScriptedQueryBuilder, [string]>(() => builder);
  builder.getOne = jest.fn<Promise<unknown>, []>(() => {
    calls.push(room ? 'room-lock' : 'match-read');
    return Promise.resolve(result);
  });
  return builder;
}

function managerDataSource(manager: EntityManager): DataSource {
  return {
    transaction<T>(runInTransaction: (value: EntityManager) => Promise<T>) {
      return runInTransaction(manager);
    },
  } as unknown as DataSource;
}

function assignment(context: {
  roomId: string;
  roomCode: string;
  assignmentRevision: number;
  players: [
    { playerId: string; accountId: string },
    { playerId: string; accountId: string },
  ];
}) {
  const participantIds = context.players.map((player) => player.playerId) as [
    string,
    string,
  ];
  const state = createTestInitialBattleState(participantIds);
  return {
    ...context,
    matchId: '00000000-0000-4000-8000-000000000001',
    bracketMatchId: 'game-round-1-bracket-1-match-1',
    kind: 'tournament-unranked' as const,
    playerAccounts: context.players,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    serverSeed: 'b'.repeat(64),
    initialState: state,
    initialStateHash: 'c'.repeat(64),
    currentState: state,
    currentStateHash: 'c'.repeat(64),
    currentTurn: 0,
    turnStartedAtMs: 0,
    status: 'pending' as const,
    terminalResult: null,
    terminalEventId: null,
    terminalRoomRevision: null,
    completedAt: null,
  };
}

function roomState(playerIds = ['player-a', 'player-b']) {
  return {
    roomCode: 'ROOM01',
    status: 'waiting' as const,
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: playerIds.map((playerId, index) =>
      participant(`session-${String.fromCharCode(97 + index)}`, playerId),
    ),
    partySnapshots: createTestPartySnapshots(playerIds),
    round: {
      index: 1,
      phase: 'waiting' as const,
      durationMs: 1000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
  };
}

function activatedRoomState(playerIds = ['player-a', 'player-b']) {
  const room = roomState(playerIds);
  const bracket = createTournamentBracketState(
    room.participants.map(({ playerId, displayName }) => ({
      playerId,
      displayName,
    })),
    room.round.index,
  );

  return {
    ...room,
    status: 'tournament' as const,
    round: {
      ...room.round,
      phase: 'tournament' as const,
      startedAtMs: 0,
      endsAtMs: 1000,
    },
    tournament: {
      version: 2 as const,
      bracket,
      activeMatchId: bracket.currentRound!.matches[0].matchId,
      activeMatchAuthority: 'casual' as const,
      cumulativeScores: {},
    },
  };
}

function participant(sessionId: string, playerId: string) {
  return {
    sessionId,
    playerId,
    displayName: playerId,
    role: 'participant' as const,
    ready: false,
    connected: true,
    joinedAtMs: 0,
  };
}

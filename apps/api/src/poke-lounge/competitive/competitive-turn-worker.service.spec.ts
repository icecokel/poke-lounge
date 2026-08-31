import { Logger } from '@nestjs/common';
import { DelayedError, Worker } from 'bullmq';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from '@poke-lounge/battle/competitive-ruleset-config';
import { createTestInitialBattleState } from '../../../test/support/competitive-party.fixture';
import type { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type {
  CompetitiveActionRepository,
  CompetitivePendingTurn,
} from './competitive-action.repository';
import type { CompetitiveTurnQueue } from './competitive-turn-queue';
import { CompetitiveTurnWorkerService } from './competitive-turn-worker.service';

jest.mock('bullmq', function callback() {
  const actual = jest.requireActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Worker: jest.fn(),
  };
});

describe('CompetitiveTurnWorkerService', function testSuite() {
  let workerOn: jest.MockedFunction<
    (event: string, listener: (...args: unknown[]) => void) => void
  >;

  beforeEach(function setUpTest() {
    jest.mocked(Worker).mockClear();
    workerOn = jest.fn();
    jest.mocked(Worker).mockImplementation(function mockImplementation() {
      return {
        on: workerOn,
        waitUntilReady: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      } as never;
    });
  });

  it('schedules the next turn and publishes only the committed room cursor', async function testCase() {
    const actionRepository = repository();
    const liveState = liveStateService();
    const turnQueue = queue();
    const nextTurn = pendingTurn({ turn: 1, deadlineMs: 61_000 });
    actionRepository.expirePendingTurn.mockResolvedValue({
      outcome: 'resolved',
      response: competitiveProjection(),
      room: roomSnapshot(),
      nextTurn,
    });
    const service = createService(actionRepository, liveState, turnQueue);

    await expect(service.process(job())).resolves.toEqual({
      outcome: 'resolved',
    });

    expect(turnQueue.schedule.mock.calls).toEqual([[nextTurn]]);
    expect(liveState.publishRoomCommit.mock.calls).toEqual([
      [{ roomCode: 'ROOM01', revision: 2 }],
    ]);
    expect(turnQueue.schedule.mock.invocationCallOrder[0]).toBeLessThan(
      liveState.publishRoomCommit.mock.invocationCallOrder[0],
    );
    expect(
      JSON.stringify(liveState.publishRoomCommit.mock.calls),
    ).not.toContain('session-secret');
  });

  it('still publishes the committed revision when next-turn scheduling fails', async function testCase() {
    const actionRepository = repository();
    const liveState = liveStateService();
    const turnQueue = queue();
    const scheduleError = new Error('queue unavailable');
    const nextTurn = pendingTurn({ turn: 1, deadlineMs: 61_000 });
    actionRepository.expirePendingTurn.mockResolvedValue({
      outcome: 'resolved',
      response: competitiveProjection(),
      room: roomSnapshot(),
      nextTurn,
    });
    actionRepository.findPendingTurns.mockResolvedValue([nextTurn]);
    turnQueue.schedule.mockRejectedValueOnce(scheduleError);
    const service = createService(actionRepository, liveState, turnQueue);

    await expect(service.process(job())).rejects.toBe(scheduleError);

    expect(liveState.publishRoomCommit.mock.calls).toEqual([
      [{ roomCode: 'ROOM01', revision: 2 }],
    ]);
    expect(actionRepository.findPendingTurns.mock.calls).toHaveLength(1);
    expect(turnQueue.schedule.mock.calls).toEqual([[nextTurn], [nextTurn]]);
    expect(
      liveState.publishRoomCommit.mock.invocationCallOrder[0],
    ).toBeLessThan(turnQueue.schedule.mock.invocationCallOrder[1]);
  });

  it('returns an early job to its durable Redis deadline', async function testCase() {
    const actionRepository = repository();
    actionRepository.expirePendingTurn.mockResolvedValue({
      outcome: 'not-due',
      retryAtMs: 31_000,
    });
    const service = createService(
      actionRepository,
      liveStateService(),
      queue(),
    );
    const turnJob = job();

    await expect(service.process(turnJob)).rejects.toBeInstanceOf(DelayedError);
    expect(turnJob.moveToDelayed).toHaveBeenCalledWith(31_000, 'lock-token');
  });

  it('reconciles missing turn jobs at startup and periodically', async function testCase() {
    jest.useFakeTimers();
    const actionRepository = repository();
    const liveState = liveStateService();
    const turnQueue = queue();
    const pending = pendingTurn();
    actionRepository.findPendingTurns.mockResolvedValue([pending]);
    const service = createService(actionRepository, liveState, turnQueue, {
      REDIS_URL: 'redis://localhost:6379',
    });

    try {
      await service.onModuleInit();

      expect(liveState.connect.mock.calls).toHaveLength(1);
      expect(actionRepository.findPendingTurns.mock.calls).toHaveLength(1);
      expect(turnQueue.schedule.mock.calls).toContainEqual([pending]);
      expect(Worker).toHaveBeenCalledTimes(1);
      expect(
        workerOn.mock.calls.map(function mapItem([event]) {
          return event;
        }),
      ).toEqual(['error', 'failed']);
      const failedListener = workerOn.mock.calls.find(function findItem([
        event,
      ]) {
        return event === 'failed';
      })?.[1];
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(function mockImplementation() {
          return undefined;
        });
      try {
        failedListener?.({ id: 'match-1-0' }, new Error('turn worker failure'));
        expect(loggerError.mock.calls).toContainEqual([
          'Competitive turn job match-1-0 failed',
          expect.stringContaining('turn worker failure'),
        ]);
      } finally {
        loggerError.mockRestore();
      }

      await jest.advanceTimersByTimeAsync(10_000);

      expect(actionRepository.findPendingTurns.mock.calls).toHaveLength(2);
      expect(turnQueue.schedule.mock.calls).toHaveLength(2);
    } finally {
      await service.onModuleDestroy();
      jest.useRealTimers();
    }
  });
});

function createService(
  actionRepository: jest.Mocked<CompetitiveActionRepository>,
  liveState: jest.Mocked<PokeLoungeLiveStateService>,
  turnQueue: jest.Mocked<CompetitiveTurnQueue>,
  config: Record<string, string> = {},
): CompetitiveTurnWorkerService {
  return new CompetitiveTurnWorkerService(
    {
      get: jest.fn(function mockFunction(key: string) {
        return config[key];
      }),
    } as never,
    liveState,
    actionRepository,
    turnQueue,
  );
}

type MockedCompetitiveActionRepository =
  jest.Mocked<CompetitiveActionRepository> & {
    findPendingTurns: jest.MockedFunction<
      NonNullable<CompetitiveActionRepository['findPendingTurns']>
    >;
  };

function repository(): MockedCompetitiveActionRepository {
  return {
    submit: jest.fn(),
    findPendingTurns: jest.fn(),
    expirePendingTurn: jest.fn(),
  };
}

function liveStateService(): jest.Mocked<PokeLoungeLiveStateService> {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    publishRoomCommit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PokeLoungeLiveStateService>;
}

function queue(): jest.Mocked<CompetitiveTurnQueue> {
  return {
    schedule: jest.fn().mockResolvedValue(undefined),
  };
}

function pendingTurn(
  overrides: Partial<CompetitivePendingTurn> = {},
): CompetitivePendingTurn {
  return {
    roomCode: 'ROOM01',
    matchId: 'match-1',
    turn: 0,
    deadlineMs: 31_000,
    ...overrides,
  };
}

function job() {
  return {
    data: pendingTurn({ deadlineMs: 30_000 }),
    token: 'lock-token',
    moveToDelayed: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function competitiveProjection() {
  return {
    matchId: 'match-1',
    bracketMatchId: 'game-round-1-bracket-1-match-1',
    kind: 'tournament-unranked' as const,
    assignmentRevision: 1,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 1,
    turnEndsAtMs: 61_000,
    status: 'active' as const,
    terminalEventId: null,
    terminalRoomRevision: null,
    playerIds: ['player-a', 'player-b'] as [string, string],
    currentState: createTestInitialBattleState(['player-a', 'player-b']),
    stateHash: 'a'.repeat(64),
    submittedPlayerIds: [],
    terminal: null,
  };
}

function roomSnapshot() {
  return {
    roomCode: 'ROOM01',
    status: 'tournament' as const,
    createdAtMs: 0,
    updatedAtMs: 1_000,
    participants: [
      {
        playerId: 'player-a',
        sessionId: 'session-secret',
        displayName: 'Player A',
        role: 'host' as const,
        ready: true,
        connected: true,
        joinedAtMs: 0,
      },
    ],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'tournament' as const,
      durationMs: 180_000,
      startedAtMs: 0,
      endsAtMs: 180_000,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: 'game-round-1-bracket-1-match-1',
      activeMatchAuthority: 'server' as const,
      cumulativeScores: {},
    },
    finalStandings: [],
    revision: 2,
    expiresAtMs: 360_000,
    competitive: competitiveProjection(),
  };
}

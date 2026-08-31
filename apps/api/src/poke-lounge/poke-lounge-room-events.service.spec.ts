import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from '@poke-lounge/battle/competitive-ruleset-config';
import { createTestInitialBattleState } from '../../test/support/competitive-party.fixture';
import type { CompetitiveProjectionService } from './competitive/competitive-projection.service';
import type { PokeLoungeRoomCommittedEvent } from './poke-lounge-room-event.publisher';
import {
  PokeLoungeRoomEventsService,
  type PokeLoungeRoomTransportEvent,
} from './poke-lounge-room-events.service';
import type {
  PokeLoungeLiveStateService,
  PokeLoungeRoomCommitNotification,
} from './poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';

const TEST_EXPIRES_AT_MS = 253_402_300_799_999;

describe('PokeLoungeRoomEventsService', function testSuite() {
  it('publishes only a Redis cursor and relays the canonical public snapshot', async function testCase() {
    const harness = createHarness();
    const listener = roomEventListener();
    harness.service.subscribe(listener);
    await harness.service.onModuleInit();

    await harness.service.publish(committedEvent(publicRoom()));
    expect(harness.liveState.publishRoomCommit.mock.calls).toEqual([
      [{ roomCode: 'ROOM01', revision: 3 }],
    ]);
    expect(listener).not.toHaveBeenCalled();

    harness.projection.findRoomSnapshot.mockResolvedValueOnce(roomSnapshot());
    harness.notify({ roomCode: 'ROOM01', revision: 3 });
    await flushCommit();

    expect(harness.projection.findRoomSnapshot.mock.calls).toEqual([
      ['ROOM01', 2],
    ]);
    expect(listener).toHaveBeenCalledWith({
      type: 'room.snapshot',
      room: publicRoom(),
    });
    expect(JSON.stringify(listener.mock.calls)).not.toContain('sessionId');
  });

  it('ignores duplicate and reverse notifications while retaining terminal transitions', async function testCase() {
    const harness = createHarness();
    const receivedEvents: PokeLoungeRoomTransportEvent[] = [];
    const listener = jest.fn(function mockFunction(
      event: PokeLoungeRoomTransportEvent,
    ) {
      receivedEvents.push(event);
    });
    harness.service.subscribe(listener);
    await harness.service.onModuleInit();
    const terminal = competitiveProjection({
      status: 'completed',
      terminalEventId: '00000000-0000-4000-8000-000000000050',
      terminalRoomRevision: 10,
    });
    harness.projection.findRoomSnapshot.mockResolvedValueOnce(
      roomSnapshot({
        revision: 10,
        competitiveTransitions: [
          {
            terminalEventId: terminal.terminalEventId!,
            terminalRoomRevision: terminal.terminalRoomRevision!,
            projection: terminal,
          },
        ],
      }),
    );

    harness.notify({ roomCode: 'ROOM01', revision: 10 });
    await flushCommit();
    harness.notify({ roomCode: 'ROOM01', revision: 10 });
    harness.notify({ roomCode: 'ROOM01', revision: 9 });
    await flushCommit();

    expect(harness.projection.findRoomSnapshot.mock.calls).toEqual([
      ['ROOM01', 9],
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(receivedEvents[0]).toMatchObject({
      room: {
        competitiveTransitions: [
          {
            terminalRoomRevision: 10,
            projection: { status: 'completed' },
          },
        ],
      },
    });
  });

  it('serializes same-room notifications and relays a terminal transition once', async function testCase() {
    const harness = createHarness();
    const listener = roomEventListener();
    harness.service.subscribe(listener);
    await harness.service.onModuleInit();
    const snapshot = deferred<PokeLoungeRoomSnapshot>();
    const terminal = competitiveProjection({
      status: 'completed',
      terminalEventId: '00000000-0000-4000-8000-000000000051',
      terminalRoomRevision: 10,
    });
    harness.projection.findRoomSnapshot.mockReturnValueOnce(snapshot.promise);

    harness.notify({ roomCode: 'ROOM01', revision: 10 });
    harness.notify({ roomCode: 'ROOM01', revision: 10 });
    await flushCommit();

    expect(harness.projection.findRoomSnapshot.mock.calls).toEqual([
      ['ROOM01', 9],
    ]);

    snapshot.resolve(
      roomSnapshot({
        revision: 10,
        competitiveTransitions: [
          {
            terminalEventId: terminal.terminalEventId!,
            terminalRoomRevision: terminal.terminalRoomRevision!,
            projection: terminal,
          },
        ],
      }),
    );
    await flushCommit();

    expect(harness.projection.findRoomSnapshot.mock.calls).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('drops expired cursors before accepting a reused room code', async function testCase() {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const harness = createHarness();
    const listener = roomEventListener();
    harness.service.subscribe(listener);
    await harness.service.onModuleInit();
    harness.projection.findRoomSnapshot
      .mockResolvedValueOnce(roomSnapshot({ revision: 5, expiresAtMs: 2_000 }))
      .mockResolvedValueOnce(roomSnapshot({ revision: 0, expiresAtMs: 4_000 }));

    try {
      harness.notify({ roomCode: 'ROOM01', revision: 5 });
      await flushCommit();
      now.mockReturnValue(3_000);
      harness.notify({ roomCode: 'ROOM01', revision: 0 });
      await flushCommit();

      expect(harness.projection.findRoomSnapshot.mock.calls).toEqual([
        ['ROOM01', 4],
        ['ROOM01', 0],
      ]);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('stops delivering events and closes the Redis subscription', async function testCase() {
    const harness = createHarness();
    const listener = roomEventListener();
    const unsubscribe = harness.service.subscribe(listener);
    unsubscribe();
    await harness.service.onModuleInit();
    harness.projection.findRoomSnapshot.mockResolvedValueOnce(roomSnapshot());

    harness.notify({ roomCode: 'ROOM01', revision: 3 });
    await flushCommit();
    await harness.service.onModuleDestroy();

    expect(listener).not.toHaveBeenCalled();
    expect(harness.unsubscribeFromRedis).toHaveBeenCalledTimes(1);
  });
});

function createHarness() {
  let notify: (notification: PokeLoungeRoomCommitNotification) => void = () =>
    undefined;
  const unsubscribeFromRedis = jest.fn().mockResolvedValue(undefined);
  const liveState = {
    publishRoomCommit: jest.fn().mockResolvedValue(undefined),
    subscribeRoomCommits: jest.fn(function mockFunction(
      listener: (notification: PokeLoungeRoomCommitNotification) => void,
    ) {
      notify = listener;
      return Promise.resolve(unsubscribeFromRedis);
    }),
  } as unknown as jest.Mocked<PokeLoungeLiveStateService>;
  const projection = {
    findRoomSnapshot: jest.fn(),
  } as unknown as jest.Mocked<CompetitiveProjectionService>;
  return {
    service: new PokeLoungeRoomEventsService(liveState, projection),
    liveState,
    projection,
    unsubscribeFromRedis,
    notify: (notification: PokeLoungeRoomCommitNotification) =>
      notify(notification),
  };
}

function committedEvent(
  snapshot: PokeLoungePublicRoomState,
): PokeLoungeRoomCommittedEvent {
  return { type: 'room-updated', snapshot };
}

function roomSnapshot(
  overrides: Partial<PokeLoungeRoomSnapshot> = {},
): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
        playerId: 'player-1',
        sessionId: 'session-secret',
        displayName: 'Player 1',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
    ],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting',
      durationMs: 1_000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: emptyTournament(),
    finalStandings: [],
    revision: 3,
    expiresAtMs: TEST_EXPIRES_AT_MS,
    competitiveTransitions: [],
    competitiveAssignments: [],
    ...overrides,
  };
}

function publicRoom(): PokeLoungePublicRoomState {
  const { participants, ...snapshot } = roomSnapshot();
  return {
    ...snapshot,
    hostPlayerId: 'player-1',
    participants: participants.map(function mapItem({
      playerId,
      displayName,
      role,
      ready,
      connected,
      joinedAtMs,
    }) {
      return {
        playerId,
        displayName,
        role,
        ready,
        connected,
        joinedAtMs,
      };
    }),
  };
}

function competitiveProjection(
  overrides: Partial<ReturnType<typeof activeCompetitiveProjection>> = {},
) {
  return { ...activeCompetitiveProjection(), ...overrides };
}

function activeCompetitiveProjection() {
  return {
    matchId: 'match-1',
    bracketMatchId: 'game-round-1-bracket-1-match-1',
    kind: 'tournament-unranked' as const,
    assignmentRevision: 1,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 1,
    turnEndsAtMs: 31_000,
    status: 'active' as const,
    playerIds: ['player-a', 'player-b'] as [string, string],
    currentState: {
      ...createTestInitialBattleState(['player-a', 'player-b']),
      turn: 1,
    },
    stateHash: 'a'.repeat(64),
    submittedPlayerIds: [],
    terminal: null,
    terminalEventId: null,
    terminalRoomRevision: null,
  };
}

function emptyTournament() {
  return {
    version: 2 as const,
    bracket: null,
    activeMatchId: null,
    activeMatchAuthority: null,
    cumulativeScores: {},
  };
}

function flushCommit(): Promise<void> {
  return new Promise(function resolvePromise(resolve) {
    return setImmediate(resolve);
  });
}

function roomEventListener() {
  return jest.fn<(event: PokeLoungeRoomTransportEvent) => void>();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(function resolvePromise(complete) {
    resolve = complete;
  });
  return { promise, resolve };
}

import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  hashCanonicalState,
} from '@poke-lounge/battle';
import {
  createTestInitialBattleState,
  createTestPartySnapshots,
} from '../../test/support/competitive-party.fixture';
import type {
  CreatePokeLoungeRedisRoomResult,
  PokeLoungeRedisRoomRecord,
} from './poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import { RedisPokeLoungeRepository } from './redis-poke-lounge.repository';

describe('RedisPokeLoungeRepository', () => {
  it('commits a room revision once and replays the same command', async () => {
    const redis = new InMemoryRedisRoomState();
    const repository = new RedisPokeLoungeRepository(redis as never);
    const room = roomSnapshot();

    await expect(
      repository.create({
        room,
        actorPlayerId: 'player-1',
        idempotencyKey: 'create-1',
        requestHash: 'create-hash',
        nowMs: 0,
      }),
    ).resolves.toMatchObject({ outcome: 'committed' });

    const input = {
      operation: 'ready' as const,
      roomCode: room.roomCode,
      actorPlayerId: 'player-1',
      idempotencyKey: 'ready-1',
      requestHash: 'ready-hash',
      expectedRevision: 0,
      nowMs: 1,
      apply: (current: PokeLoungeRoomSnapshot) => ({
        ...current,
        updatedAtMs: 1,
        participants: current.participants.map((participant) => ({
          ...participant,
          ready: true,
        })),
      }),
    };
    const committed = await repository.mutate(input);
    const replayed = await repository.mutate(input);

    expect(committed).toMatchObject({
      outcome: 'committed',
      committedChange: true,
      snapshot: { revision: 1 },
    });
    expect(replayed).toMatchObject({
      outcome: 'replayed',
      committedChange: false,
      snapshot: { revision: 1 },
    });
    expect(redis.compareAndSetCalls).toBe(1);
  });

  it('restores and resolves a competitive turn even when nobody acts', async () => {
    const redis = new InMemoryRedisRoomState();
    const repository = new RedisPokeLoungeRepository(redis as never);
    const room = roomSnapshot();
    await repository.create({
      room,
      actorPlayerId: 'player-1',
      idempotencyKey: 'create-1',
      requestHash: 'create-hash',
      nowMs: 0,
    });
    redis.seedOpenTurn(room.roomCode, {
      matchId: 'match-1',
      turn: 3,
      startedAtMs: 1_000,
    });

    await expect(repository.findPendingTurns()).resolves.toEqual([
      {
        roomCode: 'ROOM01',
        matchId: 'match-1',
        turn: 3,
        deadlineMs: 31_000,
      },
    ]);

    await expect(
      repository.expirePendingTurn({
        roomCode: room.roomCode,
        matchId: 'match-1',
        turn: 3,
        nowMs: 30_999,
      }),
    ).resolves.toEqual({ outcome: 'not-due', retryAtMs: 31_000 });

    await expect(
      repository.expirePendingTurn({
        roomCode: room.roomCode,
        matchId: 'match-1',
        turn: 3,
        nowMs: 31_000,
      }),
    ).resolves.toMatchObject({
      outcome: 'resolved',
      response: {
        status: 'active',
        currentTurn: 4,
        turnEndsAtMs: 61_000,
        submittedPlayerIds: [],
        terminal: null,
      },
      nextTurn: {
        roomCode: 'ROOM01',
        matchId: 'match-1',
        turn: 4,
        deadlineMs: 61_000,
      },
    });
    await expect(repository.findPendingTurns()).resolves.toEqual([
      {
        roomCode: 'ROOM01',
        matchId: 'match-1',
        turn: 4,
        deadlineMs: 61_000,
      },
    ]);
  });

  it('creates every ready bracket match in the same stage concurrently', async () => {
    const redis = new InMemoryRedisRoomState();
    const repository = new RedisPokeLoungeRepository(redis as never);
    const room = sixPlayerRoundSnapshot();
    await repository.create({
      room,
      actorPlayerId: 'player-1',
      idempotencyKey: 'create-1',
      requestHash: 'create-hash',
      nowMs: 0,
    });

    const advanced = await repository.getAndAdvance(room.roomCode, 100);
    const assignments = advanced.snapshot?.competitiveAssignments ?? [];

    expect(advanced.snapshot).toMatchObject({
      status: 'tournament',
      tournament: { activeMatchAuthority: 'server' },
    });
    expect(assignments).toHaveLength(2);
    expect(
      new Set(assignments.map((assignment) => assignment.bracketMatchId)),
    ).toHaveProperty('size', 2);
    expect(
      new Set(assignments.flatMap((assignment) => assignment.playerIds)),
    ).toHaveProperty('size', 4);
    await expect(repository.findPendingTurns()).resolves.toHaveLength(2);
  });
});

class InMemoryRedisRoomState {
  private readonly rooms = new Map<string, PokeLoungeRedisRoomRecord>();
  compareAndSetCalls = 0;

  createRoomState(input: {
    roomCode: string;
    document: string;
  }): Promise<CreatePokeLoungeRedisRoomResult> {
    if (this.rooms.has(input.roomCode)) {
      return Promise.resolve({ outcome: 'room-code-collision' });
    }
    this.rooms.set(input.roomCode, { version: 0, document: input.document });
    return Promise.resolve({ outcome: 'created' });
  }

  getRoomState(roomCode: string): Promise<PokeLoungeRedisRoomRecord | null> {
    return Promise.resolve(this.rooms.get(roomCode) ?? null);
  }

  listRoomStateCodes(): Promise<string[]> {
    return Promise.resolve([...this.rooms.keys()]);
  }

  seedOpenTurn(
    roomCode: string,
    input: { matchId: string; turn: number; startedAtMs: number },
  ): void {
    const current = this.rooms.get(roomCode);
    if (!current) {
      throw new Error('Room fixture is missing');
    }
    const document = JSON.parse(current.document) as {
      id: string;
      room: PokeLoungeRoomSnapshot;
      matches: Record<string, Record<string, unknown>>;
      actions: Record<string, Record<string, unknown>>;
    };
    const state = createTestInitialBattleState(['player-1', 'player-2']);
    state.turn = input.turn;
    const stateHash = hashCanonicalState(state);
    document.room.status = 'tournament';
    document.room.round.phase = 'tournament';
    document.room.tournament.activeMatchId = 'bracket-match-1';
    document.room.tournament.activeMatchAuthority = 'server';
    document.matches[input.matchId] = {
      roomId: document.id,
      roomCode,
      matchId: input.matchId,
      bracketMatchId: 'bracket-match-1',
      kind: 'tournament-unranked',
      assignmentRevision: 1,
      playerAccounts: [
        { playerId: 'player-1', accountId: 'account-1' },
        { playerId: 'player-2', accountId: 'account-2' },
      ],
      rulesetVersion: COMPETITIVE_RULESET_VERSION,
      rulesetHash: COMPETITIVE_RULESET_HASH,
      serverSeed: 'a'.repeat(64),
      initialState: structuredClone(state),
      initialStateHash: stateHash,
      currentState: state,
      currentStateHash: stateHash,
      status: 'active',
      currentTurn: input.turn,
      turnStartedAtMs: input.startedAtMs,
      terminalEventId: null,
      terminalRoomRevision: null,
      terminalResult: null,
      completedAt: null,
    };
    current.document = JSON.stringify(document);
  }

  compareAndSetRoomState(input: {
    roomCode: string;
    expectedVersion: number;
    document: string;
  }): Promise<'committed' | 'conflict' | 'missing'> {
    const current = this.rooms.get(input.roomCode);
    if (!current) {
      return Promise.resolve('missing');
    }
    if (current.version !== input.expectedVersion) {
      return Promise.resolve('conflict');
    }
    this.compareAndSetCalls += 1;
    this.rooms.set(input.roomCode, {
      version: current.version + 1,
      document: input.document,
    });
    return Promise.resolve('committed');
  }

  purgeExpiredRoomStates(): Promise<number> {
    return Promise.resolve(0);
  }
}

function roomSnapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
        sessionId: 'session-1',
        playerId: 'player-1',
        displayName: 'Player 1',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
    ],
    partySnapshots: {},
    round: {
      index: 0,
      phase: 'waiting',
      durationMs: 300_000,
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
    revision: 0,
    expiresAtMs: 0,
  };
}

function sixPlayerRoundSnapshot(): PokeLoungeRoomSnapshot {
  const playerIds = Array.from(
    { length: 6 },
    (_, index) => `player-${index + 1}`,
  );
  return {
    ...roomSnapshot(),
    status: 'round-started',
    participants: playerIds.map((playerId, index) => ({
      sessionId: `session-${index + 1}`,
      playerId,
      displayName: `Player ${index + 1}`,
      role: 'participant',
      ready: true,
      connected: true,
      joinedAtMs: index,
    })),
    partySnapshots: createTestPartySnapshots(playerIds),
    round: {
      index: 1,
      phase: 'round-started',
      durationMs: 100,
      startedAtMs: 0,
      endsAtMs: 100,
    },
  };
}

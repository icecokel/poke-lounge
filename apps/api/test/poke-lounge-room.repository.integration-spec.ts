import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { EnforcePokeLoungeActiveRoomLease1794787200000 } from '../src/migrations/1794787200000-enforce-poke-lounge-active-room-lease';
import { createCompetitiveAssignment } from '../src/poke-lounge/competitive/competitive-match.service';
import { PostgresCompetitiveMatchRepository } from '../src/poke-lounge/competitive/postgres-competitive-match.repository';
import { PokeLoungeCompetitiveSeat } from '../src/poke-lounge/entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeRoomCommand } from '../src/poke-lounge/entities/poke-lounge-room-command.entity';
import { PokeLoungeRoom } from '../src/poke-lounge/entities/poke-lounge-room.entity';
import { PostgresPokeLoungeRoomRepository } from '../src/poke-lounge/postgres-poke-lounge-room.repository';
import type { PokeLoungeRoomSnapshot } from '../src/poke-lounge/poke-lounge-room.repository';
import { getPokeLoungeRoomExpiresAtMs } from '../src/poke-lounge/poke-lounge-room-policy';
import {
  createPokeLoungeTestDataSource,
  truncatePokeLoungeRoomStorage,
} from './support/poke-lounge-test-database';
import { createTestPartySnapshots } from './support/competitive-party.fixture';

describe('PostgresPokeLoungeRoomRepository', () => {
  let dataSource: DataSource;
  let repository: PostgresPokeLoungeRoomRepository;

  beforeAll(async () => {
    dataSource = createPokeLoungeTestDataSource();
    await dataSource.initialize();
    repository = new PostgresPokeLoungeRoomRepository(dataSource);
  });

  beforeEach(async () => {
    await truncatePokeLoungeRoomStorage(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('round-trips the migrated entities and reloads through a new data source', async () => {
    const room = createSnapshot({ roomCode: 'RELOAD' });

    await expect(createRoom(repository, room)).resolves.toMatchObject({
      outcome: 'committed',
      snapshot: { roomCode: 'RELOAD', revision: 0 },
    });

    await dataSource.destroy();
    dataSource = createPokeLoungeTestDataSource();
    await dataSource.initialize();
    repository = new PostgresPokeLoungeRoomRepository(dataSource);

    await expect(
      repository.getAndAdvance('reload', room.updatedAtMs),
    ).resolves.toMatchObject({
      committedChange: false,
      snapshot: { roomCode: 'RELOAD', revision: 0 },
    });
  });

  it('replays creation globally by actor and key and rejects a changed request', async () => {
    const idempotencyKey = randomUUID();
    const createInput = {
      room: createSnapshot({ roomCode: 'FIRST1' }),
      actorPlayerId: 'creator-a',
      idempotencyKey,
      requestHash: 'a'.repeat(64),
      nowMs: 1_000,
    };

    await expect(repository.create(createInput)).resolves.toMatchObject({
      outcome: 'committed',
      committedChange: true,
      snapshot: { roomCode: 'FIRST1', revision: 0 },
    });
    await expect(
      repository.create({
        ...createInput,
        room: createSnapshot({ roomCode: 'OTHER1' }),
      }),
    ).resolves.toMatchObject({
      outcome: 'replayed',
      committedChange: false,
      snapshot: { roomCode: 'FIRST1', revision: 0 },
    });
    await expect(
      repository.create({
        ...createInput,
        room: createSnapshot({ roomCode: 'OTHER1' }),
        requestHash: 'b'.repeat(64),
      }),
    ).resolves.toMatchObject({
      outcome: 'idempotency-conflict',
      committedChange: false,
      snapshot: { roomCode: 'FIRST1', revision: 0 },
    });
  });

  it('purges every room status past its lease while preserving the strict boundary', async () => {
    const nowMs = 5_000_000;
    const rooms = [
      createSnapshot({ roomCode: 'WAIT01', status: 'waiting' }),
      createSnapshot({ roomCode: 'DONE01', status: 'completed' }),
      createSnapshot({ roomCode: 'CLOSE1', status: 'closed' }),
      createSnapshot({
        roomCode: 'ACTIVE',
        status: 'round-started',
        round: {
          index: 1,
          phase: 'round-started',
          durationMs: 10_000,
          startedAtMs: nowMs,
          endsAtMs: nowMs + 10_000,
        },
      }),
      createSnapshot({ roomCode: 'TOUR01', status: 'tournament' }),
    ].map((room) => ({
      ...room,
      expiresAtMs: room.status === 'round-started' ? nowMs : nowMs - 1,
    }));

    await dataSource.getRepository(PokeLoungeRoom).insert(
      rooms.map((snapshot) => ({
        roomCode: snapshot.roomCode,
        state: toStoredState(snapshot),
        revision: snapshot.revision,
        expiresAt: new Date(snapshot.expiresAtMs),
      })),
    );

    await expect(repository.purgeExpired(nowMs)).resolves.toBe(4);
    await expect(
      repository.getAndAdvance('ACTIVE', nowMs),
    ).resolves.toMatchObject({ snapshot: { roomCode: 'ACTIVE' } });
    await expect(repository.getAndAdvance('TOUR01', nowMs)).resolves.toEqual({
      snapshot: null,
      committedChange: false,
    });
    await expect(repository.getAndAdvance('WAIT01', nowMs)).resolves.toEqual({
      snapshot: null,
      committedChange: false,
    });
  });

  it('recomputes client-tainted legacy expiries from the database update timestamp', async () => {
    const statuses = [
      'waiting',
      'round-started',
      'tournament',
      'completed',
      'closed',
    ] as const;
    const roomRepository = dataSource.getRepository(PokeLoungeRoom);

    for (const [index, status] of statuses.entries()) {
      const snapshot = createSnapshot({
        roomCode: `LEASE${index}`,
        status,
      });
      await roomRepository.save({
        roomCode: snapshot.roomCode,
        state: toStoredState(snapshot),
        revision: 0,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      });
    }
    await dataSource.query(`
      UPDATE poke_lounge_room
      SET updated_at = TIMESTAMPTZ '2026-07-19 00:00:00+00',
          expires_at = TIMESTAMPTZ '2099-01-01 00:00:00+00'
    `);

    const queryRunner = dataSource.createQueryRunner();
    try {
      await new EnforcePokeLoungeActiveRoomLease1794787200000().up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    await expect(
      dataSource.query(`
        SELECT state ->> 'status' AS status,
               EXTRACT(EPOCH FROM (expires_at - updated_at))::integer AS seconds
        FROM poke_lounge_room
        ORDER BY status
      `),
    ).resolves.toEqual([
      { status: 'closed', seconds: 600 },
      { status: 'completed', seconds: 600 },
      { status: 'round-started', seconds: 7200 },
      { status: 'tournament', seconds: 7200 },
      { status: 'waiting', seconds: 1800 },
    ]);
  });

  it('deletes command receipts through the room foreign key when purging', async () => {
    const room = createSnapshot({ roomCode: 'PURGE1' });
    await createRoom(repository, room);

    await expect(repository.purgeExpired(room.expiresAtMs + 1)).resolves.toBe(
      1,
    );
    await expect(
      dataSource.getRepository(PokeLoungeRoomCommand).count(),
    ).resolves.toBe(0);
  });

  it('increments once, replays the exact receipt, and rejects a changed payload', async () => {
    await createRoom(repository, createSnapshot());
    const idempotencyKey = randomUUID();
    const first = await repository.mutate({
      roomCode: 'ROOM01',
      actorPlayerId: 'player-a',
      idempotencyKey,
      requestHash: 'a'.repeat(64),
      expectedRevision: 0,
      nowMs: 2_000,
      apply: (room) => ({ ...room, updatedAtMs: 2_000 }),
    });
    await repository.mutate({
      roomCode: 'ROOM01',
      actorPlayerId: 'player-b',
      idempotencyKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      expectedRevision: 1,
      nowMs: 3_000,
      apply: (room) => ({ ...room, updatedAtMs: 3_000 }),
    });

    expect(first).toMatchObject({
      outcome: 'committed',
      committedChange: true,
      snapshot: { revision: 1, updatedAtMs: 2_000 },
    });
    await expect(
      repository.mutate({
        roomCode: 'room01',
        actorPlayerId: 'player-a',
        idempotencyKey,
        requestHash: 'a'.repeat(64),
        expectedRevision: 0,
        nowMs: 4_000,
        apply: (room) => ({ ...room, updatedAtMs: 4_000 }),
      }),
    ).resolves.toMatchObject({
      outcome: 'replayed',
      committedChange: false,
      snapshot: { revision: 1, updatedAtMs: 2_000 },
    });
    await expect(
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId: 'player-a',
        idempotencyKey,
        requestHash: 'c'.repeat(64),
        expectedRevision: 2,
        nowMs: 4_000,
        apply: (room) => room,
      }),
    ).resolves.toMatchObject({
      outcome: 'idempotency-conflict',
      committedChange: false,
      snapshot: { revision: 2, updatedAtMs: 3_000 },
    });
  });

  it('returns and replays the same competitive projection created by a room transition', async () => {
    const nowMs = Date.now();
    const participants = [
      createParticipant('player-a', nowMs),
      createParticipant('player-b', nowMs + 1),
    ];
    const room = createSnapshot({
      roomCode: 'PROJ01',
      status: 'round-started',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      participants,
      partySnapshots: createTestPartySnapshots(
        participants.map((participant) => participant.playerId),
      ),
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: nowMs - 1_000,
        endsAtMs: nowMs,
      },
    });
    await createRoom(repository, room);
    const storedRoom = await dataSource
      .getRepository(PokeLoungeRoom)
      .findOneByOrFail({ roomCode: room.roomCode });
    await dataSource.getRepository(PokeLoungeCompetitiveSeat).insert(
      participants.map((participant) => ({
        roomId: storedRoom.id,
        sessionId: participant.sessionId,
        playerId: participant.playerId,
        accountId: `account-${participant.playerId}`,
      })),
    );

    const activated = await repository.getAndAdvance(room.roomCode, nowMs);
    expect(activated).toMatchObject({
      committedChange: true,
      snapshot: {
        revision: 1,
        status: 'tournament',
        tournament: { activeMatchAuthority: 'server' },
        competitive: { status: 'pending', currentTurn: 0 },
      },
    });
    const idempotencyKey = randomUUID();
    const input = {
      roomCode: room.roomCode,
      actorPlayerId: 'player-a',
      idempotencyKey,
      requestHash: 'd'.repeat(64),
      expectedRevision: 1,
      nowMs: nowMs + 1,
      apply: (snapshot: PokeLoungeRoomSnapshot) => ({
        ...snapshot,
        updatedAtMs: nowMs + 1,
      }),
    };
    const committed = await repository.mutate(input);

    expect(committed).toMatchObject({
      outcome: 'committed',
      snapshot: {
        revision: 2,
        competitive: {
          matchId: activated.snapshot?.competitive?.matchId,
          status: 'pending',
          currentTurn: 0,
        },
      },
    });
    await expect(repository.mutate(input)).resolves.toEqual({
      ...committed,
      outcome: 'replayed',
      committedChange: false,
    });
  });

  it('deletes an expired pending participant seat before its player id is rebound', async () => {
    const nowMs = Date.now();
    const pendingUntilMs = nowMs + 15_000;
    const room = createSnapshot({
      roomCode: 'SEAT01',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      participants: [
        createParticipant('player-a', nowMs),
        {
          ...createParticipant('player-b', nowMs + 1),
          sessionId: 'session-b',
          presencePendingUntilMs: pendingUntilMs,
        },
      ],
    });
    await createRoom(repository, room);
    const storedRoom = await dataSource
      .getRepository(PokeLoungeRoom)
      .findOneByOrFail({ roomCode: room.roomCode });
    await dataSource.getRepository(PokeLoungeCompetitiveSeat).insert({
      roomId: storedRoom.id,
      sessionId: 'session-b',
      playerId: 'player-b',
      accountId: 'account-b',
    });

    await expect(
      repository.getAndAdvance(room.roomCode, pendingUntilMs),
    ).resolves.toMatchObject({
      committedChange: true,
      snapshot: {
        revision: 1,
        participants: [{ playerId: 'player-a' }],
      },
    });
    await expect(
      dataSource.getRepository(PokeLoungeCompetitiveSeat).countBy({
        roomId: storedRoom.id,
        playerId: 'player-b',
      }),
    ).resolves.toBe(0);

    await repository.mutate({
      roomCode: room.roomCode,
      actorPlayerId: 'player-b',
      idempotencyKey: randomUUID(),
      requestHash: 'e'.repeat(64),
      expectedRevision: 1,
      nowMs: pendingUntilMs + 1,
      apply: (snapshot) => ({
        ...snapshot,
        updatedAtMs: pendingUntilMs + 1,
        participants: [
          ...snapshot.participants,
          {
            ...createParticipant('player-b', pendingUntilMs + 1),
            sessionId: 'session-c',
            ready: false,
          },
        ],
      }),
    });
    const competitiveRepository = new PostgresCompetitiveMatchRepository(
      dataSource,
    );
    await expect(
      competitiveRepository.bindSeatAndAssign({
        roomCode: room.roomCode,
        sessionId: 'session-c',
        accountId: 'account-c',
        createAssignment: createCompetitiveAssignment,
      }),
    ).resolves.toMatchObject({ outcome: 'bound-casual' });
    await expect(
      dataSource.getRepository(PokeLoungeCompetitiveSeat).findOneBy({
        roomId: storedRoom.id,
        playerId: 'player-b',
      }),
    ).resolves.toMatchObject({
      sessionId: 'session-c',
      accountId: 'account-c',
    });
  });

  it('deletes a waiting participant seat in the same explicit leave mutation', async () => {
    const nowMs = Date.now();
    const room = createSnapshot({
      roomCode: 'SEAT02',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      participants: [
        createParticipant('player-a', nowMs),
        createParticipant('player-b', nowMs + 1),
      ],
    });
    await createRoom(repository, room);
    const storedRoom = await dataSource
      .getRepository(PokeLoungeRoom)
      .findOneByOrFail({ roomCode: room.roomCode });
    await dataSource.getRepository(PokeLoungeCompetitiveSeat).insert({
      roomId: storedRoom.id,
      sessionId: 'session-player-b',
      playerId: 'player-b',
      accountId: 'account-b',
    });

    await expect(
      repository.mutate({
        operation: 'leave',
        roomCode: room.roomCode,
        actorPlayerId: 'player-b',
        idempotencyKey: randomUUID(),
        requestHash: 'f'.repeat(64),
        expectedRevision: 0,
        nowMs: nowMs + 2,
        apply: (snapshot) => ({
          ...snapshot,
          updatedAtMs: nowMs + 2,
          participants: snapshot.participants.filter(
            (participant) => participant.playerId !== 'player-b',
          ),
        }),
      }),
    ).resolves.toMatchObject({ outcome: 'committed' });
    await expect(
      dataSource.getRepository(PokeLoungeCompetitiveSeat).countBy({
        roomId: storedRoom.id,
        playerId: 'player-b',
      }),
    ).resolves.toBe(0);
  });

  it('serializes concurrent writers at one expected revision', async () => {
    await createRoom(repository, createSnapshot());

    const results = await Promise.all([
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId: 'player-a',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        expectedRevision: 0,
        nowMs: 2_000,
        apply: (room) => ({ ...room, updatedAtMs: 2_000 }),
      }),
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId: 'player-b',
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
        expectedRevision: 0,
        nowMs: 2_001,
        apply: (room) => ({ ...room, updatedAtMs: 2_001 }),
      }),
    ]);

    expect(results.map((result) => result?.outcome).sort()).toEqual([
      'committed',
      'revision-conflict',
    ]);
    expect(results.map((result) => result?.snapshot.revision)).toEqual([1, 1]);
  });

  it('serializes one actor and idempotency key across different rooms', async () => {
    await createRoom(repository, createSnapshot({ roomCode: 'ROOM01' }));
    await createRoom(repository, createSnapshot({ roomCode: 'ROOM02' }));
    const idempotencyKey = randomUUID();
    const actorPlayerId = 'shared-player';

    const results = await Promise.all([
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId,
        idempotencyKey,
        requestHash: 'a'.repeat(64),
        expectedRevision: 0,
        nowMs: 2_000,
        apply: (room) => ({ ...room, updatedAtMs: 2_000 }),
      }),
      repository.mutate({
        roomCode: 'ROOM02',
        actorPlayerId,
        idempotencyKey,
        requestHash: 'b'.repeat(64),
        expectedRevision: 0,
        nowMs: 2_001,
        apply: (room) => ({ ...room, updatedAtMs: 2_001 }),
      }),
    ]);

    expect(results.map((result) => result?.outcome).sort()).toEqual([
      'committed',
      'idempotency-conflict',
    ]);
    expect(
      await dataSource.getRepository(PokeLoungeRoomCommand).countBy({
        actorPlayerId,
        idempotencyKey,
      }),
    ).toBe(1);
  });

  it('commits one automatic clock advancement across concurrent reads', async () => {
    const room = createSnapshot({
      status: 'round-started',
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 1_000,
        endsAtMs: 2_000,
      },
      participants: [
        createParticipant('player-a', 1_000),
        createParticipant('player-b', 1_001),
      ],
      partySnapshots: createTestPartySnapshots(['player-a', 'player-b']),
    });
    await createRoom(repository, room);

    const results = await Promise.all([
      repository.getAndAdvance('ROOM01', 2_000),
      repository.getAndAdvance('ROOM01', 2_000),
    ]);

    expect(results.map((result) => result.committedChange).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0].snapshot).toMatchObject({
      status: 'tournament',
      revision: 1,
    });
    expect(results[1].snapshot).toMatchObject({
      status: 'tournament',
      revision: 1,
    });
  });

  it('lets a due automatic transition win before a client mutation', async () => {
    const room = createSnapshot({
      status: 'round-started',
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 1_000,
        endsAtMs: 2_000,
      },
      participants: [
        createParticipant('player-a', 1_000),
        createParticipant('player-b', 1_001),
      ],
      partySnapshots: createTestPartySnapshots(['player-a', 'player-b']),
    });
    await createRoom(repository, room);
    const idempotencyKey = randomUUID();

    await expect(
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId: 'player-a',
        idempotencyKey,
        requestHash: 'a'.repeat(64),
        expectedRevision: 0,
        nowMs: 2_000,
        apply: (snapshot) => ({ ...snapshot, updatedAtMs: 2_000 }),
      }),
    ).resolves.toMatchObject({
      outcome: 'revision-conflict',
      committedChange: true,
      snapshot: { status: 'tournament', revision: 1 },
    });
    await expect(
      repository.mutate({
        roomCode: 'ROOM01',
        actorPlayerId: 'player-a',
        idempotencyKey,
        requestHash: 'a'.repeat(64),
        expectedRevision: 1,
        nowMs: 2_000,
        apply: (snapshot) => ({ ...snapshot, updatedAtMs: 2_000 }),
      }),
    ).resolves.toMatchObject({
      outcome: 'committed',
      snapshot: { revision: 2 },
    });
  });

  it('enforces capacity atomically and reclaims an expired active lease', async () => {
    const base = createSnapshot();
    const roomRows = Array.from({ length: 199 }, (_, index) => {
      const roomCode = `C${String(index).padStart(5, '0')}`;
      const snapshot = createSnapshot({
        roomCode,
        ...(index === 0 ? { status: 'tournament' as const } : {}),
      });

      return {
        roomCode,
        state: toStoredState(snapshot),
        revision: 0,
        expiresAt: new Date(snapshot.expiresAtMs),
      };
    });
    await dataSource.getRepository(PokeLoungeRoom).insert(roomRows);

    const atCapacity = await Promise.all([
      createRoom(repository, { ...base, roomCode: 'LAST01' }),
      createRoom(repository, { ...base, roomCode: 'LAST02' }),
    ]);

    expect(atCapacity.map((result) => result.outcome).sort()).toEqual([
      'capacity-reached',
      'committed',
    ]);

    await dataSource
      .getRepository(PokeLoungeRoom)
      .update({ roomCode: 'C00000' }, { expiresAt: new Date(999) });
    await expect(
      createRoom(repository, {
        ...base,
        roomCode: 'RECLAM',
        updatedAtMs: 1_000,
      }),
    ).resolves.toMatchObject({ outcome: 'committed' });
  });

  it('reclaims an HTTP-only pending room from capacity without reading it', async () => {
    const pendingUntilMs = 16_000;
    const roomRows = Array.from({ length: 199 }, (_, index) => {
      const roomCode = `P${String(index).padStart(5, '0')}`;
      const snapshot = createSnapshot({ roomCode });

      return {
        roomCode,
        state: toStoredState(snapshot),
        revision: 0,
        expiresAt: new Date(snapshot.expiresAtMs),
      };
    });
    await dataSource.getRepository(PokeLoungeRoom).insert(roomRows);

    const pendingRoom = createSnapshot({
      roomCode: 'PENDNG',
      participants: [
        {
          ...createParticipant('pending-player', 1_000),
          presencePendingUntilMs: pendingUntilMs,
        },
      ],
    });
    await expect(createRoom(repository, pendingRoom)).resolves.toMatchObject({
      outcome: 'committed',
      snapshot: { expiresAtMs: pendingUntilMs },
    });

    await expect(
      createRoom(
        repository,
        createSnapshot({ roomCode: 'BLOCKD', updatedAtMs: pendingUntilMs }),
      ),
    ).resolves.toMatchObject({ outcome: 'capacity-reached' });
    await expect(
      createRoom(
        repository,
        createSnapshot({
          roomCode: 'REUSE1',
          updatedAtMs: pendingUntilMs + 1,
        }),
      ),
    ).resolves.toMatchObject({ outcome: 'committed' });
    await expect(
      dataSource
        .getRepository(PokeLoungeRoom)
        .findOneBy({ roomCode: 'PENDNG' }),
    ).resolves.toBeNull();
  });

  it('does not let competitive seat binding extend a pending-only room lease', async () => {
    const nowMs = Date.now();
    const pendingUntilMs = nowMs + 15_000;
    const room = createSnapshot({
      roomCode: 'PSEAT1',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      participants: [
        {
          ...createParticipant('pending-player', nowMs),
          sessionId: 'pending-session',
          presencePendingUntilMs: pendingUntilMs,
        },
      ],
    });
    await createRoom(repository, room);
    const competitiveRepository = new PostgresCompetitiveMatchRepository(
      dataSource,
    );

    await expect(
      competitiveRepository.bindSeatAndAssign({
        roomCode: room.roomCode,
        sessionId: 'pending-session',
        accountId: 'pending-account',
        createAssignment: createCompetitiveAssignment,
      }),
    ).resolves.toMatchObject({ outcome: 'bound-casual' });
    await expect(
      dataSource.getRepository(PokeLoungeRoom).findOneByOrFail({
        roomCode: room.roomCode,
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date(pendingUntilMs),
    });
    await expect(repository.purgeExpired(pendingUntilMs + 1)).resolves.toBe(1);
  });

  it('surfaces a room-code collision so a bounded caller retry can succeed', async () => {
    await createRoom(repository, createSnapshot({ roomCode: 'SAME01' }));
    const candidates = ['SAME01', 'NEXT01'];
    const outcomes = [];

    for (const roomCode of candidates) {
      const result = await createRoom(repository, createSnapshot({ roomCode }));
      outcomes.push(result.outcome);
      if (result.outcome !== 'room-code-collision') {
        break;
      }
    }

    expect(outcomes).toEqual(['room-code-collision', 'committed']);
  });
});

function createRoom(
  repository: PostgresPokeLoungeRoomRepository,
  room: PokeLoungeRoomSnapshot,
) {
  return repository.create({
    room,
    actorPlayerId: `creator-${room.roomCode}`,
    idempotencyKey: randomUUID(),
    requestHash: 'f'.repeat(64),
    nowMs: room.updatedAtMs,
  });
}

function createSnapshot(
  overrides: Partial<PokeLoungeRoomSnapshot> = {},
): PokeLoungeRoomSnapshot {
  const room: PokeLoungeRoomSnapshot = {
    roomCode: 'ROOM01',
    status: 'waiting',
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    participants: [],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting',
      durationMs: 1_000,
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
    ...overrides,
  };

  return { ...room, expiresAtMs: getPokeLoungeRoomExpiresAtMs(room) };
}

function createParticipant(playerId: string, joinedAtMs: number) {
  return {
    sessionId: `session-${playerId}`,
    playerId,
    displayName: playerId,
    role: 'participant' as const,
    ready: true,
    connected: true,
    joinedAtMs,
  };
}

function toStoredState(snapshot: PokeLoungeRoomSnapshot) {
  const state = structuredClone(snapshot);

  return {
    roomCode: state.roomCode,
    status: state.status,
    createdAtMs: state.createdAtMs,
    updatedAtMs: state.updatedAtMs,
    participants: state.participants,
    partySnapshots: state.partySnapshots,
    round: state.round,
    tournament: state.tournament,
    finalStandings: state.finalStandings,
  };
}

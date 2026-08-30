import { ConfigService } from '@nestjs/config';
import { PokeLoungeLiveStateService } from './poke-lounge-live-state.service';

describe('PokeLoungeLiveStateService', () => {
  it('requires Redis instead of silently falling back to process memory', async () => {
    const service = new PokeLoungeLiveStateService(
      new ConfigService(),
      jest.fn() as never,
    );

    await expect(service.connect()).rejects.toThrow(
      'REDIS_URL is required for Poke Lounge multiplayer',
    );
  });

  it('stores a player with an atomic world cursor and restores the snapshot', async () => {
    const redis = redisFixture();
    const service = createService(redis);
    await service.connect();
    redis.command.eval.mockResolvedValueOnce(['world-1', 3]);
    const player = {
      playerId: 'player-1',
      displayName: 'Player 1',
      map: 'new-bark-town',
      x: 672,
      y: 448,
      facing: 'left' as const,
      updatedAtMs: 1_000,
    };

    await expect(
      service.upsertPlayer({
        roomCode: ' room01 ',
        expiresAtMs: 253_402_300_799_999,
        player,
      }),
    ).resolves.toEqual({
      roomCode: 'ROOM01',
      worldEpoch: 'world-1',
      worldSeq: 3,
      ...player,
    });
    expect(redis.command.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['poke-lounge:room:ROOM01:world'],
      arguments: [
        expect.any(String),
        'player-1',
        JSON.stringify(player),
        '253402300800',
      ],
    });

    redis.command.eval.mockResolvedValueOnce('world-1');
    redis.command.hGetAll.mockResolvedValueOnce({
      _epoch: 'world-1',
      _seq: '3',
      'player-1': JSON.stringify(player),
    });
    await expect(
      service.getSnapshot('ROOM01', 253_402_300_799_999),
    ).resolves.toEqual({
      roomCode: 'ROOM01',
      worldEpoch: 'world-1',
      worldSeq: 3,
      players: [player],
    });

    await service.onModuleDestroy();
    expect(redis.command.close).toHaveBeenCalledTimes(1);
    expect(redis.subscriber.close).toHaveBeenCalledTimes(1);
  });

  it('increments the shared cursor when a disconnected player is removed', async () => {
    const redis = redisFixture();
    const service = createService(redis);
    await service.connect();

    await service.removePlayer('ROOM01', 'player-1');

    expect(redis.command.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['poke-lounge:room:ROOM01:world'],
      arguments: ['player-1'],
    });

    redis.command.hmGet.mockResolvedValueOnce(['world-1', 'broken']);
    await expect(service.getCursor('ROOM01')).rejects.toThrow(
      'Poke Lounge world sequence is malformed',
    );
    await service.onModuleDestroy();
  });

  it('extends only an existing room world expiry after a durable room update', async () => {
    const redis = redisFixture();
    const service = createService(redis);
    await service.connect();

    await service.extendRoomExpiry('room01', 253_402_300_799_999);

    expect(redis.command.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['poke-lounge:room:ROOM01:world'],
      arguments: ['253402300800'],
    });
    await service.onModuleDestroy();
  });

  it('maps room document CAS and player progress to Redis primitives', async () => {
    const redis = redisFixture();
    const service = createService(redis);
    await service.connect();
    redis.command.eval.mockResolvedValueOnce([0, '']);

    await expect(
      service.createRoomState({
        roomCode: ' room01 ',
        document: '{"roomCode":"ROOM01"}',
        expiresAtMs: 10_000,
        nowMs: 1_000,
        capacity: 200,
        actorPlayerId: 'player-1',
        idempotencyKey: 'command-1',
        requestHash: 'hash-1',
      }),
    ).resolves.toEqual({ outcome: 'created' });
    expect(redis.command.eval).toHaveBeenLastCalledWith(expect.any(String), {
      keys: [
        'poke-lounge:room:ROOM01:state',
        'poke-lounge:rooms',
        expect.stringMatching(/^poke-lounge:create-command:/),
      ],
      arguments: [
        '1000',
        '200',
        '{"roomCode":"ROOM01"}',
        '10000',
        JSON.stringify({ requestHash: 'hash-1', roomCode: 'ROOM01' }),
        'ROOM01',
      ],
    });

    redis.command.hmGet.mockResolvedValueOnce(['2', '{"roomCode":"ROOM01"}']);
    await expect(service.getRoomState('room01')).resolves.toEqual({
      version: 2,
      document: '{"roomCode":"ROOM01"}',
    });
    redis.command.zRange.mockResolvedValueOnce(['ROOM01', 'ROOM02']);
    await expect(service.listRoomStateCodes()).resolves.toEqual([
      'ROOM01',
      'ROOM02',
    ]);
    expect(redis.command.zRange).toHaveBeenCalledWith(
      'poke-lounge:rooms',
      0,
      -1,
    );

    redis.command.eval.mockResolvedValueOnce(1);
    redis.command.hGetAll.mockResolvedValueOnce({
      revision: '1',
      state: '{"map":"new-bark-town"}',
      clientUpdatedAt: '',
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:01.000Z',
    });
    await expect(
      service.savePlayerState({
        userId: 'user-1',
        state: { map: 'new-bark-town' },
        expectedRevision: 0,
        clientUpdatedAt: null,
        nowMs: 1_000,
        expiresAtMs: 7_201_000,
      }),
    ).resolves.toBe(1);
    await expect(service.getPlayerState('user-1')).resolves.toEqual({
      revision: 1,
      state: { map: 'new-bark-town' },
      clientUpdatedAt: null,
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:01.000Z',
    });
    await service.onModuleDestroy();
  });

  it('publishes and subscribes to minimal room commit notifications', async () => {
    const redis = redisFixture();
    const service = createService(redis);
    await service.connect();
    let handleMessage: ((message: string) => void) | undefined;
    redis.commitSubscriber.subscribe.mockImplementationOnce(
      (_channel: string, listener: (message: string) => void) => {
        handleMessage = listener;
        return Promise.resolve(1);
      },
    );
    const listener = jest.fn();

    const unsubscribe = await service.subscribeRoomCommits(listener);
    await service.publishRoomCommit({ roomCode: ' room01 ', revision: 4 });
    handleMessage?.(JSON.stringify({ roomCode: 'ROOM01', revision: 4 }));

    expect(redis.command.publish).toHaveBeenCalledWith(
      'poke-lounge:room-committed',
      JSON.stringify({ roomCode: 'ROOM01', revision: 4 }),
    );
    expect(redis.commitSubscriber.subscribe).toHaveBeenCalledWith(
      'poke-lounge:room-committed',
      expect.any(Function),
    );
    expect(listener).toHaveBeenCalledWith({
      roomCode: 'ROOM01',
      revision: 4,
    });

    await unsubscribe();
    expect(redis.commitSubscriber.unsubscribe).toHaveBeenCalledWith(
      'poke-lounge:room-committed',
      expect.any(Function),
    );
    await service.onModuleDestroy();
  });
});

function createService(redis: ReturnType<typeof redisFixture>) {
  return new PokeLoungeLiveStateService(
    new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    jest.fn(() => redis.command) as never,
  );
}

function redisFixture() {
  const redisClient = () => ({
    isReady: false,
    isOpen: false,
    connect: jest.fn(function (this: { isReady: boolean; isOpen: boolean }) {
      this.isReady = true;
      this.isOpen = true;
      return Promise.resolve();
    }),
    close: jest.fn(function (this: { isReady: boolean; isOpen: boolean }) {
      this.isReady = false;
      this.isOpen = false;
      return Promise.resolve();
    }),
    destroy: jest.fn(),
    on: jest.fn(),
  });
  const subscriber = redisClient();
  const commitSubscriber = {
    ...redisClient(),
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(0),
  };
  const command = {
    ...redisClient(),
    del: jest.fn().mockResolvedValue(1),
    duplicate: jest
      .fn()
      .mockReturnValueOnce(subscriber)
      .mockReturnValueOnce(commitSubscriber),
    eval: jest.fn().mockResolvedValue(1),
    hGetAll: jest.fn().mockResolvedValue({}),
    hmGet: jest.fn().mockResolvedValue(['world-1', '0']),
    publish: jest.fn().mockResolvedValue(1),
    zRange: jest.fn().mockResolvedValue([]),
  };

  return { command, subscriber, commitSubscriber };
}

import { BadRequestException } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import type { PokeLoungeLiveStateService } from './poke-lounge-live-state.service';
import { PokeLoungeRoomEventsService } from './poke-lounge-room-events.service';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';
import { PokeLoungeGateway } from './poke-lounge.gateway';
import type { PokeLoungeRoomService } from './poke-lounge-room.service';

describe('PokeLoungeGateway', () => {
  let roomService: jest.Mocked<
    Pick<
      PokeLoungeRoomService,
      | 'authorizeSubscription'
      | 'acknowledgeParticipantPresence'
      | 'expireParticipantPresence'
      | 'getRoom'
      | 'markParticipantDisconnectPending'
    >
  >;
  let events: PokeLoungeRoomEventsService;
  let liveState: jest.Mocked<
    Pick<
      PokeLoungeLiveStateService,
      | 'deleteRoom'
      | 'extendRoomExpiry'
      | 'getCursor'
      | 'getSnapshot'
      | 'listRoomStateCodes'
      | 'removePlayer'
      | 'upsertPlayer'
    >
  >;
  let gateway: PokeLoungeGateway;
  let namespaceEmit: jest.Mock;
  let namespaceFetchSockets: jest.Mock;
  let namespaceLocalTo: jest.Mock;
  let namespaceTo: jest.Mock;
  let serverSideEmit: jest.Mock;
  let serverListeners: Map<string, (input: unknown) => void>;

  beforeEach(() => {
    roomService = {
      authorizeSubscription: jest.fn().mockResolvedValue(publicRoom()),
      acknowledgeParticipantPresence: jest.fn().mockResolvedValue(publicRoom()),
      expireParticipantPresence: jest.fn().mockResolvedValue(undefined),
      getRoom: jest.fn().mockResolvedValue(roomSnapshot()),
      markParticipantDisconnectPending: jest.fn().mockResolvedValue(undefined),
    };
    events = new PokeLoungeRoomEventsService({} as never, {} as never);
    liveState = {
      deleteRoom: jest.fn().mockResolvedValue(undefined),
      extendRoomExpiry: jest.fn().mockResolvedValue(undefined),
      getCursor: jest.fn().mockResolvedValue({
        roomCode: 'ROOM01',
        worldEpoch: 'world-1',
        worldSeq: 0,
      }),
      getSnapshot: jest.fn().mockResolvedValue(worldSnapshot()),
      listRoomStateCodes: jest.fn().mockResolvedValue([]),
      removePlayer: jest.fn().mockResolvedValue(undefined),
      upsertPlayer: jest
        .fn()
        .mockImplementation(
          ({
            roomCode,
            player,
          }: Parameters<PokeLoungeLiveStateService['upsertPlayer']>[0]) =>
            Promise.resolve({
              roomCode,
              worldEpoch: 'world-1',
              worldSeq: 1,
              ...player,
            }),
        ),
    };
    gateway = new PokeLoungeGateway(
      roomService as unknown as PokeLoungeRoomService,
      events,
      liveState as unknown as PokeLoungeLiveStateService,
    );
    namespaceEmit = jest.fn();
    namespaceFetchSockets = jest.fn().mockResolvedValue([]);
    namespaceTo = jest.fn(() => ({ emit: namespaceEmit }));
    namespaceLocalTo = jest.fn(() => ({ emit: namespaceEmit }));
    serverSideEmit = jest.fn();
    serverListeners = new Map();
    gateway.afterInit({
      off: jest.fn(),
      in: jest.fn(() => ({ fetchSockets: namespaceFetchSockets })),
      on: jest.fn((eventName: string, listener: (input: unknown) => void) => {
        serverListeners.set(eventName, listener);
      }),
      local: { to: namespaceLocalTo },
      serverSideEmit,
      to: namespaceTo,
    } as unknown as Namespace);
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('authorizes, normalizes, and sends the same initial revision to two subscribers', async () => {
    const first = socket();
    const second = socket();

    await gateway.subscribe(first.value, {
      roomCode: ' room01 ',
      playerId: ' player-1 ',
      sessionId: ' session-1 ',
      afterRevision: 7,
    });
    await gateway.subscribe(second.value, {
      roomCode: 'ROOM01',
      playerId: 'player-2',
      sessionId: 'session-2',
      afterRevision: 7,
    });

    expect(roomService.authorizeSubscription).toHaveBeenNthCalledWith(
      1,
      'ROOM01',
      'player-1',
      'session-1',
      7,
    );
    expect(first.join).toHaveBeenCalledWith('room:ROOM01');
    expect(second.join).toHaveBeenCalledWith('room:ROOM01');
    expect(first.emit).toHaveBeenCalledWith('room.snapshot', {
      room: publicRoom(),
    });
    expect(second.emit).toHaveBeenCalledWith('room.snapshot', {
      room: publicRoom(),
    });
    expect(first.emit).toHaveBeenCalledWith(
      'room.world-snapshot',
      worldSnapshot(),
    );
    expect(JSON.stringify(first.emit.mock.calls)).not.toContain('sessionId');
  });

  it('accepts an initial subscription without a recovery cursor', async () => {
    const client = socket();

    await gateway.subscribe(client.value, {
      roomCode: 'ROOM01',
      playerId: 'player-1',
      sessionId: 'session-1',
    });

    expect(roomService.authorizeSubscription).toHaveBeenNthCalledWith(
      1,
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
    );
    expect(client.join).toHaveBeenCalledWith('room:ROOM01');
  });

  it('leaves a previous Poke Lounge room before joining the authorized room', async () => {
    const client = socket({ pokeLoungeRoomName: 'room:OLD001' });

    await gateway.subscribe(client.value, validSubscription());

    expect(client.leave).toHaveBeenCalledWith('room:OLD001');
    expect(client.leave.mock.invocationCallOrder[0]).toBeLessThan(
      client.join.mock.invocationCallOrder[0],
    );
  });

  it('reloads the durable snapshot after join so a concurrent commit cannot be missed', async () => {
    roomService.authorizeSubscription.mockResolvedValueOnce(
      publicRoom({ revision: 7 }),
    );
    roomService.acknowledgeParticipantPresence.mockResolvedValueOnce(
      publicRoom({ revision: 8 }),
    );
    const client = socket();

    await gateway.subscribe(client.value, validSubscription());

    expect(roomService.authorizeSubscription).toHaveBeenCalledTimes(1);
    expect(client.join.mock.invocationCallOrder[0]).toBeLessThan(
      roomService.acknowledgeParticipantPresence.mock.invocationCallOrder[0],
    );
    expect(client.emit).toHaveBeenCalledWith('room.snapshot', {
      room: publicRoom({ revision: 8 }),
    });
  });

  it('leaves the joined room when the durable identity changes during subscription', async () => {
    roomService.authorizeSubscription.mockResolvedValueOnce(
      publicRoom({ revision: 7 }),
    );
    roomService.acknowledgeParticipantPresence.mockRejectedValueOnce(
      new BadRequestException('Poke Lounge room subscription rejected'),
    );
    const client = socket();

    await gateway.subscribe(client.value, validSubscription());

    expect(client.join).toHaveBeenCalledWith('room:ROOM01');
    expect(client.leave).toHaveBeenCalledWith('room:ROOM01');
    expect(client.emit).not.toHaveBeenCalledWith(
      'room.snapshot',
      expect.anything(),
    );
    expect(client.emit).toHaveBeenCalledWith('room.subscription-error', {
      code: 'POKE_LOUNGE_SUBSCRIPTION_REJECTED',
      message: 'Poke Lounge room subscription rejected',
    });
  });

  it.each([
    { ...validSubscription(), roomCode: 'SHORT' },
    { ...validSubscription(), playerId: ' ' },
    { ...validSubscription(), sessionId: 'x'.repeat(257) },
    { ...validSubscription(), afterRevision: -1 },
    { ...validSubscription(), afterRevision: Number.MAX_SAFE_INTEGER + 1 },
  ])(
    'rejects malformed subscriptions with one generic error',
    async (input) => {
      const client = socket();

      await gateway.subscribe(client.value, input);

      expect(roomService.authorizeSubscription).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('room.subscription-error', {
        code: 'POKE_LOUNGE_SUBSCRIPTION_REJECTED',
        message: 'Poke Lounge room subscription rejected',
      });
      expect(JSON.stringify(client.emit.mock.calls)).not.toContain('session-1');
      expect(JSON.stringify(client.emit.mock.calls)).not.toContain('ROOM01');
    },
  );

  it('uses the same generic error for unknown participants and wrong sessions', async () => {
    roomService.authorizeSubscription.mockRejectedValue(
      new BadRequestException('Poke Lounge room subscription rejected'),
    );
    const client = socket();

    await gateway.subscribe(client.value, validSubscription());

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('room.subscription-error', {
      code: 'POKE_LOUNGE_SUBSCRIPTION_REJECTED',
      message: 'Poke Lounge room subscription rejected',
    });
    expect(JSON.stringify(client.emit.mock.calls)).not.toContain('session-1');
    expect(JSON.stringify(client.emit.mock.calls)).not.toContain('ROOM01');
  });

  it('leaves the previous room when an authorized socket re-subscription is rejected', async () => {
    jest.useFakeTimers();
    const client = socket();
    await gateway.subscribe(client.value, validSubscription());
    client.leave.mockClear();
    roomService.authorizeSubscription.mockRejectedValueOnce(
      new BadRequestException('Poke Lounge room subscription rejected'),
    );

    await gateway.subscribe(client.value, validSubscription());

    expect(client.leave).toHaveBeenCalledWith('room:ROOM01');
    expect(client.value.data).toEqual({});
    await jest.advanceTimersByTimeAsync(60_000);
    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
  });

  it('broadcasts only committed public snapshots to the authorized room', () => {
    const room = publicRoom({ revision: 8 });

    events.publishCommitted(room);

    expect(namespaceLocalTo).toHaveBeenCalledWith('room:ROOM01');
    expect(namespaceEmit).toHaveBeenCalledWith('room.snapshot', {
      room,
    });
    expect(serverSideEmit).not.toHaveBeenCalled();
    expect(liveState.extendRoomExpiry).toHaveBeenCalledWith(
      'ROOM01',
      room.expiresAtMs,
    );
    expect(JSON.stringify(namespaceEmit.mock.calls)).not.toContain('sessionId');
  });

  it('applies a closed room metadata event and ignores an older reopen', async () => {
    const client = socket();
    await gateway.subscribe(client.value, validSubscription());
    serverListeners.get('poke-lounge.room-metadata')?.({
      roomCode: 'ROOM01',
      revision: 8,
      expiresAtMs: publicRoom().expiresAtMs,
      closed: true,
    });
    serverListeners.get('poke-lounge.room-metadata')?.({
      roomCode: 'ROOM01',
      revision: 7,
      expiresAtMs: publicRoom().expiresAtMs,
      closed: false,
    });
    await gateway.relayPlayerEvent(client.value, {
      type: 'PLAYER_MOVED',
      snapshot: { map: 'new-bark-town', x: 1, y: 2, facing: 'front' },
    });

    expect(liveState.deleteRoom).toHaveBeenCalledWith('ROOM01');
    expect(liveState.upsertPlayer).not.toHaveBeenCalled();
  });

  it('relays validated live movement with the subscribed participant identity', async () => {
    const client = socket();
    await gateway.subscribe(client.value, validSubscription());

    await gateway.relayPlayerEvent(client.value, {
      type: 'PLAYER_MOVED',
      snapshot: {
        sessionId: 'forged-session',
        playerId: 'forged-player',
        displayName: 'Forged player',
        map: 'new-bark-town',
        x: 672,
        y: 448,
        facing: 'left',
        party: [{ secret: true }],
      },
    });

    const storedInput = liveState.upsertPlayer.mock.calls[0]?.[0];
    expect(storedInput).toBeDefined();
    if (!storedInput) {
      throw new Error('Expected a stored live player event');
    }
    const { updatedAtMs, ...storedPlayer } = storedInput.player;
    expect({ ...storedInput, player: storedPlayer }).toEqual({
      roomCode: 'ROOM01',
      expiresAtMs: publicRoom().expiresAtMs,
      player: {
        playerId: 'player-1',
        displayName: 'Player 1',
        map: 'new-bark-town',
        x: 672,
        y: 448,
        facing: 'left',
      },
    });
    expect(updatedAtMs).toEqual(expect.any(Number));
    expect(namespaceTo).toHaveBeenCalledWith('room:ROOM01');
    expect(namespaceEmit).toHaveBeenCalledWith('room.player-event', {
      type: 'PLAYER_MOVED',
      roomCode: 'ROOM01',
      worldEpoch: 'world-1',
      worldSeq: 1,
      snapshot: {
        sessionId: 'player-1',
        playerId: 'player-1',
        displayName: 'Player 1',
        map: 'new-bark-town',
        x: 672,
        y: 448,
        facing: 'left',
      },
    });
  });

  it('ignores live movement before subscription and malformed coordinates', async () => {
    const unsubscribed = socket();

    await gateway.relayPlayerEvent(unsubscribed.value, {
      type: 'PLAYER_MOVED',
      snapshot: { map: 'new-bark-town', x: 1, y: 2, facing: 'front' },
    });
    expect(liveState.upsertPlayer).not.toHaveBeenCalled();

    const subscribed = socket();
    await gateway.subscribe(subscribed.value, validSubscription());
    await gateway.relayPlayerEvent(subscribed.value, {
      type: 'PLAYER_MOVED',
      snapshot: {
        map: 'new-bark-town',
        x: Number.POSITIVE_INFINITY,
        y: 2,
        facing: 'front',
      },
    });

    expect(liveState.upsertPlayer).not.toHaveBeenCalled();
  });

  it('reports cursor regression without joining or applying the lower snapshot', async () => {
    roomService.authorizeSubscription.mockResolvedValue(
      publicRoom({ revision: 6 }),
    );
    const client = socket({ pokeLoungeRoomName: 'room:OLD001' });

    await gateway.subscribe(client.value, {
      ...validSubscription(),
      afterRevision: 7,
    });

    expect(client.leave).toHaveBeenCalledWith('room:OLD001');
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('room.revision-conflict', {
      room: publicRoom({ revision: 6 }),
    });
  });

  it('expires a disconnected participant only after the reconnect grace period', async () => {
    jest.useFakeTimers();
    const client = socket();
    await gateway.subscribe(client.value, validSubscription());

    gateway.handleDisconnect(client.value);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(roomService.markParticipantDisconnectPending).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.any(Number),
      expect.anything(),
    );
    expect(roomService.expireParticipantPresence).not.toHaveBeenCalled();
    expect(liveState.removePlayer).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(liveState.removePlayer).toHaveBeenCalledWith('ROOM01', 'player-1');
    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
  });

  it('cancels pending expiry when the same participant reconnects', async () => {
    jest.useFakeTimers();
    const disconnected = socket();
    await gateway.subscribe(disconnected.value, validSubscription());
    gateway.handleDisconnect(disconnected.value);

    await jest.advanceTimersByTimeAsync(10_000);
    const reconnected = socket();
    await gateway.subscribe(reconnected.value, validSubscription());
    await jest.advanceTimersByTimeAsync(10_000);

    expect(roomService.expireParticipantPresence).not.toHaveBeenCalled();
    expect(liveState.removePlayer).not.toHaveBeenCalled();
  });

  it('keeps presence when the same identity reconnects to another API instance', async () => {
    jest.useFakeTimers();
    const disconnected = socket();
    await gateway.subscribe(disconnected.value, validSubscription());
    namespaceFetchSockets.mockResolvedValue([
      {
        data: {
          pokeLoungePlayerId: 'player-1',
          pokeLoungeSessionId: 'session-1',
          pokeLoungeSubscribed: true,
        },
      },
    ]);

    gateway.handleDisconnect(disconnected.value);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.expireParticipantPresence).not.toHaveBeenCalled();
    expect(liveState.removePlayer).not.toHaveBeenCalled();
  });

  it('restores a persisted disconnect deadline after application restart', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    liveState.listRoomStateCodes.mockResolvedValue(['ROOM01']);
    roomService.getRoom.mockResolvedValue(
      roomSnapshot({
        participants: [
          {
            ...roomSnapshot().participants[0],
            presenceEpoch: 'presence-epoch-1',
            disconnectPendingUntilMs: 61_000,
          },
        ],
      }),
    );

    await gateway.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(roomService.expireParticipantPresence).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-1',
      expect.anything(),
    );
  });

  it('persists grace for an acknowledged participant missing after restart', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    liveState.listRoomStateCodes.mockResolvedValue(['ROOM01']);
    roomService.getRoom.mockResolvedValue(
      roomSnapshot({
        participants: [
          {
            ...roomSnapshot().participants[0],
            presenceEpoch: 'presence-epoch-1',
          },
        ],
      }),
    );

    await gateway.onApplicationBootstrap();

    expect(roomService.markParticipantDisconnectPending).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-1',
      61_000,
      expect.anything(),
    );
  });

  it('expires the durable presence when a reconnect acknowledgement is aborted', async () => {
    jest.useFakeTimers();
    const first = socket();
    await gateway.subscribe(first.value, validSubscription());
    gateway.handleDisconnect(first.value);
    await jest.advanceTimersByTimeAsync(10_000);

    let rejectReconnect: ((error: Error) => void) | undefined;
    let reconnectSignal: AbortSignal | undefined;
    roomService.acknowledgeParticipantPresence.mockImplementationOnce(
      (_roomCode, _playerId, _sessionId, _afterRevision, _epoch, signal) => {
        reconnectSignal = signal;
        return new Promise((_resolve, reject) => {
          rejectReconnect = reject;
        });
      },
    );
    const second = socket();
    const reconnecting = gateway.subscribe(second.value, validSubscription());
    await jest.advanceTimersByTimeAsync(0);
    expect(reconnectSignal).toMatchObject({ aborted: false });

    second.disconnect();
    gateway.handleDisconnect(second.value);
    expect(reconnectSignal).toMatchObject({ aborted: true });
    rejectReconnect?.(new Error('cancelled reconnect acknowledgement'));
    await reconnecting;
    roomService.expireParticipantPresence.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.objectContaining({ aborted: false }),
    );
  });

  it('keeps a participant present while another socket with the same identity remains', async () => {
    jest.useFakeTimers();
    const first = socket();
    const second = socket();
    await gateway.subscribe(first.value, validSubscription());
    await gateway.subscribe(second.value, validSubscription());

    gateway.handleDisconnect(first.value);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(roomService.expireParticipantPresence).not.toHaveBeenCalled();

    gateway.handleDisconnect(second.value);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(roomService.expireParticipantPresence).toHaveBeenCalledTimes(1);
  });

  it('shares one epoch when same-identity acknowledgements finish in reverse order', async () => {
    jest.useFakeTimers();
    let resolveFirst: ((room: PokeLoungePublicRoomState) => void) | undefined;
    let resolveSecond: ((room: PokeLoungePublicRoomState) => void) | undefined;
    roomService.acknowledgeParticipantPresence
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const first = socket();
    const firstSubscription = gateway.subscribe(
      first.value,
      validSubscription(),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(resolveFirst).toBeDefined();

    const second = socket();
    const secondSubscription = gateway.subscribe(
      second.value,
      validSubscription(),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(resolveSecond).toBeDefined();
    const firstEpoch =
      roomService.acknowledgeParticipantPresence.mock.calls[0]?.[4];
    const secondEpoch =
      roomService.acknowledgeParticipantPresence.mock.calls[1]?.[4];
    expect(firstEpoch).toEqual(expect.any(String));
    expect(secondEpoch).toBe(firstEpoch);

    resolveSecond?.(publicRoom({ revision: 8 }));
    await secondSubscription;
    resolveFirst?.(publicRoom({ revision: 8 }));
    await firstSubscription;
    gateway.handleDisconnect(first.value);
    gateway.handleDisconnect(second.value);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
  });

  it('expires the previous identity when one socket switches identity in the same room', async () => {
    jest.useFakeTimers();
    const client = socket();
    await gateway.subscribe(client.value, validSubscription());

    await gateway.subscribe(client.value, {
      ...validSubscription(),
      playerId: 'player-2',
      sessionId: 'session-2',
    });
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
    expect(roomService.expireParticipantPresence).not.toHaveBeenCalledWith(
      'ROOM01',
      'player-2',
      'session-2',
      expect.any(String),
      expect.anything(),
    );
  });

  it('tracks a disconnect that races durable subscription acknowledgement', async () => {
    jest.useFakeTimers();
    let resolveAcknowledgement:
      ((room: PokeLoungePublicRoomState) => void) | undefined;
    roomService.acknowledgeParticipantPresence.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAcknowledgement = resolve;
        }),
    );
    const client = socket();
    const pending = gateway.subscribe(client.value, validSubscription());
    await jest.advanceTimersByTimeAsync(0);
    expect(resolveAcknowledgement).toBeDefined();

    client.disconnect();
    gateway.handleDisconnect(client.value);
    resolveAcknowledgement?.(publicRoom({ revision: 8 }));
    await pending;
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
  });

  it('tracks a disconnect that races joining the socket room', async () => {
    jest.useFakeTimers();
    let resolveJoin: (() => void) | undefined;
    const client = socket();
    client.join.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveJoin = resolve;
        }),
    );
    const pending = gateway.subscribe(client.value, validSubscription());
    await jest.advanceTimersByTimeAsync(0);
    expect(resolveJoin).toBeDefined();

    client.disconnect();
    gateway.handleDisconnect(client.value);
    resolveJoin?.();
    await pending;
    await jest.advanceTimersByTimeAsync(60_000);

    expect(roomService.acknowledgeParticipantPresence).not.toHaveBeenCalled();
    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      expect.any(String),
      expect.anything(),
    );
  });

  it('rotates the durable epoch when reconnecting during an in-flight expiry', async () => {
    jest.useFakeTimers();
    let resolveExpiry: (() => void) | undefined;
    roomService.expireParticipantPresence.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveExpiry = resolve;
        }),
    );
    const disconnected = socket();
    await gateway.subscribe(disconnected.value, validSubscription());
    const firstEpoch =
      roomService.acknowledgeParticipantPresence.mock.calls[0]?.[4];
    gateway.handleDisconnect(disconnected.value);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(resolveExpiry).toBeDefined();
    const expirySignal =
      roomService.expireParticipantPresence.mock.calls[0]?.[4];
    expect(roomService.expireParticipantPresence).toHaveBeenCalledWith(
      'ROOM01',
      'player-1',
      'session-1',
      firstEpoch,
      expirySignal,
    );

    const reconnected = socket();
    await gateway.subscribe(reconnected.value, validSubscription());
    const secondEpoch =
      roomService.acknowledgeParticipantPresence.mock.calls[1]?.[4];

    expect(firstEpoch).toEqual(expect.any(String));
    expect(secondEpoch).toEqual(expect.any(String));
    expect(secondEpoch).not.toBe(firstEpoch);
    expect(expirySignal).toMatchObject({ aborted: true });
    resolveExpiry?.();
    await jest.advanceTimersByTimeAsync(0);
  });
});

function validSubscription() {
  return {
    roomCode: 'ROOM01',
    playerId: 'player-1',
    sessionId: 'session-1',
    afterRevision: 7,
  };
}

function socket(data: Record<string, unknown> = {}) {
  const join = jest.fn().mockResolvedValue(undefined);
  const leave = jest.fn().mockResolvedValue(undefined);
  const emit = jest.fn();
  const broadcastEmit = jest.fn();
  const to = jest.fn(() => ({ emit: broadcastEmit }));

  const value = { data, join, leave, emit, to, connected: true };

  return {
    value: value as unknown as Socket,
    join,
    leave,
    emit,
    to,
    broadcastEmit,
    disconnect: () => {
      value.connected = false;
    },
  };
}

function publicRoom(
  overrides: Partial<PokeLoungePublicRoomState> = {},
): PokeLoungePublicRoomState {
  return {
    roomCode: 'ROOM01',
    hostPlayerId: 'player-1',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
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
      index: 1,
      phase: 'waiting',
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
    revision: 7,
    expiresAtMs: 253_402_300_799_999,
    competitiveTransitions: [],
    ...overrides,
  };
}

function roomSnapshot(
  overrides: Partial<PokeLoungeRoomSnapshot> = {},
): PokeLoungeRoomSnapshot {
  return {
    ...publicRoom(),
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
    ...overrides,
  };
}

function worldSnapshot() {
  return {
    roomCode: 'ROOM01',
    worldEpoch: 'world-1',
    worldSeq: 0,
    players: [],
  };
}

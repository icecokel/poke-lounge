import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createTournamentBracketState } from '@poke-lounge/battle/tournament-bracket';
import { FakePokeLoungeRoomRepository } from '../../test/support/fake-poke-lounge-room.repository';
import {
  createTestCompetitivePartyInput,
  createTestPartySnapshot,
  createTestPartySnapshots,
} from '../../test/support/competitive-party.fixture';
import type { PokeLoungeRoomEventPublisher } from './poke-lounge-room-event.publisher';
import type {
  PokeLoungeRoomRepository,
  PokeLoungeRoomSnapshot,
} from './poke-lounge-room.repository';
import { PokeLoungeRoomService } from './poke-lounge-room.service';
import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';

describe('PokeLoungeRoomService', function testSuite() {
  let repository: FakePokeLoungeRoomRepository;
  let publisher: jest.Mocked<PokeLoungeRoomEventPublisher>;
  let service: PokeLoungeRoomService;
  let currentTimeMs: number;
  let roomCodes: string[];
  let competitiveProjection: {
    findRoomSnapshot: jest.Mock;
  };

  beforeEach(function setUpTest() {
    currentTimeMs = 0;
    roomCodes = ['ROOM01'];
    repository = new FakePokeLoungeRoomRepository();
    competitiveProjection = {
      findRoomSnapshot: jest.fn(function mockFunction(roomCode: string) {
        return Promise.resolve(repository.snapshot(roomCode));
      }),
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new PokeLoungeRoomService(
      repository,
      publisher,
      competitiveProjection as never,
      function callback() {
        return roomCodes.shift() ?? 'ROOM99';
      },
      function callback() {
        return currentTimeMs;
      },
    );
  });

  it('creates revision zero with durable expiry and publishes only the committed snapshot', async function testCase() {
    const room = await service.createRoom(
      {
        sessionId: ' session-a ',
        userId: ' user-a ',
        roundDurationMs: 1000,
        nowMs: 100,
      },
      command(0, 1),
    );

    expect(room).toMatchObject({
      roomCode: 'ROOM01',
      visibility: 'private',
      revision: 0,
      expiresAtMs: 100 + 30 * 60_000,
      participants: [
        {
          playerId: 'player-1',
          sessionId: 'session-a',
          userId: 'user-a',
          displayName: 'Player 1',
        },
      ],
    });
    expectPublicEvent(publisher, 'room-created', room);
  });

  it('lets the host add and remove an AI participant with a starter party', async function testCase() {
    await createRoom();

    const added = await service.addAiParticipant(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 10 },
      command(0, 101),
    );
    const ai = added.participants.find(function findItem(participant) {
      return participant.controller === 'ai';
    });

    expect(ai).toMatchObject({
      displayName: 'AI 1',
      ready: true,
      connected: true,
    });
    expect(
      added.partySnapshots[ai!.playerId]?.competitiveParty.members,
    ).toHaveLength(1);

    const removed = await service.removeAiParticipant(
      'ROOM01',
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        aiPlayerId: ai!.playerId,
        nowMs: 20,
      },
      command(1, 102),
    );

    expect(removed.participants).toHaveLength(1);
    expect(removed.partySnapshots[ai!.playerId]).toBeUndefined();
  });

  it('counts manually added AI when filling the room on start', async function testCase() {
    await createRoom({ roundDurationMs: 1_000 });
    const withAi = await service.addAiParticipant(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 10 },
      command(0, 110),
    );
    const party = await updateTestParty(
      'player-1',
      'session-1',
      withAi.revision,
      111,
      20,
    );
    const ready = await service.setReady(
      'ROOM01',
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        ready: true,
        nowMs: 30,
      },
      command(party.revision, 112),
    );

    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 40 },
      command(ready.revision, 113),
    );

    expect(started.participants).toHaveLength(4);
    expect(
      started.participants.filter(function filterItem(participant) {
        return participant.controller === 'ai';
      }),
    ).toHaveLength(3);
  });

  it('creates a public room when quick play has no candidate', async function testCase() {
    const room = await service.quickPlay(
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: '레드',
        nowMs: 0,
      },
      roundCommand(201),
    );

    expect(room).toMatchObject({
      roomCode: 'ROOM01',
      visibility: 'public',
      participants: [
        expect.objectContaining({
          playerId: 'player-1',
          sessionId: 'session-1',
        }),
      ],
    });
  });

  it('quick plays into the oldest public waiting room and skips private rooms', async function testCase() {
    roomCodes = ['PRIVATE', 'PUBLIC'];
    await service.createRoom(
      {
        playerId: 'private-player',
        sessionId: 'private-session',
        nowMs: 0,
      },
      command(0, 202),
    );
    await service.createRoom(
      {
        visibility: 'public',
        playerId: 'public-player',
        sessionId: 'public-session',
        nowMs: 1,
      },
      command(0, 203),
    );

    const joined = await service.quickPlay(
      {
        playerId: 'joining-player',
        sessionId: 'joining-session',
        nowMs: 2,
      },
      roundCommand(204),
    );

    expect(joined.roomCode).toBe('PUBLIC');
    expect(joined.participants).toHaveLength(2);
    expect(repository.snapshot('PRIVATE')?.participants).toHaveLength(1);
  });

  it('replays quick play without duplicating an existing participant', async function testCase() {
    const quickPlayCommand = roundCommand(205);
    const created = await service.quickPlay(
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        nowMs: 0,
      },
      quickPlayCommand,
    );
    const replayed = await service.quickPlay(
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        nowMs: 1,
      },
      quickPlayCommand,
    );

    expect(replayed.roomCode).toBe(created.roomCode);
    expect(replayed.participants).toHaveLength(1);
  });

  it('fixes production round preparation to three minutes', async function testCase() {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const room = await createRoom({ roundDurationMs: 1_000 });
      expect(room.round.durationMs).toBe(180_000);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('uses supplied nicknames for a room creator and a newly joined player', async function testCase() {
    const created = await service.createRoom(
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: ' 레드 ',
        nowMs: 0,
      },
      command(0, 1),
    );
    const joined = await service.joinRoom(
      'ROOM01',
      {
        playerId: 'player-2',
        sessionId: 'session-2',
        displayName: ' 블루 ',
        nowMs: 1,
      },
      command(created.revision, 2),
    );

    expect(joined.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', displayName: '레드' }),
        expect.objectContaining({ playerId: 'player-2', displayName: '블루' }),
      ]),
    );
  });

  it('creates or joins the same requested room code without exposing separate commands', async function testCase() {
    const mutate = jest.spyOn(repository, 'mutate');
    const created = await service.createRoom(
      {
        roomCode: 'TEMP01',
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: '레드',
        nowMs: 0,
      },
      command(0, 1),
    );
    const joined = await service.createRoom(
      {
        roomCode: 'TEMP01',
        playerId: 'player-2',
        sessionId: 'session-2',
        displayName: '블루',
        nowMs: 1,
      },
      command(0, 2),
    );
    const replayed = await service.createRoom(
      {
        roomCode: 'TEMP01',
        playerId: 'player-2',
        sessionId: 'session-2',
        displayName: '블루',
        nowMs: 1,
      },
      command(0, 2),
    );

    expect(created).toMatchObject({ roomCode: 'TEMP01', revision: 0 });
    expect(joined).toMatchObject({ roomCode: 'TEMP01', revision: 1 });
    expect(joined.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', displayName: '레드' }),
        expect.objectContaining({ playerId: 'player-2', displayName: '블루' }),
      ]),
    );
    expect(replayed).toEqual(joined);
    const joinIdempotencyKey = mutate.mock.calls.at(0)?.[0].idempotencyKey;
    expect(joinIdempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('updates a nickname when the same session rejoins a waiting room', async function testCase() {
    const created = await service.createRoom(
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: '레드',
        nowMs: 0,
      },
      command(0, 1),
    );
    const rejoined = await service.joinRoom(
      'ROOM01',
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: '블루',
        nowMs: 1,
      },
      command(created.revision, 2),
    );

    expect(rejoined.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', displayName: '블루' }),
      ]),
    );
  });

  it('publishes a redacted snapshot after a room update', async function testCase() {
    await createRoom();
    publisher.publish.mockClear();

    const room = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 1 },
      command(0, 2),
    );

    expectPublicEvent(publisher, 'room-updated', room);
  });

  it('authorizes a durable participant session and returns only the public snapshot', async function testCase() {
    await createRoom();

    const room = await Promise.resolve().then(function handleResolved() {
      return (
        service as unknown as {
          authorizeSubscription(
            roomCode: string,
            playerId: string,
            sessionId: string,
          ): Promise<PokeLoungePublicRoomState>;
        }
      ).authorizeSubscription(' room01 ', 'player-1', 'session-1');
    });

    expect(room).toMatchObject({ roomCode: 'ROOM01', revision: 0 });
    expect(JSON.stringify(room)).not.toContain('sessionId');
    expect(JSON.stringify(room)).not.toContain('userId');
    expect(JSON.stringify(room)).not.toContain('session-1');
  });

  it('forwards the optional recovery cursor for REST reads and subscription authorization', async function testCase() {
    await createRoom();
    competitiveProjection.findRoomSnapshot.mockClear();

    await service.getRoom('ROOM01', 7);
    await service.authorizeSubscription('ROOM01', 'player-1', 'session-1', 8);

    expect(competitiveProjection.findRoomSnapshot).toHaveBeenNthCalledWith(
      1,
      'ROOM01',
      7,
    );
    expect(competitiveProjection.findRoomSnapshot).toHaveBeenNthCalledWith(
      2,
      'ROOM01',
      8,
    );
  });

  it('uses only the injected server clock when reading and purging rooms', async function testCase() {
    await createRoom();
    const getAndAdvance = jest.spyOn(repository, 'getAndAdvance');
    currentTimeMs = 42_000;

    await service.getRoom('ROOM01');

    expect(getAndAdvance).toHaveBeenCalledWith('ROOM01', 42_000);
  });

  it('keeps the room waiting after ready and presence acknowledgement until the host starts it', async function testCase() {
    const created = await service.createRoom(
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 0 },
      command(0, 1),
      { requireSocketAcknowledgement: true },
    );
    const joined = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 1 },
      command(created.revision, 2),
      { requireSocketAcknowledgement: true },
    );
    const hostParty = await updateTestParty(
      'player-1',
      'session-1',
      joined.revision,
      3,
      2,
    );
    const guestParty = await updateTestParty(
      'player-2',
      'session-2',
      hostParty.revision,
      4,
      3,
    );
    const hostReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 4 },
      command(guestParty.revision, 5),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 5 },
      command(hostReady.revision, 6),
    );

    expect(bothReady.status).toBe('waiting');
    await expect(
      service.startRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 5 },
        command(bothReady.revision, 70),
      ),
    ).rejects.toThrow('All participants must be connected before starting');
    const hostAcknowledged = await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      bothReady.revision,
    );
    expect(hostAcknowledged.status).toBe('waiting');
    const guestAcknowledged = await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-2',
      'session-2',
      hostAcknowledged.revision,
    );

    expect(guestAcknowledged).toMatchObject({
      status: 'waiting',
      round: { startedAtMs: null, endsAtMs: null },
      participants: [
        { playerId: 'player-1', ready: true, connected: true },
        { playerId: 'player-2', ready: true, connected: true },
      ],
    });
    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 6 },
      command(guestAcknowledged.revision, 7),
    );

    expect(started).toMatchObject({
      status: 'round-started',
      round: { startedAtMs: 6, endsAtMs: 180_006 },
    });
    expect(JSON.stringify(guestAcknowledged)).not.toContain(
      'presencePendingUntilMs',
    );
  });

  it('expires an unacknowledged HTTP participant and does not expose the pending lease', async function testCase() {
    const created = await service.createRoom(
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 0 },
      command(0, 1),
      { requireSocketAcknowledgement: true },
    );

    expect(created.participants[0]).toMatchObject({
      connected: true,
      presencePendingUntilMs: 15_000,
    });
    const published = publisher.publish.mock.calls.at(-1)?.[0].snapshot;
    expect(published?.participants[0]).toMatchObject({ connected: false });
    expect(JSON.stringify(published)).not.toContain('presencePendingUntilMs');

    currentTimeMs = 15_000;
    await expect(service.getRoom('ROOM01')).resolves.toMatchObject({
      status: 'waiting',
      revision: 1,
      participants: [],
    });
  });

  it('does not replace an already acknowledged session with a pending lease', async function testCase() {
    await createRoom();

    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 1 },
      command(0, 2),
      { requireSocketAcknowledgement: true },
    );
    currentTimeMs = 20_000;

    await expect(service.getRoom('ROOM01')).resolves.toMatchObject({
      status: 'waiting',
      revision: 1,
      participants: [{ playerId: 'player-1', connected: true }],
    });
    expect(repository.snapshot('ROOM01')?.participants[0]).not.toHaveProperty(
      'presencePendingUntilMs',
    );
  });

  it('removes an expired participant but keeps the waiting room reclaimable', async function testCase() {
    await createRoom();
    currentTimeMs = 42_000;

    await service.expireParticipantPresence(
      ' room01 ',
      ' player-1 ',
      ' session-1 ',
    );

    expect(repository.snapshot('ROOM01')).toMatchObject({
      status: 'waiting',
      revision: 1,
      participants: [],
      round: { phase: 'waiting' },
    });
  });

  it('still closes the waiting room when the last participant explicitly leaves', async function testCase() {
    await createRoom();

    const closed = await service.leaveRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 42_000 },
      command(0, 2),
    );

    expect(closed).toMatchObject({
      status: 'closed',
      participants: [],
      round: { phase: 'completed' },
    });
  });

  it('removes AI participants when the last human explicitly leaves', async function testCase() {
    const created = await createRoom();
    const withAi = await service.addAiParticipant(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 41_000 },
      command(created.revision, 21),
    );
    const aiPlayerId = withAi.participants.find(function findItem(participant) {
      return participant.controller === 'ai';
    })!.playerId;

    const closed = await service.leaveRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 42_000 },
      command(withAi.revision, 22),
    );

    expect(closed).toMatchObject({ status: 'closed', participants: [] });
    expect(closed.partySnapshots).not.toHaveProperty(aiPlayerId);
  });

  it('persists a reconnect grace deadline and expires it after restart', async function testCase() {
    await createRoom();
    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-1',
    );
    publisher.publish.mockClear();

    await service.markParticipantDisconnectPending(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-1',
      60_000,
    );

    expect(repository.snapshot('ROOM01')).toMatchObject({
      participants: [
        {
          playerId: 'player-1',
          connected: true,
          presenceEpoch: 'presence-epoch-1',
          disconnectPendingUntilMs: 60_000,
        },
      ],
    });
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toContain(
      'disconnectPendingUntilMs',
    );

    currentTimeMs = 60_000;
    await expect(service.getRoom('ROOM01')).resolves.toMatchObject({
      status: 'waiting',
      participants: [],
    });
  });

  it('persists reconnect grace when every room occupant disconnects together', async function testCase() {
    let room = await createRoom();
    const participants = Array.from({ length: 6 }, function callback(_, index) {
      return {
        playerId: `player-${index + 1}`,
        sessionId: `session-${index + 1}`,
        presenceEpoch: `presence-epoch-${index + 1}`,
      };
    });

    for (const [index, participant] of participants.slice(1).entries()) {
      room = await service.joinRoom(
        'ROOM01',
        { ...participant, nowMs: index + 1 },
        command(room.revision, index + 2),
      );
    }
    for (const participant of participants) {
      await service.acknowledgeParticipantPresence(
        'ROOM01',
        participant.playerId,
        participant.sessionId,
        undefined,
        participant.presenceEpoch,
      );
    }

    await Promise.all(
      participants.map(function mapItem(participant) {
        return service.markParticipantDisconnectPending(
          'ROOM01',
          participant.playerId,
          participant.sessionId,
          participant.presenceEpoch,
          60_000,
        );
      }),
    );

    const persistedParticipants = repository.snapshot('ROOM01')?.participants;
    for (const participant of participants) {
      expect(persistedParticipants).toContainEqual(
        expect.objectContaining({
          playerId: participant.playerId,
          disconnectPendingUntilMs: 60_000,
        }),
      );
    }
  });

  it('clears a persisted disconnect deadline when the participant reconnects', async function testCase() {
    await createRoom();
    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-old',
    );
    await service.markParticipantDisconnectPending(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-old',
      60_000,
    );

    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-new',
    );
    currentTimeMs = 60_000;

    await expect(service.getRoom('ROOM01')).resolves.toMatchObject({
      status: 'waiting',
      participants: [{ playerId: 'player-1', connected: true }],
    });
    expect(repository.snapshot('ROOM01')?.participants[0]).not.toHaveProperty(
      'disconnectPendingUntilMs',
    );
  });

  it('does not mutate presence for a stale session or an already absent participant', async function testCase() {
    await createRoom();

    await service.expireParticipantPresence(
      'ROOM01',
      'player-1',
      'stale-session',
    );
    await service.expireParticipantPresence(
      'ROOM01',
      'missing-player',
      'session-1',
    );

    expect(repository.snapshot('ROOM01')).toMatchObject({
      status: 'waiting',
      revision: 0,
      participants: [{ playerId: 'player-1', connected: true }],
    });
  });

  it('does not let a stale disconnect epoch remove a reconnected participant', async function testCase() {
    await createRoom();
    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-old',
    );
    const mutate = repository.mutate.bind(repository);
    let reconnectCommitted = false;
    jest
      .spyOn(repository, 'mutate')
      .mockImplementation(async function mockImplementation(input) {
        if (input.operation === 'leave' && !reconnectCommitted) {
          reconnectCommitted = true;
          await service.acknowledgeParticipantPresence(
            'ROOM01',
            'player-1',
            'session-1',
            undefined,
            'presence-epoch-new',
          );
        }

        return mutate(input);
      });

    await service.expireParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-old',
    );

    expect(reconnectCommitted).toBe(true);
    expect(repository.snapshot('ROOM01')).toMatchObject({
      status: 'waiting',
      revision: 2,
      participants: [
        {
          playerId: 'player-1',
          sessionId: 'session-1',
          connected: true,
          presenceEpoch: 'presence-epoch-new',
        },
      ],
    });
    await expect(
      service.authorizeSubscription('ROOM01', 'player-1', 'session-1'),
    ).resolves.not.toHaveProperty('participants.0.presenceEpoch');
  });

  it('cancels an in-flight expiry before its repository apply after reconnect', async function testCase() {
    await createRoom();
    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-old',
    );
    const controller = new AbortController();
    const mutate = repository.mutate.bind(repository);
    jest
      .spyOn(repository, 'mutate')
      .mockImplementation(async function mockImplementation(input) {
        if (input.operation === 'leave') {
          controller.abort();
        }
        return mutate(input);
      });

    await service.expireParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      'presence-epoch-old',
      controller.signal,
    );

    expect(repository.snapshot('ROOM01')).toMatchObject({
      status: 'waiting',
      revision: 1,
      participants: [
        {
          playerId: 'player-1',
          connected: true,
          presenceEpoch: 'presence-epoch-old',
        },
      ],
    });
  });

  it('cancels an old acknowledgement after a zero-socket reconnect epoch wins', async function testCase() {
    await createRoom();
    const mutate = repository.mutate.bind(repository);
    let releaseOldMutation: (() => void) | undefined;
    let oldMutationStarted: (() => void) | undefined;
    const oldMutationReady = new Promise<void>(function resolvePromise(
      resolve,
    ) {
      oldMutationStarted = resolve;
    });
    let oldMutationHeld = false;
    jest
      .spyOn(repository, 'mutate')
      .mockImplementation(async function mockImplementation(input) {
        if (input.operation === 'presence' && !oldMutationHeld) {
          oldMutationHeld = true;
          oldMutationStarted?.();
          await new Promise<void>(function resolvePromise(resolve) {
            releaseOldMutation = resolve;
          });
        }
        return mutate(input);
      });
    const oldController = new AbortController();
    const oldAcknowledgement = service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-old',
      oldController.signal,
    );
    await oldMutationReady;

    oldController.abort();
    await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-1',
      'session-1',
      undefined,
      'presence-epoch-new',
      new AbortController().signal,
    );
    const cancelled = expect(oldAcknowledgement).rejects.toThrow(
      'Poke Lounge presence mutation cancelled',
    );
    releaseOldMutation?.();
    await cancelled;

    expect(repository.snapshot('ROOM01')).toMatchObject({
      revision: 1,
      participants: [
        {
          playerId: 'player-1',
          connected: true,
          presenceEpoch: 'presence-epoch-new',
        },
      ],
    });
  });

  it.each([
    ['ROOM99', 'player-1', 'session-1'],
    ['ROOM01', 'unknown-player', 'session-1'],
    ['ROOM01', 'player-1', 'wrong-session'],
  ])(
    'rejects subscription credentials without disclosing which value failed (%s)',
    async function callback(roomCode, playerId, sessionId) {
      await createRoom();

      const attempt = Promise.resolve().then(function handleResolved() {
        return (
          service as unknown as {
            authorizeSubscription(
              roomCode: string,
              playerId: string,
              sessionId: string,
            ): Promise<PokeLoungePublicRoomState>;
          }
        ).authorizeSubscription(roomCode, playerId, sessionId);
      });

      await expect(attempt).rejects.toMatchObject({
        message: 'Poke Lounge room subscription rejected',
      });
    },
  );

  it('retries room-code collisions and preserves the capacity error', async function testCase() {
    await createRoom();
    roomCodes = ['ROOM01', 'ROOM02'];

    const room = await service.createRoom(
      { playerId: 'player-b', sessionId: 'session-b', nowMs: 1 },
      command(0, 2),
    );

    expect(room.roomCode).toBe('ROOM02');

    for (let index = 3; index <= 20; index += 1) {
      roomCodes = [`R${String(index).padStart(5, '0')}`];
      await service.createRoom(
        {
          playerId: `player-${index}`,
          sessionId: `session-${index}`,
          nowMs: 1,
        },
        command(0, index),
      );
    }

    await expect(
      service.createRoom(
        { playerId: 'overflow', sessionId: 'overflow', nowMs: 1 },
        command(0, 21),
      ),
    ).rejects.toThrow('Poke Lounge room capacity reached');
  });

  it('rejects a ninth player while allowing an existing session to rejoin a full room', async function testCase() {
    await createRoom();

    for (let index = 2; index <= 8; index += 1) {
      await service.joinRoom(
        'room01',
        {
          playerId: `player-${index}`,
          sessionId: `session-${index}`,
          nowMs: index,
        },
        command(index - 2, index),
      );
    }

    await expect(
      service.createRoom(
        {
          roomCode: 'ROOM01',
          playerId: 'player-9',
          sessionId: 'session-9',
          nowMs: 9,
        },
        command(0, 9),
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'POKE_LOUNGE_ROOM_FULL',
        message: 'Poke Lounge room is full',
      },
    });

    currentTimeMs = 10;
    const room = await service.getRoom('ROOM01');

    expect(room.participants).toHaveLength(8);
    expect(
      room.participants.every(function testItem(row) {
        return row.role === 'participant';
      }),
    ).toBe(true);
    expect(
      room.participants.some(function testItem(row) {
        return row.playerId === 'player-9';
      }),
    ).toBe(false);
    await expect(
      service.joinRoom(
        'ROOM01',
        { playerId: 'player-2', sessionId: 'wrong', nowMs: 11 },
        command(7, 20),
      ),
    ).rejects.toThrow('Join sessionId does not match this participant');

    const rejoined = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 12 },
      command(7, 21),
    );

    expect(rejoined.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'player-2',
          sessionId: 'session-2',
          role: 'participant',
        }),
      ]),
    );
  });

  it('starts only on the host command and durably advances the server round', async function testCase() {
    await createRoom({ roundDurationMs: 1000 });
    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 2),
    );
    await updateTestParty('player-1', 'session-1', 1, 30, 20);
    await updateTestParty('player-2', 'session-2', 2, 31, 30);
    const waiting = await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 100 },
      command(3, 3),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 200 },
      command(4, 4),
    );

    expect(waiting.status).toBe('waiting');
    expect(bothReady).toMatchObject({
      status: 'waiting',
      round: { startedAtMs: null, endsAtMs: null },
    });
    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 300 },
      command(bothReady.revision, 5),
    );

    expect(started).toMatchObject({
      status: 'round-started',
      revision: 6,
      round: { startedAtMs: 300, endsAtMs: 1300 },
    });
    const replayed = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 300 },
      { ...command(999, 5), expectedRevision: 999 },
    );
    expect(replayed).toEqual(started);

    publisher.publish.mockClear();
    currentTimeMs = 1300;
    const [hostRoundReady] = await Promise.all([
      service.setRoundReady(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', roundIndex: 1 },
        roundCommand(6),
      ),
      service.setRoundReady(
        'ROOM01',
        { playerId: 'player-2', sessionId: 'session-2', roundIndex: 1 },
        roundCommand(7),
      ),
    ]);
    expect(hostRoundReady).toMatchObject({
      status: 'round-started',
    });
    expect(hostRoundReady.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', ready: true }),
        expect.objectContaining({ playerId: 'player-2', ready: false }),
      ]),
    );
    const tournament = repository.snapshot('ROOM01')!;
    const replayedRoundReady = await service.setRoundReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', roundIndex: 1 },
      roundCommand(6),
    );

    expect(tournament).toMatchObject({
      status: 'tournament',
      revision: 8,
      tournament: {
        version: 2,
        activeMatchId: 'game-round-1-bracket-1-match-1',
      },
    });
    expect(tournament.tournament.bracket?.currentRound?.matches).toHaveLength(
      2,
    );
    expect(
      tournament.tournament.bracket?.currentRound?.matches[0]?.participantIds,
    ).toContain('player-1');
    expect(
      tournament.tournament.bracket?.currentRound?.matches[1]?.participantIds,
    ).toContain('player-2');
    expect(replayedRoundReady).toEqual(tournament);
    expectPublicEvent(publisher, 'room-updated', tournament);
  });

  it('accepts three concurrent round readiness acknowledgements without revision conflicts', async function testCase() {
    await createRoom({ roundDurationMs: 1_000 });
    let room = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 201),
    );
    room = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-3', sessionId: 'session-3', nowMs: 11 },
      command(room.revision, 202),
    );

    for (const [index, playerId] of [
      'player-1',
      'player-2',
      'player-3',
    ].entries()) {
      room = await updateTestParty(
        playerId,
        `session-${index + 1}`,
        room.revision,
        203 + index,
        20 + index,
      );
    }
    for (const [index, playerId] of [
      'player-1',
      'player-2',
      'player-3',
    ].entries()) {
      room = await service.setReady(
        'ROOM01',
        {
          playerId,
          sessionId: `session-${index + 1}`,
          ready: true,
          nowMs: 30 + index,
        },
        command(room.revision, 206 + index),
      );
    }

    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 40 },
      command(room.revision, 209),
    );
    currentTimeMs = 1_040;

    const acknowledgements = await Promise.all(
      ['player-1', 'player-2', 'player-3'].map(
        function mapItem(playerId, index) {
          return service.setRoundReady(
            'ROOM01',
            {
              playerId,
              sessionId: `session-${index + 1}`,
              roundIndex: 1,
            },
            roundCommand(210 + index),
          );
        },
      ),
    );
    const tournament = repository.snapshot('ROOM01')!;

    expect(acknowledgements).toHaveLength(3);
    expect(tournament).toMatchObject({
      status: 'tournament',
      revision: started.revision + 3,
    });
    expect(tournament.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', ready: true }),
        expect.objectContaining({ playerId: 'player-2', ready: true }),
        expect.objectContaining({ playerId: 'player-3', ready: true }),
      ]),
    );
  });

  it.each([
    [1, 4],
    [3, 4],
    [4, 8],
    [7, 8],
    [8, 8],
  ])(
    'fills %i ready participants to %i when the host starts',
    async function testCase(participantCount, expectedParticipantCount) {
      await createRoom({ roundDurationMs: 1_000 });
      let room = repository.snapshot('ROOM01')!;
      for (let index = 2; index <= participantCount; index += 1) {
        room = await service.joinRoom(
          'ROOM01',
          {
            playerId: `player-${index}`,
            sessionId: `session-${index}`,
            nowMs: index,
          },
          command(room.revision, 300 + index),
        );
      }
      for (let index = 1; index <= participantCount; index += 1) {
        room = await updateTestParty(
          `player-${index}`,
          `session-${index}`,
          room.revision,
          400 + index,
          10 + index,
        );
        room = await service.setReady(
          'ROOM01',
          {
            playerId: `player-${index}`,
            sessionId: `session-${index}`,
            ready: true,
            nowMs: 20 + index,
          },
          command(room.revision, 500 + index),
        );
      }

      const started = await service.startRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 30 },
        command(room.revision, 600),
      );

      expect(started).toMatchObject({
        status: 'round-started',
        round: { startedAtMs: 30, endsAtMs: 1_030 },
      });
      expect(started.participants).toHaveLength(expectedParticipantCount);
      expect(
        started.participants.filter(function filterItem(participant) {
          return participant.controller === 'ai';
        }),
      ).toHaveLength(expectedParticipantCount - participantCount);
      expect(Object.keys(started.partySnapshots)).toHaveLength(
        expectedParticipantCount,
      );
      expect(
        started.participants.every(function testItem(participant) {
          return participant.connected && !participant.ready;
        }),
      ).toBe(true);
    },
  );

  it('requires a waiting room, a synced party, every ready participant, and the current host', async function testCase() {
    await createRoom({ roundDurationMs: 1_000 });

    await expect(
      service.setReady(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 1 },
        command(0, 2),
      ),
    ).rejects.toThrow('Party snapshot is required before becoming ready');
    await expect(
      service.startRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 1 },
        command(0, 3),
      ),
    ).rejects.toThrow('All participants must be ready before starting');

    const joined = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 2 },
      command(0, 4),
    );
    const hostParty = await updateTestParty(
      'player-1',
      'session-1',
      joined.revision,
      5,
      3,
    );
    const guestParty = await updateTestParty(
      'player-2',
      'session-2',
      hostParty.revision,
      6,
      4,
    );
    const hostReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 5 },
      command(guestParty.revision, 7),
    );

    await expect(
      service.startRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 6 },
        command(hostReady.revision, 8),
      ),
    ).rejects.toThrow('All participants must be ready before starting');

    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 7 },
      command(hostReady.revision, 9),
    );

    await expect(
      service.startRoom(
        'ROOM01',
        { playerId: 'player-2', sessionId: 'session-2', nowMs: 8 },
        command(bothReady.revision, 10),
      ),
    ).rejects.toThrow('Only the room host can start');

    const withoutGuestParty = repository.snapshot('ROOM01')!;
    delete withoutGuestParty.partySnapshots['player-2'];
    repository.seed(withoutGuestParty);
    await expect(
      service.startRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 9 },
        command(withoutGuestParty.revision, 11),
      ),
    ).rejects.toThrow('All participants need a party snapshot before starting');
    expect(repository.snapshot('ROOM01')?.participants).toHaveLength(2);
    expect(
      repository
        .snapshot('ROOM01')
        ?.participants.some(function testItem(participant) {
          return participant.controller === 'ai';
        }),
    ).toBe(false);
  });

  it('rejects new participants after host start and still allows an existing identity to reconnect', async function testCase() {
    await createRoom({ roundDurationMs: 1000 });
    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 2),
    );
    await updateTestParty('player-1', 'session-1', 1, 32, 20);
    await updateTestParty('player-2', 'session-2', 2, 33, 30);
    await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 100 },
      command(3, 3),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 200 },
      command(4, 4),
    );
    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 300 },
      command(bothReady.revision, 5),
    );

    await expect(
      service.joinRoom(
        'ROOM01',
        { playerId: 'player-3', sessionId: 'session-3', nowMs: 400 },
        command(started.revision, 6),
      ),
    ).rejects.toThrow('Room is not joinable');
    await expect(
      service.setReady(
        'ROOM01',
        {
          playerId: 'player-2',
          sessionId: 'session-2',
          ready: false,
          nowMs: 450,
        },
        command(started.revision, 8),
      ),
    ).rejects.toThrow('Ready can only change in a waiting room');
    const rejoined = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 500 },
      command(started.revision, 7),
    );

    expect(rejoined).toMatchObject({
      status: 'round-started',
      round: { startedAtMs: 300, endsAtMs: 1300 },
    });
  });

  it('keeps a disconnected round participant reclaimable across failed resume leases', async function testCase() {
    await createRoom({ roundDurationMs: 300_000 });
    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 2),
    );
    await updateTestParty('player-1', 'session-1', 1, 32, 20);
    await updateTestParty('player-2', 'session-2', 2, 33, 30);
    await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 100 },
      command(3, 3),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 200 },
      command(4, 4),
    );
    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 300 },
      command(bothReady.revision, 5),
    );

    currentTimeMs = 400;
    await service.expireParticipantPresence('ROOM01', 'player-2', 'session-2');
    const firstResume = await service.createRoom(
      {
        roomCode: 'ROOM01',
        playerId: 'player-2',
        sessionId: 'session-2',
        nowMs: 500,
      },
      command(0, 6),
      { requireSocketAcknowledgement: true },
    );

    currentTimeMs = 500 + 15_000;
    const failedResumeExpired = await service.getRoom('ROOM01');
    const secondResume = await service.createRoom(
      {
        roomCode: 'ROOM01',
        playerId: 'player-2',
        sessionId: 'session-2',
        nowMs: currentTimeMs + 1,
      },
      command(0, 7),
      { requireSocketAcknowledgement: true },
    );
    const acknowledged = await service.acknowledgeParticipantPresence(
      'ROOM01',
      'player-2',
      'session-2',
      secondResume.revision,
    );

    expect(started.status).toBe('round-started');
    expect(firstResume.participants).toHaveLength(4);
    expect(failedResumeExpired.status).toBe('round-started');
    expect(
      failedResumeExpired.participants.find(function findItem(participant) {
        return participant.playerId === 'player-2';
      }),
    ).toMatchObject({
      playerId: 'player-2',
      connected: false,
    });
    expect(acknowledged.status).toBe('round-started');
    expect(
      acknowledged.participants.find(function findItem(participant) {
        return participant.playerId === 'player-2';
      }),
    ).toMatchObject({
      playerId: 'player-2',
      connected: true,
    });
    expect(acknowledged.partySnapshots['player-2']).toMatchObject({
      playerId: 'player-2',
    });
  });

  it('allows an existing player with the same session to reconnect during a tournament', async function testCase() {
    const tournament = await createTournament();

    const rejoined = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 1201 },
      command(tournament.revision, 10),
    );

    expect(rejoined).toMatchObject({
      status: 'tournament',
      revision: tournament.revision + 1,
      tournament: { activeMatchId: tournament.tournament.activeMatchId },
    });
    await expect(
      service.joinRoom(
        'ROOM01',
        { playerId: 'player-1', sessionId: 'wrong', nowMs: 1202 },
        command(rejoined.revision, 11),
      ),
    ).rejects.toThrow('Join sessionId does not match this participant');
    await expect(
      service.joinRoom(
        'ROOM01',
        { playerId: 'player-3', sessionId: 'session-3', nowMs: 1202 },
        command(rejoined.revision, 12),
      ),
    ).rejects.toThrow('Room is not joinable');
  });

  it('assigns the next participant id for an anonymous join and uses a stable opaque receipt actor', async function testCase() {
    await createRoom();
    const mutateSpy = jest.spyOn(repository, 'mutate');

    const joined = await service.joinRoom(
      'ROOM01',
      { sessionId: 'guest-session', nowMs: 1 },
      command(0, 2),
    );
    const replay = await service.joinRoom(
      'ROOM01',
      { sessionId: 'guest-session', nowMs: 1 },
      command(joined.revision, 2),
    );

    expect(
      joined.participants.map(function mapItem(participant) {
        return participant.playerId;
      }),
    ).toEqual(['player-1', 'player-2']);
    expect(replay).toEqual(joined);
    expect(mutateSpy.mock.calls[0]?.[0].actorPlayerId).toMatch(
      /^join-session-[0-9a-f]{64}$/,
    );
    expect(mutateSpy.mock.calls[0]?.[0].actorPlayerId).not.toContain(
      'guest-session',
    );
    expect(mutateSpy.mock.calls[0]?.[0].actorPlayerId).toBe(
      mutateSpy.mock.calls[1]?.[0].actorPlayerId,
    );
  });

  it('finds the first free player id without parsing unsafe or arbitrary participant suffixes', async function testCase() {
    const seeded = createSnapshot();
    seeded.participants.push(
      {
        playerId: 'player-2',
        sessionId: 'session-2',
        displayName: 'Player 2',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
      {
        playerId: 'player-9007199254740992',
        sessionId: 'session-large',
        displayName: 'Large Player',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
      {
        playerId: 'player-not-a-number',
        sessionId: 'session-arbitrary',
        displayName: 'Arbitrary Player',
        role: 'spectator',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
    );
    repository.seed(seeded);

    const joined = await service.joinRoom(
      'ROOM01',
      { sessionId: 'anonymous-session', nowMs: 1 },
      command(0, 2),
    );
    const playerIds = joined.participants.map(function mapItem(participant) {
      return participant.playerId;
    });

    expect(playerIds).toContain('player-3');
    expect(new Set(playerIds).size).toBe(playerIds.length);
  });

  it('stores party snapshots and validates participant sessions and pokemon values', async function testCase() {
    await createRoom();

    const room = await service.updatePartySnapshot(
      'ROOM01',
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: ' Alpha ',
        competitiveParty: createTestCompetitivePartyInput(),
        nowMs: 50,
      },
      command(0, 2),
    );

    expect(room.partySnapshots['player-1']).toEqual({
      ...createTestPartySnapshot('player-1'),
      displayName: 'Alpha',
      updatedAtMs: 50,
    });
    await expect(
      service.updatePartySnapshot(
        'ROOM01',
        {
          playerId: 'player-1',
          sessionId: 'wrong',
          competitiveParty: createTestCompetitivePartyInput(),
          nowMs: 51,
        },
        command(1, 3),
      ),
    ).rejects.toThrow(BadRequestException);

    const invalidParty = createTestCompetitivePartyInput();
    invalidParty.members[0].currentHp = 35;
    try {
      await service.updatePartySnapshot(
        'ROOM01',
        {
          playerId: 'player-1',
          sessionId: 'session-1',
          competitiveParty: invalidParty,
          nowMs: 52,
        },
        command(1, 4),
      );
      throw new Error('Expected invalid party snapshot to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'POKE_LOUNGE_COMPETITIVE_PARTY_INVALID',
        reason: 'hp-out-of-range',
      });
    }
  });

  it('locks party snapshots after the tournament starts', async function testCase() {
    const tournament = await createTournament();

    try {
      await service.updatePartySnapshot(
        'ROOM01',
        {
          playerId: 'player-1',
          sessionId: 'session-1',
          competitiveParty: createTestCompetitivePartyInput(),
          nowMs: 1_201,
        },
        command(tournament.revision, 50),
      );
      throw new Error('Expected party snapshot lock');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED',
      });
    }
  });

  it('accepts authorized tournament results and starts the next game round', async function testCase() {
    const tournament = await createTournament();
    const firstMatch =
      tournament.tournament.bracket?.currentRound?.matches.find(
        function findItem(match) {
          return match.matchId === tournament.tournament.activeMatchId;
        },
      );
    expect(firstMatch).toBeDefined();
    const firstResultInput = {
      reportingPlayerId: 'player-1',
      reportingSessionId: 'session-1',
      matchId: firstMatch!.matchId,
      winnerPlayerId: 'player-1',
      loserPlayerId: firstMatch!.participantIds.find(
        function findItem(playerId) {
          return playerId !== 'player-1';
        },
      )!,
      reason: 'faint' as const,
      nowMs: 1201,
    };

    const firstCompleted = await service.submitMatchResult(
      'ROOM01',
      firstResultInput,
      command(tournament.revision, 5),
    );

    expect(firstCompleted.status).toBe('tournament');
    publisher.publish.mockClear();
    await expect(
      service.submitMatchResult('ROOM01', firstResultInput, command(999, 5)),
    ).resolves.toEqual(firstCompleted);
    expect(publisher.publish.mock.calls).toHaveLength(0);

    const changedNowMs = await captureConflict(
      service.submitMatchResult(
        'ROOM01',
        { ...firstResultInput, nowMs: 1202 },
        command(firstCompleted.revision, 5),
      ),
    );
    expect(changedNowMs.getResponse()).toMatchObject({
      code: 'POKE_LOUNGE_IDEMPOTENCY_CONFLICT',
      snapshot: { revision: firstCompleted.revision },
    });
    await expect(
      service.submitMatchResult(
        'ROOM01',
        { ...firstResultInput, nowMs: 1202 },
        command(firstCompleted.revision, 6),
      ),
    ).rejects.toThrow(BadRequestException);

    let completed = firstCompleted;
    let commandIndex = 7;
    while (completed.status === 'tournament') {
      const match = completed.tournament.bracket?.currentRound?.matches.find(
        function findItem(candidate) {
          return candidate.matchId === completed.tournament.activeMatchId;
        },
      );
      expect(match).toBeDefined();
      const winnerPlayerId = match!.participantIds[0];
      const loserPlayerId = match!.participantIds[1];
      const reporter = completed.participants.find(
        function findItem(participant) {
          return participant.playerId === winnerPlayerId;
        },
      )!;
      completed = await service.submitMatchResult(
        'ROOM01',
        {
          reportingPlayerId: winnerPlayerId,
          reportingSessionId: reporter.sessionId,
          matchId: match!.matchId,
          winnerPlayerId,
          loserPlayerId,
          reason: 'faint',
          nowMs: 1201 + commandIndex,
        },
        command(completed.revision, commandIndex),
      );
      commandIndex += 1;
    }

    expect(completed).toMatchObject({
      status: 'round-started',
      round: { index: 2, phase: 'round-started' },
      tournament: { bracket: null },
      finalStandings: [],
    });
    expect(Object.keys(completed.tournament.cumulativeScores)).toHaveLength(4);
  });

  it('records a participant leave as a tournament forfeit while other matches continue', async function testCase() {
    const tournament = await createTournament();

    const completed = await service.leaveRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 1300 },
      command(tournament.revision, 6),
    );

    expect(completed).toMatchObject({
      status: 'tournament',
      round: { index: 1, phase: 'tournament' },
      tournament: {
        bracket: { status: 'in-progress' },
        cumulativeScores: {},
      },
    });
    expect(
      completed.tournament.bracket?.currentRound?.matches.find(
        function findItem(match) {
          return match.participantIds.includes('player-1');
        },
      ),
    ).toMatchObject({ status: 'completed', resultReason: 'forfeit' });
  });

  it('removes a preparation leaver while auto-filled AI keep preparation active', async function testCase() {
    await createRoom({ roundDurationMs: 1_000 });
    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 2),
    );
    await updateTestParty('player-1', 'session-1', 1, 50, 20);
    await updateTestParty('player-2', 'session-2', 2, 51, 30);
    await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 100 },
      command(3, 3),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 200 },
      command(4, 4),
    );
    const started = await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 200 },
      command(bothReady.revision, 5),
    );

    const active = await service.leaveRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 300 },
      command(started.revision, 6),
    );

    expect(active).toMatchObject({
      status: 'round-started',
      round: { phase: 'round-started', startedAtMs: 200, endsAtMs: 1_200 },
      tournament: { bracket: null, activeMatchId: null },
    });
    expect(active.participants).toHaveLength(3);
    expect(active.partySnapshots['player-1']).toBeUndefined();
    expect(publisher.publish.mock.calls.at(-1)?.[0].snapshot).toMatchObject({
      hostPlayerId: 'player-2',
    });
  });

  it('converges a casual five-player bye disconnect when that player reaches a later match', async function testCase() {
    const room = createSnapshot();
    room.status = 'tournament';
    room.round.phase = 'tournament';
    room.participants = Array.from({ length: 5 }, function callback(_, index) {
      return {
        playerId: `player-${index + 1}`,
        sessionId: `session-${index + 1}`,
        displayName: `Player ${index + 1}`,
        role: 'participant' as const,
        ready: true,
        connected: true,
        joinedAtMs: index,
      };
    });
    room.partySnapshots = createTestPartySnapshots(
      room.participants.map(function mapItem(participant) {
        return participant.playerId;
      }),
    );
    const bracket = createTournamentBracketState(
      room.participants.map(function mapItem({ playerId, displayName }) {
        return {
          playerId,
          displayName,
        };
      }),
      1,
    );
    room.tournament = {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound!.matches[0].matchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    repository.seed(room);

    const left = await service.leaveRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 5 },
      command(0, 70),
    );
    const afterOpening = await service.submitMatchResult(
      'ROOM01',
      {
        reportingPlayerId: 'player-4',
        reportingSessionId: 'session-4',
        matchId: 'game-round-1-bracket-1-match-1',
        winnerPlayerId: 'player-4',
        loserPlayerId: 'player-5',
        reason: 'faint',
        nowMs: 10,
      },
      command(left.revision, 71),
    );

    expect(afterOpening.tournament).toMatchObject({
      activeMatchId: 'game-round-1-bracket-2-match-2',
      bracket: {
        currentRound: {
          matches: [
            {
              participantIds: ['player-1', 'player-4'],
              status: 'completed',
              winnerPlayerId: 'player-4',
              loserPlayerId: 'player-1',
              resultReason: 'forfeit',
            },
            {
              participantIds: ['player-3', 'player-2'],
              status: 'ready',
            },
          ],
        },
      },
    });

    const afterSemifinal = await service.submitMatchResult(
      'ROOM01',
      {
        reportingPlayerId: 'player-3',
        reportingSessionId: 'session-3',
        matchId: afterOpening.tournament.activeMatchId!,
        winnerPlayerId: 'player-3',
        loserPlayerId: 'player-2',
        reason: 'faint',
        nowMs: 20,
      },
      command(afterOpening.revision, 72),
    );
    const completed = await service.submitMatchResult(
      'ROOM01',
      {
        reportingPlayerId: 'player-4',
        reportingSessionId: 'session-4',
        matchId: afterSemifinal.tournament.activeMatchId!,
        winnerPlayerId: 'player-4',
        loserPlayerId: 'player-3',
        reason: 'faint',
        nowMs: 30,
      },
      command(afterSemifinal.revision, 73),
    );

    expect(completed).toMatchObject({
      status: 'round-started',
      round: { index: 2, phase: 'round-started' },
      tournament: {
        activeMatchId: null,
        bracket: null,
        cumulativeScores: {
          'player-1': 100,
          'player-2': 100,
          'player-3': 100,
          'player-4': 100,
          'player-5': 100,
        },
      },
    });
  });

  it('rejects casual results for a server-authoritative active match', async function testCase() {
    const tournament = await createTournament();
    tournament.tournament.activeMatchAuthority = 'server';
    repository.seed(tournament);

    await expect(
      service.submitMatchResult(
        'ROOM01',
        {
          reportingPlayerId: 'player-1',
          reportingSessionId: 'session-1',
          matchId: tournament.tournament.activeMatchId!,
          winnerPlayerId: 'player-1',
          loserPlayerId: 'player-2',
          reason: 'faint',
          nowMs: 1201,
        },
        command(tournament.revision, 50),
      ),
    ).rejects.toThrow(
      'Server-authoritative matches only accept competitive actions',
    );
  });

  it('returns fully redacted current snapshots for stale revisions', async function testCase() {
    await createRoom();

    const error = await captureConflict(
      service.joinRoom(
        'ROOM01',
        { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
        command(99, 2),
      ),
    );
    const response = error.getResponse() as {
      statusCode: number;
      code: string;
      message: string;
      snapshot: { roomCode: string; revision: number; expiresAtMs: number };
    };

    expect(response).toMatchObject({
      statusCode: 409,
      code: 'POKE_LOUNGE_REVISION_CONFLICT',
      message: 'Poke Lounge room revision conflict',
      snapshot: {
        roomCode: 'ROOM01',
        revision: 0,
      },
    });
    expect(typeof response.snapshot.expiresAtMs).toBe('number');
    expect(JSON.stringify(response)).not.toContain('session-1');
    expect(JSON.stringify(response)).not.toContain('sessionId');
  });

  it('replays an identical command but rejects changed auth or domain input under the same key', async function testCase() {
    await createRoom();
    const first = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', displayName: 'Beta' },
      command(0, 2),
    );

    publisher.publish.mockClear();
    currentTimeMs = 500;
    const replay = await service.joinRoom(
      'room01',
      { playerId: 'player-2', sessionId: 'session-2', displayName: 'Beta' },
      command(999, 2),
    );

    expect(replay).toEqual(first);
    expect(publisher.publish.mock.calls).toHaveLength(0);

    const error = await captureConflict(
      service.joinRoom(
        'ROOM01',
        {
          playerId: 'player-2',
          sessionId: 'changed-session',
          displayName: 'Beta',
        },
        command(first.revision, 2),
      ),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'POKE_LOUNGE_IDEMPOTENCY_CONFLICT',
      snapshot: { revision: first.revision },
    });
  });

  it('preserves a committed command snapshot when the room advances before enrichment', async function testCase() {
    const revisionOne = {
      ...createSnapshot(),
      revision: 1,
      updatedAtMs: 1,
      competitiveTransitions: [
        {
          terminalEventId: '00000000-0000-4000-8000-000000000001',
          terminalRoomRevision: 1,
          projection: { matchId: 'completed-match-1' },
        },
      ],
    } as unknown as PokeLoungeRoomSnapshot;
    const revisionTwo = {
      ...revisionOne,
      revision: 2,
      updatedAtMs: 2,
      competitive: { matchId: 'match-2' },
      competitiveTransitions: [],
    } as unknown as PokeLoungeRoomSnapshot;
    jest.spyOn(repository, 'mutate').mockResolvedValueOnce({
      snapshot: revisionOne,
      outcome: 'committed',
      committedChange: true,
    });
    competitiveProjection.findRoomSnapshot.mockResolvedValueOnce(revisionTwo);

    const committed = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2' },
      command(0, 20),
    );

    expect(committed).toEqual(revisionOne);
    expect(publisher.publish.mock.calls).toHaveLength(1);
    expect(publisher.publish.mock.calls[0][0].snapshot).toMatchObject({
      revision: 2,
      updatedAtMs: 2,
      competitiveTransitions: [
        {
          terminalEventId: '00000000-0000-4000-8000-000000000001',
          projection: { matchId: 'completed-match-1' },
        },
      ],
      competitive: { matchId: 'match-2' },
    });

    jest.spyOn(repository, 'mutate').mockResolvedValueOnce({
      snapshot: revisionOne,
      outcome: 'replayed',
      committedChange: false,
    });
    publisher.publish.mockClear();
    competitiveProjection.findRoomSnapshot.mockClear();
    competitiveProjection.findRoomSnapshot.mockResolvedValue(revisionTwo);

    const replay = await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2' },
      command(999, 20),
    );

    expect(replay).toEqual(revisionOne);
    expect(competitiveProjection.findRoomSnapshot.mock.calls).toHaveLength(0);
    expect(publisher.publish.mock.calls).toHaveLength(0);

    jest.spyOn(repository, 'getAndAdvance').mockResolvedValueOnce({
      snapshot: revisionTwo,
      committedChange: false,
    });
    const latest = await service.getRoom('ROOM01');

    expect(latest).toEqual(revisionTwo);
    expect(publisher.publish.mock.calls).toHaveLength(0);
  });

  it('hashes explicit nowMs but keeps omitted nowMs stable across server clock changes', async function testCase() {
    const createSpy = jest.spyOn(repository, 'create');

    await createRoom({ nowMs: undefined });
    const firstHash = createSpy.mock.calls[0][0].requestHash;
    currentTimeMs = 1000;
    await service.createRoom(
      { playerId: 'player-1', sessionId: 'session-1' },
      command(0, 1),
    );
    const replayHash = createSpy.mock.calls[1][0].requestHash;
    await service
      .createRoom(
        { playerId: 'player-1', sessionId: 'session-1', nowMs: 1000 },
        command(0, 1),
      )
      .catch(function handleRejected() {
        return undefined;
      });
    const explicitHash = createSpy.mock.calls[2][0].requestHash;

    expect(replayHash).toBe(firstHash);
    expect(explicitHash).not.toBe(firstHash);
  });

  it('publishes after repository resolution and swallows publisher failures', async function testCase() {
    let resolveCreate:
      | ((
          value: Awaited<ReturnType<PokeLoungeRoomRepository['create']>>,
        ) => void)
      | undefined;
    const createPromise = new Promise<
      Awaited<ReturnType<PokeLoungeRoomRepository['create']>>
    >(function resolvePromise(resolve) {
      resolveCreate = resolve;
    });
    const deferredRepository = {
      ...repository,
      create: jest.fn(function mockFunction() {
        return createPromise;
      }),
    } as unknown as PokeLoungeRoomRepository;
    const deferredService = new PokeLoungeRoomService(
      deferredRepository,
      publisher,
      competitiveProjection as never,
      function callback() {
        return 'ROOM01';
      },
      function callback() {
        return 0;
      },
    );
    const pending = deferredService.createRoom(
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 0 },
      command(0, 1),
    );

    await Promise.resolve();
    expect(publisher.publish.mock.calls).toHaveLength(0);

    const committed = await repository.create({
      room: createSnapshot(),
      actorPlayerId: 'player-1',
      idempotencyKey: command(0, 1).idempotencyKey,
      requestHash: 'hash',
      nowMs: 0,
    });
    resolveCreate?.(committed);
    await pending;
    expect(publisher.publish.mock.calls).toHaveLength(1);

    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(function mockImplementation() {
        return undefined;
      });
    publisher.publish.mockRejectedValueOnce(new Error('publisher unavailable'));
    roomCodes = ['ROOM02'];
    await expect(
      service.createRoom(
        { playerId: 'player-2', sessionId: 'session-2', nowMs: 1 },
        command(0, 2),
      ),
    ).resolves.toMatchObject({ roomCode: 'ROOM02' });
    expect(loggerError.mock.calls[0]?.[0]).toContain('ROOM02');
    expect(loggerError.mock.calls[0]?.[1]).toContain('publisher unavailable');
    currentTimeMs = 1;
    await expect(service.getRoom('ROOM02')).resolves.toMatchObject({
      roomCode: 'ROOM02',
      revision: 0,
    });
    await expect(
      service.authorizeSubscription('ROOM02', 'player-2', 'session-2'),
    ).resolves.toMatchObject({ roomCode: 'ROOM02', revision: 0 });
    loggerError.mockRestore();
  });

  it('returns not found for expired repository state', async function testCase() {
    await createRoom({ nowMs: 0 });

    currentTimeMs = 30 * 60_000 + 1;
    await expect(service.getRoom('ROOM01')).rejects.toThrow(NotFoundException);
  });

  async function createRoom(
    input: Partial<{
      playerId: string;
      sessionId: string;
      roundDurationMs: number;
      nowMs: number | undefined;
    }> = {},
  ) {
    return service.createRoom(
      {
        playerId: input.playerId ?? 'player-1',
        sessionId: input.sessionId ?? 'session-1',
        roundDurationMs: input.roundDurationMs,
        ...(Object.prototype.hasOwnProperty.call(input, 'nowMs')
          ? { nowMs: input.nowMs }
          : { nowMs: 0 }),
      },
      command(0, 1),
    );
  }

  async function createTournament() {
    await createRoom({ roundDurationMs: 1000 });
    await service.joinRoom(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', nowMs: 10 },
      command(0, 2),
    );
    await updateTestParty('player-1', 'session-1', 1, 40, 20);
    await updateTestParty('player-2', 'session-2', 2, 41, 30);
    await service.setReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', ready: true, nowMs: 100 },
      command(3, 3),
    );
    const bothReady = await service.setReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', ready: true, nowMs: 200 },
      command(4, 4),
    );
    await service.startRoom(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', nowMs: 200 },
      command(bothReady.revision, 99),
    );

    currentTimeMs = 1200;
    await service.setRoundReady(
      'ROOM01',
      { playerId: 'player-1', sessionId: 'session-1', roundIndex: 1 },
      roundCommand(100),
    );
    return service.setRoundReady(
      'ROOM01',
      { playerId: 'player-2', sessionId: 'session-2', roundIndex: 1 },
      roundCommand(101),
    );
  }

  function updateTestParty(
    playerId: string,
    sessionId: string,
    expectedRevision: number,
    commandIndex: number,
    nowMs: number,
  ) {
    return service.updatePartySnapshot(
      'ROOM01',
      {
        playerId,
        sessionId,
        competitiveParty: createTestCompetitivePartyInput(),
        nowMs,
      },
      command(expectedRevision, commandIndex),
    );
  }
});

function command(expectedRevision: number, index: number) {
  return {
    expectedRevision,
    idempotencyKey: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

function roundCommand(index: number) {
  return {
    idempotencyKey: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
}

function createSnapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    visibility: 'private',
    status: 'waiting' as const,
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        displayName: 'Player 1',
        role: 'participant' as const,
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
    ],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting' as const,
      durationMs: 1000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2 as const,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
    revision: 0,
    expiresAtMs: 30 * 60_000,
  };
}

function expectPublicEvent(
  publisher: jest.Mocked<PokeLoungeRoomEventPublisher>,
  type: 'room-created' | 'room-updated' | 'room-clock-advanced',
  room: PokeLoungeRoomSnapshot,
): void {
  const [event] = publisher.publish.mock.calls.at(-1) ?? [];

  expect(event).toMatchObject({
    type,
    snapshot: {
      roomCode: room.roomCode,
      revision: room.revision,
      expiresAtMs: room.expiresAtMs,
    },
  });
  expect(JSON.stringify(event)).not.toContain('session-1');
  expect(JSON.stringify(event)).not.toContain('session-2');
  expect(JSON.stringify(event)).not.toContain('sessionId');
}

async function captureConflict(
  promise: Promise<unknown>,
): Promise<ConflictException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return error as ConflictException;
  }

  throw new Error('Expected a conflict');
}

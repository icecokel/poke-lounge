import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { createTestCompetitivePartyInput } from '../../test/support/competitive-party.fixture';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import type { PokeLoungeRoomService } from './poke-lounge-room.service';
import type { CompetitiveMatchService } from './competitive/competitive-match.service';
import { PokeLoungeController } from './poke-lounge.controller';
import type { PokeLoungeRomDataService } from './poke-lounge-rom-data.service';

const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000001';

describe('PokeLoungeController', function testSuite() {
  let service: jest.Mocked<PokeLoungeRoomService>;
  let competitiveService: jest.Mocked<CompetitiveMatchService>;
  let romDataService: jest.Mocked<PokeLoungeRomDataService>;
  let controller: PokeLoungeController;

  beforeEach(function setUpTest() {
    service = {
      createRoom: jest.fn().mockResolvedValue(snapshot()),
      quickPlay: jest.fn().mockResolvedValue({
        ...snapshot(),
        visibility: 'public',
      }),
      getRoom: jest.fn().mockResolvedValue(snapshot()),
      joinRoom: jest.fn().mockResolvedValue(snapshot()),
      setReady: jest.fn().mockResolvedValue(snapshot()),
      setRoundReady: jest.fn().mockResolvedValue(snapshot()),
      startRoom: jest.fn().mockResolvedValue(snapshot()),
      updatePartySnapshot: jest.fn().mockResolvedValue(snapshot()),
      submitMatchResult: jest.fn().mockResolvedValue(snapshot()),
      leaveRoom: jest.fn().mockResolvedValue(snapshot()),
    } as unknown as jest.Mocked<PokeLoungeRoomService>;
    competitiveService = {
      bindSeat: jest.fn().mockResolvedValue(null),
      submitAction: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
      submitSessionAction: jest.fn().mockResolvedValue({ matchId: 'match-1' }),
    } as unknown as jest.Mocked<CompetitiveMatchService>;
    romDataService = {
      getRuntimeData: jest.fn().mockResolvedValue({ documents: [] }),
      getShopItemIds: jest
        .fn()
        .mockImplementation(function mockImplementation(shopKind) {
          return Promise.resolve(shopKind === 'basic' ? [17] : [80]);
        }),
    } as unknown as jest.Mocked<PokeLoungeRomDataService>;
    controller = new PokeLoungeController(
      service,
      competitiveService,
      romDataService,
    );
  });

  it('serves ROM data without an authentication guard', async function testCase() {
    await expect(controller.getRomData()).resolves.toEqual({ documents: [] });
    expect(romDataService.getRuntimeData.mock.calls).toHaveLength(1);

    const descriptor = Object.getOwnPropertyDescriptor(
      PokeLoungeController.prototype,
      'getRomData',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, descriptor?.value as object),
    ).toBeUndefined();
  });

  it.each([
    [
      'basic',
      function callback() {
        return controller.getBasicShopItemIds();
      },
      'getBasicShopItemIds',
      [17],
    ],
    [
      'premium',
      function callback() {
        return controller.getPremiumShopItemIds();
      },
      'getPremiumShopItemIds',
      [80],
    ],
  ] as const)(
    'serves the %s shop catalog from its own route',
    async function callback(shopKind, requestShopItems, method, expected) {
      await expect(requestShopItems()).resolves.toEqual(expected);
      expect(romDataService.getShopItemIds.mock.calls).toContainEqual([
        shopKind,
      ]);

      const descriptor = Object.getOwnPropertyDescriptor(
        PokeLoungeController.prototype,
        method,
      );
      expect(
        Reflect.getMetadata(GUARDS_METADATA, descriptor?.value as object),
      ).toBeUndefined();
    },
  );

  it('requires one canonical UUID v4 and one non-negative safe revision on revision-controlled POSTs', async function testCase() {
    const cases = [
      function callback() {
        return controller.createRoom({ sessionId: 'session-a' }, request());
      },
      function callback() {
        return controller.joinRoom(
          'ROOM01',
          { playerId: 'player-b', sessionId: 'session-b' },
          request(),
        );
      },
      function callback() {
        return controller.setReady(
          'ROOM01',
          { playerId: 'player-a', sessionId: 'session-a', ready: true },
          request(),
        );
      },
      function callback() {
        return controller.startRoom(
          'ROOM01',
          { playerId: 'player-a', sessionId: 'session-a' },
          request(),
        );
      },
      function callback() {
        return controller.updatePartySnapshot(
          'ROOM01',
          {
            playerId: 'player-a',
            sessionId: 'session-a',
            competitiveParty: createTestCompetitivePartyInput(),
          },
          request(),
        );
      },
      function callback() {
        return controller.submitResult(
          'ROOM01',
          {
            reportingPlayerId: 'player-a',
            reportingSessionId: 'session-a',
            matchId: 'match-1',
            winnerPlayerId: 'player-a',
            loserPlayerId: 'player-b',
            reason: 'faint',
          },
          request(),
        );
      },
      function callback() {
        return controller.leaveRoom(
          'ROOM01',
          { playerId: 'player-a', sessionId: 'session-a' },
          request(),
        );
      },
    ];

    for (const invoke of cases) {
      await expect(invoke()).rejects.toThrow(BadRequestException);
    }

    expect(service.createRoom.mock.calls).toHaveLength(0);
    expect(service.joinRoom.mock.calls).toHaveLength(0);
    expect(service.setReady.mock.calls).toHaveLength(0);
    expect(service.startRoom.mock.calls).toHaveLength(0);
    expect(service.updatePartySnapshot.mock.calls).toHaveLength(0);
    expect(service.submitMatchResult.mock.calls).toHaveLength(0);
    expect(service.leaveRoom.mock.calls).toHaveLength(0);
  });

  it('accepts round readiness with idempotency metadata and no revision header', async function testCase() {
    await controller.setRoundReady(
      'ROOM01',
      { playerId: 'player-a', sessionId: 'session-a', roundIndex: 1 },
      request(['X-Idempotency-Key', IDEMPOTENCY_KEY]),
    );

    expect(service.setRoundReady.mock.calls[0]).toEqual([
      'ROOM01',
      { playerId: 'player-a', sessionId: 'session-a', roundIndex: 1 },
      { idempotencyKey: IDEMPOTENCY_KEY },
    ]);
  });

  it('starts quick play with idempotency metadata and no revision header', async function testCase() {
    await controller.quickPlay(
      { playerId: 'player-a', sessionId: 'session-a' },
      request(['X-Idempotency-Key', IDEMPOTENCY_KEY]),
    );

    expect(service.quickPlay.mock.calls[0]).toEqual([
      { playerId: 'player-a', sessionId: 'session-a' },
      { idempotencyKey: IDEMPOTENCY_KEY },
      { requireSocketAcknowledgement: true },
    ]);
  });

  it.each([
    ['not-a-uuid', '0'],
    ['00000000-0000-3000-8000-000000000001', '0'],
    ['00000000-0000-4000-7000-000000000001', '0'],
    ['00000000-0000-4000-8000-00000000000a'.toUpperCase(), '0'],
    [IDEMPOTENCY_KEY, '-1'],
    [IDEMPOTENCY_KEY, '+1'],
    [IDEMPOTENCY_KEY, '1.0'],
    [IDEMPOTENCY_KEY, '01'],
    [IDEMPOTENCY_KEY, String(Number.MAX_SAFE_INTEGER + 1)],
  ])(
    'rejects malformed command headers (%s, %s)',
    async function callback(key, revision) {
      await expect(
        controller.joinRoom(
          'ROOM01',
          { playerId: 'player-b', sessionId: 'session-b' },
          request(['X-Idempotency-Key', key, 'If-Match-Revision', revision]),
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('rejects duplicate raw command headers even when Node could join them', async function testCase() {
    await expect(
      controller.joinRoom(
        'ROOM01',
        { playerId: 'player-b', sessionId: 'session-b' },
        request([
          'X-Idempotency-Key',
          IDEMPOTENCY_KEY,
          'x-idempotency-key',
          '00000000-0000-4000-8000-000000000002',
          'If-Match-Revision',
          '0',
        ]),
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.joinRoom(
        'ROOM01',
        { playerId: 'player-b', sessionId: 'session-b' },
        request([
          'X-Idempotency-Key',
          IDEMPOTENCY_KEY,
          'If-Match-Revision',
          '0',
          'if-match-revision',
          '1',
        ]),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires creation revision zero and forwards validated command metadata', async function testCase() {
    await expect(
      controller.createRoom(
        { playerId: 'player-a', sessionId: 'session-a' },
        commandRequest(1),
      ),
    ).rejects.toThrow(BadRequestException);

    await controller.createRoom(
      { playerId: 'player-a', sessionId: 'session-a' },
      commandRequest(0),
    );

    expect(service.createRoom.mock.calls).toContainEqual([
      { playerId: 'player-a', sessionId: 'session-a' },
      { idempotencyKey: IDEMPOTENCY_KEY, expectedRevision: 0 },
      { requireSocketAcknowledgement: true },
    ]);
  });

  it('forwards the latest revision metadata to all existing-room commands', async function testCase() {
    const rawRequest = commandRequest(7);

    await controller.joinRoom(
      'ROOM01',
      { playerId: 'player-b', sessionId: 'session-b' },
      rawRequest,
    );
    await controller.setReady(
      'ROOM01',
      { playerId: 'player-a', sessionId: 'session-a', ready: true },
      rawRequest,
    );
    await controller.startRoom(
      'ROOM01',
      { playerId: 'player-a', sessionId: 'session-a' },
      rawRequest,
    );
    await controller.updatePartySnapshot(
      'ROOM01',
      {
        playerId: 'player-a',
        sessionId: 'session-a',
        competitiveParty: createTestCompetitivePartyInput(),
      },
      rawRequest,
    );
    await controller.submitResult(
      'ROOM01',
      {
        reportingPlayerId: 'player-a',
        reportingSessionId: 'session-a',
        matchId: 'match-1',
        winnerPlayerId: 'player-a',
        loserPlayerId: 'player-b',
        reason: 'faint',
      },
      rawRequest,
    );
    await controller.leaveRoom(
      'ROOM01',
      { playerId: 'player-a', sessionId: 'session-a' },
      rawRequest,
    );

    for (const calls of [
      service.joinRoom.mock.calls,
      service.setReady.mock.calls,
      service.startRoom.mock.calls,
      service.updatePartySnapshot.mock.calls,
      service.submitMatchResult.mock.calls,
      service.leaveRoom.mock.calls,
    ]) {
      expect(calls[0]?.[0]).toBe('ROOM01');
      expect(calls[0]?.[2]).toEqual({
        idempotencyKey: IDEMPOTENCY_KEY,
        expectedRevision: 7,
      });
    }
  });

  it('preserves an omitted join playerId for the service to assign inside the locked room', async function testCase() {
    await controller.joinRoom(
      'ROOM01',
      { sessionId: 'session-b' },
      commandRequest(3),
    );

    expect(service.joinRoom.mock.calls).toContainEqual([
      'ROOM01',
      { sessionId: 'session-b' },
      { idempotencyKey: IDEMPOTENCY_KEY, expectedRevision: 3 },
      { requireSocketAcknowledgement: true },
    ]);
  });

  it('never forwards client-provided mutation clocks to the room service', async function testCase() {
    const clientNowMs = 253_402_300_800_000;
    const rawRequest = commandRequest(0);

    await controller.createRoom(
      withClientNowMs(
        { playerId: 'player-a', sessionId: 'session-a' },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.joinRoom(
      'ROOM01',
      withClientNowMs(
        { playerId: 'player-b', sessionId: 'session-b' },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.setReady(
      'ROOM01',
      withClientNowMs(
        {
          playerId: 'player-a',
          sessionId: 'session-a',
          ready: true,
        },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.startRoom(
      'ROOM01',
      withClientNowMs(
        { playerId: 'player-a', sessionId: 'session-a' },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.updatePartySnapshot(
      'ROOM01',
      withClientNowMs(
        {
          playerId: 'player-a',
          sessionId: 'session-a',
          competitiveParty: createTestCompetitivePartyInput(),
        },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.submitResult(
      'ROOM01',
      withClientNowMs(
        {
          reportingPlayerId: 'player-a',
          reportingSessionId: 'session-a',
          matchId: 'match-1',
          winnerPlayerId: 'player-a',
          loserPlayerId: 'player-b',
          reason: 'faint' as const,
        },
        clientNowMs,
      ),
      rawRequest,
    );
    await controller.leaveRoom(
      'ROOM01',
      withClientNowMs(
        { playerId: 'player-a', sessionId: 'session-a' },
        clientNowMs,
      ),
      rawRequest,
    );

    for (const input of [
      service.createRoom.mock.calls[0]?.[0],
      service.joinRoom.mock.calls[0]?.[1],
      service.setReady.mock.calls[0]?.[1],
      service.startRoom.mock.calls[0]?.[1],
      service.updatePartySnapshot.mock.calls[0]?.[1],
      service.submitMatchResult.mock.calls[0]?.[1],
      service.leaveRoom.mock.calls[0]?.[1],
    ]) {
      expect(input).not.toHaveProperty('nowMs');
    }
  });

  it('redacts session ids while retaining revision and expiry in public responses', async function testCase() {
    const response = await controller.getRoom('ROOM01');

    expect(response).toMatchObject({
      roomCode: 'ROOM01',
      revision: 3,
      expiresAtMs: 30 * 60_000,
      participants: [{ playerId: 'player-a' }],
    });
    expect(JSON.stringify(response)).not.toContain('session-a');
    expect(JSON.stringify(response)).not.toContain('sessionId');
  });

  it('binds a competitive seat from req.user.id without accepting an actor id', async function testCase() {
    await controller.bindCompetitiveSeat('room01', { sessionId: 'session-a' }, {
      user: { id: 'account-a' },
    } as never);

    expect(competitiveService.bindSeat.mock.calls[0]).toEqual([
      'room01',
      'session-a',
      'account-a',
    ]);
  });

  it('guards competitive seat binding with GoogleAuthGuard', function testCase() {
    const descriptor = Object.getOwnPropertyDescriptor(
      PokeLoungeController.prototype,
      'bindCompetitiveSeat',
    );
    expect(descriptor?.value).toBeDefined();
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      descriptor?.value as object,
    ) as unknown[];
    expect(guards).toContain(GoogleAuthGuard);
  });

  it('submits a competitive action with req.user.id as the only actor source', async function testCase() {
    await controller.submitCompetitiveAction(
      'room01',
      '00000000-0000-4000-8000-000000000010',
      {
        assignmentRevision: 1,
        turn: 0,
        clientCommandId: '00000000-0000-4000-8000-000000000001',
        action: { kind: 'move', moveId: 55 },
      },
      { user: { id: 'account-a' } } as never,
    );

    expect(competitiveService.submitAction.mock.calls[0]?.[0]).toMatchObject({
      roomCode: 'ROOM01',
      matchId: '00000000-0000-4000-8000-000000000010',
      accountId: 'account-a',
    });
  });

  it('guards competitive action submission with GoogleAuthGuard', function testCase() {
    const descriptor = Object.getOwnPropertyDescriptor(
      PokeLoungeController.prototype,
      'submitCompetitiveAction',
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      descriptor?.value as object,
    ) as unknown[];
    expect(guards).toContain(GoogleAuthGuard);
  });

  it('submits a password-room action with only its private session identity', async function testCase() {
    await controller.submitSessionCompetitiveAction(
      'room01',
      '00000000-0000-4000-8000-000000000010',
      {
        sessionId: 'session-a',
        assignmentRevision: 1,
        turn: 0,
        clientCommandId: '00000000-0000-4000-8000-000000000001',
        action: { kind: 'move', moveId: 55 },
      },
    );

    expect(
      competitiveService.submitSessionAction.mock.calls[0]?.[0],
    ).toMatchObject({
      roomCode: 'ROOM01',
      matchId: '00000000-0000-4000-8000-000000000010',
      sessionId: 'session-a',
    });
  });

  it('rejects malformed competitive match ids before calling the service', async function testCase() {
    await expect(
      controller.submitCompetitiveAction(
        ' room01 ',
        'not-a-uuid',
        {
          assignmentRevision: 1,
          turn: 0,
          clientCommandId: '00000000-0000-4000-8000-000000000001',
          action: { kind: 'move', moveId: 55 },
        },
        { user: { id: 'account-a' } } as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(competitiveService.submitAction.mock.calls).toHaveLength(0);
  });

  it('documents the legacy room result endpoint as casual and unverified', function testCase() {
    const descriptor = Object.getOwnPropertyDescriptor(
      PokeLoungeController.prototype,
      'submitResult',
    );
    const operation = Reflect.getMetadata(
      'swagger/apiOperation',
      descriptor?.value as object,
    ) as { summary?: string; description?: string };

    expect(operation.summary).toContain('casual');
    expect(operation.description).toContain('unverified');
    expect(operation.description).toContain('ranking');
  });

  it('validates the optional REST recovery revision cursor', async function testCase() {
    const getRoom = (
      controller as unknown as {
        getRoom(roomCode: string, afterRevision?: string): Promise<unknown>;
      }
    ).getRoom.bind(controller);

    await expect(getRoom('ROOM01', '7')).resolves.toBeDefined();
    expect(service.getRoom.mock.calls.at(-1)).toEqual(['ROOM01', 7]);

    for (const value of [
      '-1',
      '+1',
      '1.0',
      '01',
      String(Number.MAX_SAFE_INTEGER + 1),
    ]) {
      await expect(getRoom('ROOM01', value)).rejects.toThrow(
        BadRequestException,
      );
    }

    await expect(getRoom('ROOM01')).resolves.toBeDefined();
    expect(service.getRoom.mock.calls.at(-1)).toEqual(['ROOM01', undefined]);
  });
});

function withClientNowMs<T extends object>(input: T, nowMs: number): T {
  return { ...input, nowMs };
}

function commandRequest(revision: number): Request {
  return request([
    'X-Idempotency-Key',
    IDEMPOTENCY_KEY,
    'If-Match-Revision',
    String(revision),
  ]);
}

function request(rawHeaders: string[] = []): Request {
  return { rawHeaders } as Request;
}

function snapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    visibility: 'private',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
        sessionId: 'session-a',
        playerId: 'player-a',
        userId: 'private-account-a',
        displayName: 'Player A',
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
    revision: 3,
    expiresAtMs: 30 * 60_000,
  };
}

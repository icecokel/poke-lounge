import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { GoogleAuthGuard } from '../src/auth/google-auth.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { CompetitiveMatchService } from '../src/poke-lounge/competitive/competitive-match.service';
import { PokeLoungeController } from '../src/poke-lounge/poke-lounge.controller';
import type { PokeLoungeRoomSnapshot } from '../src/poke-lounge/poke-lounge-room.repository';
import { PokeLoungeRoomService } from '../src/poke-lounge/poke-lounge-room.service';
import { PokeLoungeRomDataService } from '../src/poke-lounge/poke-lounge-rom-data.service';
import { createTestCompetitivePartyInput } from './support/competitive-party.fixture';

const idempotencyKey = '00000000-0000-4000-8000-000000000001';
const roomSnapshot: PokeLoungeRoomSnapshot = {
  roomCode: 'ROOM01',
  visibility: 'private',
  status: 'waiting',
  createdAtMs: 0,
  updatedAtMs: 0,
  participants: [],
  partySnapshots: {},
  round: {
    index: 1,
    phase: 'waiting',
    durationMs: 60_000,
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
  revision: 4,
  expiresAtMs: 1_800_000,
};

const invalidMutations = [
  {
    name: 'create',
    path: '/poke-lounge/rooms',
    body: { sessionId: 'session-a', unexpected: true },
  },
  {
    name: 'join',
    path: '/poke-lounge/rooms/ROOM01/join',
    body: { sessionId: 123 },
  },
  {
    name: 'ready',
    path: '/poke-lounge/rooms/ROOM01/ready',
    body: {
      playerId: 'player-a',
      sessionId: 'session-a',
      ready: 'false',
    },
  },
  {
    name: 'start',
    path: '/poke-lounge/rooms/ROOM01/start',
    body: { playerId: 'player-a', sessionId: 123 },
  },
  {
    name: 'party snapshot',
    path: '/poke-lounge/rooms/ROOM01/party-snapshot',
    body: {
      playerId: 'player-a',
      sessionId: 'session-a',
      competitiveParty: {
        ...createTestCompetitivePartyInput(),
        members: createTestCompetitivePartyInput().members.map(
          function mapItem(member) {
            return {
              ...member,
              maxHp: 999,
            };
          },
        ),
      },
    },
  },
  {
    name: 'result',
    path: '/poke-lounge/rooms/ROOM01/result',
    body: {
      reportingPlayerId: 'player-a',
      reportingSessionId: 'session-a',
      matchId: 'match-1',
      winnerPlayerId: 'player-a',
      loserPlayerId: 'player-b',
      reason: 'draw',
    },
  },
  {
    name: 'leave',
    path: '/poke-lounge/rooms/ROOM01/leave',
    body: { playerId: 'player-a', sessionId: 123 },
  },
] as const;

const createRoomServiceMock = () => ({
  createRoom: jest.fn().mockResolvedValue(roomSnapshot),
  quickPlay: jest.fn().mockResolvedValue({
    ...roomSnapshot,
    visibility: 'public',
  }),
  getRoom: jest.fn().mockResolvedValue(roomSnapshot),
  joinRoom: jest.fn().mockResolvedValue(roomSnapshot),
  setReady: jest.fn().mockResolvedValue(roomSnapshot),
  startRoom: jest.fn().mockResolvedValue(roomSnapshot),
  updatePartySnapshot: jest.fn().mockResolvedValue(roomSnapshot),
  submitMatchResult: jest.fn().mockResolvedValue(roomSnapshot),
  leaveRoom: jest.fn().mockResolvedValue(roomSnapshot),
});

type ValidationErrorResponse = {
  message?: unknown;
  path?: string;
  statusCode?: number;
  success?: boolean;
};

describe('Poke Lounge request validation (e2e)', function testSuite() {
  let app: INestApplication;
  let httpServer: Server;
  let roomService: ReturnType<typeof createRoomServiceMock>;

  beforeEach(async function setUpTest() {
    roomService = createRoomServiceMock();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PokeLoungeController],
      providers: [
        {
          provide: PokeLoungeRoomService,
          useValue: roomService,
        },
        {
          provide: CompetitiveMatchService,
          useValue: { bindSeat: jest.fn(), submitAction: jest.fn() },
        },
        {
          provide: PokeLoungeRomDataService,
          useValue: { getRuntimeData: jest.fn() },
        },
      ],
    })
      .overrideGuard(GoogleAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async function tearDownTest() {
    await app.close();
  });

  it.each(invalidMutations)(
    'rejects malformed $name bodies before calling room services',
    async function callback({ path, body }) {
      const response = await request(httpServer)
        .post(path)
        .set(commandHeaders(0))
        .send(body)
        .expect(400);
      const responseBody = response.body as ValidationErrorResponse;

      expect(responseBody).toMatchObject({
        success: false,
        statusCode: 400,
        path,
      });
      expect(responseBody.message).toEqual(expect.any(Array));

      for (const mutation of [
        roomService.createRoom,
        roomService.joinRoom,
        roomService.setReady,
        roomService.startRoom,
        roomService.updatePartySnapshot,
        roomService.submitMatchResult,
        roomService.leaveRoom,
      ]) {
        expect(mutation).not.toHaveBeenCalled();
      }
    },
  );

  it('passes a valid false ready value to the service without coercion', async function testCase() {
    await request(httpServer)
      .post('/poke-lounge/rooms/ROOM01/ready')
      .set(commandHeaders(3))
      .send({
        playerId: 'player-a',
        sessionId: 'session-a',
        ready: false,
      })
      .expect(201);

    expect(roomService.setReady).toHaveBeenCalledWith(
      'ROOM01',
      {
        playerId: 'player-a',
        sessionId: 'session-a',
        ready: false,
      },
      {
        idempotencyKey,
        expectedRevision: 3,
      },
    );
  });
});

const commandHeaders = (revision: number) => ({
  'X-Idempotency-Key': idempotencyKey,
  'If-Match-Revision': String(revision),
});

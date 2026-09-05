import {
  type ExecutionContext,
  type INestApplication,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, type Repository } from 'typeorm';
import request from 'supertest';
import type { Server } from 'node:http';
import { User } from './entities/user.entity';
import { LocalTestAuthGuard } from './local-test-auth.guard';
import { LOCAL_TEST_ACCOUNT_PROFILE } from './local-test-account';
import { GameController } from '../game/game.controller';
import { GameService } from '../game/game.service';
import { PokeLoungeController } from '../poke-lounge/poke-lounge.controller';
import { PokeLoungeRoomService } from '../poke-lounge/poke-lounge-room.service';
import { PokeLoungeRomDataService } from '../poke-lounge/poke-lounge-rom-data.service';
import { CompetitiveMatchService } from '../poke-lounge/competitive/competitive-match.service';

const TOKEN = 'local_test_auth_token_0123456789abcdef';
type TestRequest = {
  headers: { authorization?: string };
  method: string;
  path: string;
  body?: unknown;
  user?: User;
};

function contextFor(req: TestRequest): ExecutionContext {
  return {
    switchToHttp: function switchToHttp() {
      return {
        getRequest: function getRequest() {
          return req;
        },
      };
    },
  } as ExecutionContext;
}

function localRequest(overrides: Partial<TestRequest> = {}): TestRequest {
  return {
    headers: { authorization: `Bearer ${TOKEN}` },
    method: 'GET',
    path: '/game/poke-lounge/state',
    ...overrides,
  };
}

function createRepository() {
  return {
    findOne: jest.fn<Promise<User | null>, [unknown]>(),
    create: jest.fn<User, [Partial<User>]>(),
    save: jest.fn<Promise<User>, [User]>(),
  };
}

function dbFailure(code: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('database failed'), { code }),
  );
}

describe('LocalTestAuthGuard', function testSuite() {
  let originalEnvironment: NodeJS.ProcessEnv;
  let repository: ReturnType<typeof createRepository>;
  let guard: LocalTestAuthGuard;
  const user: User = { ...LOCAL_TEST_ACCOUNT_PROFILE, accessToken: '' };

  beforeEach(function setUp() {
    originalEnvironment = { ...process.env };
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_TEST_AUTH_TOKEN = TOKEN;
    repository = createRepository();
    repository.findOne.mockResolvedValue(user);
    guard = new LocalTestAuthGuard(repository as unknown as Repository<User>);
  });
  afterEach(function tearDown() {
    process.env = originalEnvironment;
  });

  it.each(['production', 'test'])(
    'keeps account APIs disabled in %s even with a token',
    async function testCase(environment) {
      process.env.NODE_ENV = environment;
      await expect(
        guard.canActivate(
          contextFor(localRequest({ body: { userId: 'victim' } })),
        ),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_AUTH_DISABLED', statusCode: 503 },
      });
      expect(repository.findOne).not.toHaveBeenCalled();
    },
  );

  it('does not activate local accounts without explicit configuration', async function testCase() {
    delete process.env.LOCAL_TEST_AUTH_TOKEN;
    await expect(
      guard.canActivate(contextFor(localRequest())),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'Bearer wrong',
    `Bearer ${TOKEN} extra`,
    `Basic ${TOKEN}`,
  ])(
    'rejects invalid authorization (%s)',
    async function testCase(authorization) {
      await expect(
        guard.canActivate(
          contextFor(localRequest({ headers: { authorization } })),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'PUT'])(
    'allows the configured local test account to %s its state',
    async function testCase(method) {
      const req = localRequest({ method, body: { userId: 'forged-user' } });
      await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
      expect(req.user).toBe(user);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: LOCAL_TEST_ACCOUNT_PROFILE.id },
      });
    },
  );

  it('allows a local solo result but not other games or account competition', async function testCase() {
    await expect(
      guard.canActivate(
        contextFor(
          localRequest({
            method: 'POST',
            path: '/game/result',
            body: { gameType: 'POKE_LOUNGE' },
          }),
        ),
      ),
    ).resolves.toBe(true);
    for (const req of [
      localRequest({
        method: 'POST',
        path: '/game/result',
        body: { gameType: 'SKY_DROP' },
      }),
      localRequest({
        method: 'POST',
        path: '/poke-lounge/rooms/ABC123/competitive-seat',
      }),
    ]) {
      await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('creates only the fixed development test user', async function testCase() {
    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(user);
    repository.save.mockResolvedValue(user);
    const req = localRequest();
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(repository.create).toHaveBeenCalledWith(LOCAL_TEST_ACCOUNT_PROFILE);
    expect(req.user).toBe(user);
  });

  it('recovers from concurrent test-user creation', async function testCase() {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
    repository.create.mockReturnValue(user);
    repository.save.mockRejectedValue(dbFailure('23505'));
    await expect(guard.canActivate(contextFor(localRequest()))).resolves.toBe(
      true,
    );
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('does not turn database errors into authentication failures', async function testCase() {
    const error = dbFailure('08006');
    repository.findOne.mockRejectedValue(error);
    await expect(guard.canActivate(contextFor(localRequest()))).rejects.toBe(
      error,
    );
  });

  it('propagates save failures and unmatched duplicate errors', async function testCase() {
    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(user);
    for (const error of [dbFailure('08006'), dbFailure('23505')]) {
      repository.save.mockRejectedValue(error);
      await expect(guard.canActivate(contextFor(localRequest()))).rejects.toBe(
        error,
      );
    }
  });

  it('rejects a malformed development token configuration', async function testCase() {
    process.env.LOCAL_TEST_AUTH_TOKEN = 'short';
    await expect(guard.canActivate(contextFor(localRequest()))).rejects.toThrow(
      'LOCAL_TEST_AUTH_TOKEN',
    );
  });
});

describe('account-disabled HTTP routes', function testSuite() {
  let app: INestApplication;
  let originalEnvironment: NodeJS.ProcessEnv;
  const repository = createRepository();
  const submitSessionAction = jest.fn().mockResolvedValue({ accepted: true });

  beforeAll(async function setUp() {
    originalEnvironment = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_TEST_AUTH_TOKEN = TOKEN;
    const module = await Test.createTestingModule({
      controllers: [GameController, PokeLoungeController],
      providers: [
        LocalTestAuthGuard,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: GameService, useValue: {} },
        { provide: PokeLoungeRoomService, useValue: {} },
        {
          provide: PokeLoungeRomDataService,
          useValue: {
            getRuntimeData: jest.fn().mockResolvedValue({ documents: [] }),
          },
        },
        { provide: CompetitiveMatchService, useValue: { submitSessionAction } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async function tearDown() {
    await app?.close();
    process.env = originalEnvironment;
  });

  it.each([
    ['get', '/game/poke-lounge/state'],
    ['put', '/game/poke-lounge/state'],
    ['post', '/game/result'],
    ['post', '/poke-lounge/rooms/ABC123/competitive-seat'],
    [
      'post',
      '/poke-lounge/rooms/ABC123/matches/00000000-0000-4000-8000-000000000001/actions',
    ],
  ] as const)(
    'rejects %s %s with an explicit disabled response',
    async function testCase(method, path) {
      const response = await request(app.getHttpServer() as Server)
        [method](path)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ userId: 'forged-user' })
        .expect(503);
      expect(response.body).toMatchObject({ code: 'ACCOUNT_AUTH_DISABLED' });
      expect(repository.findOne).not.toHaveBeenCalled();
    },
  );

  it('keeps public ROM data and session-based battle routing available', async function testCase() {
    await request(app.getHttpServer() as Server)
      .get('/poke-lounge/rom-data')
      .expect(200);
    await request(app.getHttpServer() as Server)
      .post(
        '/poke-lounge/rooms/ABC123/matches/00000000-0000-4000-8000-000000000001/session-actions',
      )
      .send({
        sessionId: 'private-session',
        assignmentRevision: 1,
        turn: 1,
        clientCommandId: '00000000-0000-4000-8000-000000000002',
        action: { kind: 'move', moveId: 55 },
      })
      .expect(201);
    expect(submitSessionAction).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'private-session' }),
    );
  });
});

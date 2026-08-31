import { GoogleAuthGuard } from './google-auth.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ErrorMessage } from '../common/constants/message.constant';

type TestRequest = {
  body?: unknown;
  headers: {
    authorization?: string;
  };
  method?: string;
  path?: string;
  user?: User;
};

type MockUserRepository = {
  findOne: jest.Mock<Promise<User | null>, [unknown]>;
  save: jest.Mock<Promise<User>, [User]>;
  create: jest.Mock<User, [Partial<User>]>;
};

type MockLoginTicket = Pick<LoginTicket, 'getPayload'>;

type MockGoogleClient = {
  verifyIdToken: jest.Mock<
    Promise<MockLoginTicket>,
    [Parameters<OAuth2Client['verifyIdToken']>[0]]
  >;
};

const createExecutionContext = (request: TestRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T = TestRequest>() => request as T,
    }),
  }) as ExecutionContext;

const createUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  accessToken: '',
  ...overrides,
});

describe('GoogleAuthGuard', function testSuite() {
  let guard: GoogleAuthGuard;
  let mockUserRepository: MockUserRepository;
  let mockClient: MockGoogleClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function setUpTest() {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    delete process.env.LOCAL_TEST_AUTH_TOKEN;
    delete process.env.ENABLE_DEV_AUTH_BYPASS;
    delete process.env.DEV_AUTH_TOKEN;

    mockUserRepository = {
      findOne: jest.fn<Promise<User | null>, [unknown]>(),
      save: jest.fn<Promise<User>, [User]>(),
      create: jest.fn<User, [Partial<User>]>(),
    };
    guard = new GoogleAuthGuard(
      mockUserRepository as unknown as Repository<User>,
    );
    mockClient = {
      verifyIdToken: jest.fn<
        Promise<MockLoginTicket>,
        [Parameters<OAuth2Client['verifyIdToken']>[0]]
      >(),
    };
    (guard as unknown as { client: MockGoogleClient }).client = mockClient;
  });

  afterEach(function tearDownTest() {
    process.env = originalEnv;
  });

  it('should be defined', function testCase() {
    expect(guard).toBeDefined();
  });

  describe('canActivate', function testSuite() {
    it('should throw UnauthorizedException if no token provided', async function testCase() {
      const context = createExecutionContext({
        headers: {},
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException(ErrorMessage.AUTH.NO_TOKEN),
      );
    });

    it('should throw UnauthorizedException if email is missing', async function testCase() {
      const context = createExecutionContext({
        headers: { authorization: 'Bearer valid-token' },
      });

      mockClient.verifyIdToken.mockResolvedValue({
        getPayload: (): TokenPayload => ({
          sub: '123',
          // email missing
        }),
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException(ErrorMessage.AUTH.EMAIL_REQUIRED),
      );
    });

    it('should throw UnauthorizedException when GOOGLE_CLIENT_ID is missing', async function testCase() {
      delete process.env.GOOGLE_CLIENT_ID;
      const context = createExecutionContext({
        headers: { authorization: 'Bearer valid-token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException(ErrorMessage.AUTH.INVALID_TOKEN),
      );
    });

    it('should return true and attach user if token and email are valid', async function testCase() {
      const mockRequest: TestRequest = {
        headers: { authorization: 'Bearer valid-token' },
      };
      const context = createExecutionContext(mockRequest);

      const payload: TokenPayload = {
        sub: '123',
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User',
      };

      mockClient.verifyIdToken.mockResolvedValue({
        getPayload: () => payload,
      });

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(
        createUser({
          id: payload.sub,
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
        }),
      );
      mockUserRepository.save.mockResolvedValue(
        createUser({
          id: payload.sub,
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
        }),
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockClient.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-token',
        audience: 'test-google-client-id',
      });
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.email).toBe(payload.email);
    });

    it('should reuse a user inserted by a concurrent request', async function testCase() {
      const request: TestRequest = {
        headers: { authorization: 'Bearer valid-token' },
      };
      const concurrentUser = createUser({ id: '123' });
      mockClient.verifyIdToken.mockResolvedValue({
        getPayload: (): TokenPayload => ({
          sub: concurrentUser.id,
          email: concurrentUser.email,
        }),
      });
      mockUserRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrentUser);
      mockUserRepository.create.mockReturnValue(concurrentUser);
      mockUserRepository.save.mockRejectedValue(
        databaseFailure('23505', 'duplicate key'),
      );

      await expect(
        guard.canActivate(createExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.user).toBe(concurrentUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it.each([
      {
        caseName: 'the concurrent user is still missing',
        saveError: databaseFailure('23505', 'duplicate key'),
        findResults: [null, null],
      },
      {
        caseName: 'the database failure is not a unique violation',
        saveError: databaseFailure('08006', 'connection failure'),
        findResults: [null],
      },
    ])(
      'should surface the insert failure when $caseName',
      async function callback({ saveError, findResults }) {
        const request: TestRequest = {
          headers: { authorization: 'Bearer valid-token' },
        };
        const candidate = createUser({ id: '123' });
        mockClient.verifyIdToken.mockResolvedValue({
          getPayload: (): TokenPayload => ({
            sub: candidate.id,
            email: candidate.email,
          }),
        });
        for (const result of findResults) {
          mockUserRepository.findOne.mockResolvedValueOnce(result);
        }
        mockUserRepository.create.mockReturnValue(candidate);
        mockUserRepository.save.mockRejectedValue(saveError);

        await expect(
          guard.canActivate(createExecutionContext(request)),
        ).rejects.toThrow(saveError.message);
        expect(mockUserRepository.findOne).toHaveBeenCalledTimes(
          findResults.length,
        );
        expect(request.user).toBeUndefined();
      },
    );

    it('should allow bypass only when explicitly enabled', async function testCase() {
      process.env.ENABLE_DEV_AUTH_BYPASS = 'true';
      process.env.DEV_AUTH_TOKEN = 'local-dev-token';

      const mockRequest: TestRequest = {
        headers: { authorization: 'Bearer local-dev-token' },
      };
      const context = createExecutionContext(mockRequest);

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(
        createUser({
          id: 'dev-user-id',
          email: 'dev@example.com',
          firstName: 'Dev',
          lastName: 'User',
        }),
      );
      mockUserRepository.save.mockResolvedValue(
        createUser({
          id: 'dev-user-id',
          email: 'dev@example.com',
          firstName: 'Dev',
          lastName: 'User',
        }),
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
      expect(mockRequest.user?.id).toBe('dev-user-id');
    });

    it('should attach a stable local test account in development', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';

      const mockRequest: TestRequest = {
        method: 'PUT',
        path: '/game/poke-lounge/state',
        headers: {
          authorization: 'Bearer local_test_auth_token_0123456789abcdef',
        },
      };
      const context = createExecutionContext(mockRequest);

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(
        createUser({
          id: 'poke-lounge-local-test-user',
          email: 'poke-lounge-local-test-user@local.poke-lounge.test',
          firstName: 'Local',
          lastName: 'Tester',
        }),
      );
      mockUserRepository.save.mockResolvedValue(
        createUser({
          id: 'poke-lounge-local-test-user',
          email: 'poke-lounge-local-test-user@local.poke-lounge.test',
          firstName: 'Local',
          lastName: 'Tester',
        }),
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
      expect(mockRequest.user?.id).toBe('poke-lounge-local-test-user');
    });

    it('should allow the local test account to save a Poke Lounge solo result', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';
      const existingUser = createUser({ id: 'poke-lounge-local-test-user' });
      const mockRequest: TestRequest = {
        body: { gameType: 'POKE_LOUNGE', score: 10 },
        headers: {
          authorization: 'Bearer local_test_auth_token_0123456789abcdef',
        },
        method: 'POST',
        path: '/game/result',
      };
      mockUserRepository.findOne.mockResolvedValue(existingUser);

      await expect(
        guard.canActivate(createExecutionContext(mockRequest)),
      ).resolves.toBe(true);
      expect(mockRequest.user).toBe(existingUser);
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
    });

    it('should reject the local test token for multiplayer and other game routes', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';

      for (const request of [
        {
          headers: {
            authorization: 'Bearer local_test_auth_token_0123456789abcdef',
          },
          method: 'POST',
          path: '/poke-lounge/rooms/ABC123/competitive-seat',
        },
        {
          body: { gameType: 'SKY_DROP', score: 10 },
          headers: {
            authorization: 'Bearer local_test_auth_token_0123456789abcdef',
          },
          method: 'POST',
          path: '/game/result',
        },
      ] satisfies TestRequest[]) {
        await expect(
          guard.canActivate(createExecutionContext(request)),
        ).rejects.toThrow(UnauthorizedException);
      }

      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
    });

    it('should ignore the local test account in production', async function testCase() {
      process.env.NODE_ENV = 'production';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';
      mockClient.verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const context = createExecutionContext({
        headers: {
          authorization: 'Bearer local_test_auth_token_0123456789abcdef',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockClient.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'local_test_auth_token_0123456789abcdef',
        audience: 'test-google-client-id',
      });
    });

    it('should ignore the local test account in the test environment', async function testCase() {
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';
      mockClient.verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const context = createExecutionContext({
        headers: {
          authorization: 'Bearer local_test_auth_token_0123456789abcdef',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockClient.verifyIdToken).toHaveBeenCalled();
    });

    it('should not fall back to the local account for a different token', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';
      mockClient.verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const context = createExecutionContext({
        headers: { authorization: 'Bearer different-google-token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockClient.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'different-google-token',
        audience: 'test-google-client-id',
      });
    });

    it('should reject a malformed local test token configuration', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN = 'too-short';

      const context = createExecutionContext({
        headers: { authorization: 'Bearer any-token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        /LOCAL_TEST_AUTH_TOKEN/,
      );
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
    });

    it('should reuse the existing local test account', async function testCase() {
      process.env.NODE_ENV = 'development';
      process.env.LOCAL_TEST_AUTH_TOKEN =
        'local_test_auth_token_0123456789abcdef';
      const existingUser = createUser({
        id: 'poke-lounge-local-test-user',
        email: 'poke-lounge-local-test-user@local.poke-lounge.test',
        firstName: 'Local',
        lastName: 'Tester',
      });
      const mockRequest: TestRequest = {
        method: 'GET',
        path: '/game/poke-lounge/state',
        headers: {
          authorization: 'Bearer local_test_auth_token_0123456789abcdef',
        },
      };
      mockUserRepository.findOne.mockResolvedValue(existingUser);

      const result = await guard.canActivate(
        createExecutionContext(mockRequest),
      );

      expect(result).toBe(true);
      expect(mockRequest.user).toBe(existingUser);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockClient.verifyIdToken).not.toHaveBeenCalled();
    });
  });
});

function databaseFailure(code: string, message: string): QueryFailedError {
  const driverError = Object.assign(new Error(message), {
    code,
  });

  return new QueryFailedError('INSERT', [], driverError);
}

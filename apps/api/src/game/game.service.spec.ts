import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameHistory } from './entities/game-history.entity';
import { User } from '../auth/entities/user.entity';
import { CreateGameHistoryDto } from './dto/create-game-history.dto';
import { SavePokeLoungeStateDto } from './dto/save-poke-lounge-state.dto';
import { GameType } from './enums/game-type.enum';
import { PokeLoungeLiveStateService } from '../poke-lounge/poke-lounge-live-state.service';

const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getQuery: jest.fn().mockReturnValue('SELECT * FROM game_history'),
  getParameters: jest.fn().mockReturnValue({}),
  setParameters: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  getRawOne: jest.fn(),
  andWhere: jest.fn().mockReturnThis(),
  subQuery: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
};

const mockGameHistoryRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
  query: jest.fn(), // Raw query 지원
});

const mockPokeLoungeRedis = () => ({
  savePlayerState: jest.fn(),
  getPlayerState: jest.fn(),
});

describe('GameService', () => {
  let service: GameService;
  let repository: ReturnType<typeof mockGameHistoryRepository>;
  let pokeLoungeRedis: ReturnType<typeof mockPokeLoungeRedis>;

  beforeEach(async () => {
    // 각 테스트 전에 모든 모킹 초기화
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: getRepositoryToken(GameHistory),
          useFactory: mockGameHistoryRepository,
        },
        {
          provide: PokeLoungeLiveStateService,
          useFactory: mockPokeLoungeRedis,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    repository = module.get(getRepositoryToken(GameHistory));
    pokeLoungeRedis = module.get(PokeLoungeLiveStateService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createHistory', () => {
    it('should create and save a game history with gameType', async () => {
      const user = new User();
      user.id = 'test-id';
      const createDto: CreateGameHistoryDto = {
        score: 100,
        gameType: GameType.SKY_DROP,
      };
      const savedHistory = { id: 1, ...createDto, user };

      repository.create.mockReturnValue(savedHistory);
      repository.save.mockResolvedValue(savedHistory);

      const result = await service.createHistory(user, createDto);

      expect(repository.create).toHaveBeenCalledWith({
        ...createDto,
        user,
        resultTrust: null,
        sourceKey: null,
      });
      expect(repository.save).toHaveBeenCalledWith(savedHistory);
      expect(result).toEqual(savedHistory);
    });

    it('비정상적으로 큰 점수는 저장 전에 거절해야 함', async () => {
      const user = new User();
      user.id = 'test-id';
      const createDto: CreateGameHistoryDto = {
        score: 999999999,
        gameType: GameType.SKY_DROP,
        playTime: 1,
      };

      await expect(service.createHistory(user, createDto)).rejects.toThrow(
        'SKY_DROP score must be between 1 and 100000',
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('플레이 시간 대비 불가능한 점수는 저장 전에 거절해야 함', async () => {
      const user = new User();
      user.id = 'test-id';
      const createDto: CreateGameHistoryDto = {
        score: 10000,
        gameType: GameType.SKY_DROP,
        playTime: 1,
      };

      await expect(service.createHistory(user, createDto)).rejects.toThrow(
        'SKY_DROP score exceeds allowed score rate',
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('소수점 점수는 저장 전에 거절해야 함', async () => {
      const user = new User();
      user.id = 'test-id';
      const createDto: CreateGameHistoryDto = {
        score: 100.5,
        gameType: GameType.SKY_DROP,
      };

      await expect(service.createHistory(user, createDto)).rejects.toThrow(
        'SKY_DROP score must be an integer',
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('유효한 점수와 플레이 시간은 저장해야 함', async () => {
      const user = new User();
      user.id = 'test-id';
      const createDto: CreateGameHistoryDto = {
        score: 12000,
        gameType: GameType.SKY_DROP,
        playTime: 30,
      };
      const savedHistory = { id: 1, ...createDto, user };

      repository.create.mockReturnValue(savedHistory);
      repository.save.mockResolvedValue(savedHistory);

      const result = await service.createHistory(user, createDto);

      expect(repository.create).toHaveBeenCalledWith({
        ...createDto,
        user,
        resultTrust: null,
        sourceKey: null,
      });
      expect(repository.save).toHaveBeenCalledWith(savedHistory);
      expect(result).toEqual(savedHistory);
    });

    it('Poke Lounge 결과는 영속 기록으로 저장하지 않아야 함', async () => {
      const user = Object.assign(new User(), { id: 'test-id' });
      const dto: CreateGameHistoryDto = {
        score: 300,
        gameType: GameType.POKE_LOUNGE,
        playTime: 30,
      };

      await expect(service.createHistory(user, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('getRanking', () => {
    it('유저별 최고 점수만 반환해야 함 (gameType 필터 있음)', async () => {
      repository.query.mockResolvedValue([
        {
          score: 200,
          firstName: '홍길',
          lastName: '동',
          createdAt: new Date('2024-01-01'),
        },
        {
          score: 150,
          firstName: '김철',
          lastName: '수',
          createdAt: new Date('2024-01-02'),
        },
      ]);

      const result = await service.getRanking(GameType.SKY_DROP);

      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining('gh.score BETWEEN $2 AND $3'),
        [GameType.SKY_DROP, 1, 100000, 1, 86400, 2000],
      );
      expect(result).toEqual([
        {
          score: 200,
          rank: 1,
          createdAt: new Date('2024-01-01'),
          user: { displayName: '홍길 동' },
        },
        {
          score: 150,
          rank: 2,
          createdAt: new Date('2024-01-02'),
          user: { displayName: '김철 수' },
        },
      ]);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('게임 타입별 유저 최고 점수만 필터링해야 함', async () => {
      const rows = [
        {
          score: 200,
          firstName: '홍길',
          lastName: '동',
          createdAt: new Date('2024-01-01'),
        },
      ];

      repository.query.mockResolvedValue(rows);

      const result = await service.getRanking(GameType.SKY_DROP);

      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining('gh.score BETWEEN $2 AND $3'),
        [GameType.SKY_DROP, 1, 100000, 1, 86400, 2000],
      );
      expect(result).toEqual([
        {
          score: 200,
          rank: 1,
          createdAt: new Date('2024-01-01'),
          user: { displayName: '홍길 동' },
        },
      ]);
    });

    it('랭킹 대상이 없으면 빈 배열을 반환해야 함', async () => {
      repository.query.mockResolvedValue([]);

      const result = await service.getRanking(GameType.SKY_DROP);

      expect(result).toEqual([]);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('Poke Lounge 랭킹은 DB를 조회하지 않고 빈 배열을 반환해야 함', async () => {
      await expect(service.getRanking(GameType.POKE_LOUNGE)).resolves.toEqual(
        [],
      );
      expect(repository.query).not.toHaveBeenCalled();
    });
  });

  describe('getUserBestScore', () => {
    it('should return user best score', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxScore: '100' });

      const result = await service.getUserBestScore('user1', GameType.SKY_DROP);

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'MAX(gh.score)',
        'maxScore',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'gh.userId = :userId',
        { userId: 'user1' },
      );
      expect(result).toBe(100);
    });

    it('should return 0 if no score found', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({});

      const result = await service.getUserBestScore('user1', GameType.SKY_DROP);

      expect(result).toBe(0);
    });

    it('should apply date range filter', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxScore: '100' });
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07'),
      };

      await service.getUserBestScore('user1', GameType.SKY_DROP, dateRange);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'gh.createdAt BETWEEN :start AND :end',
        dateRange,
      );
    });

    it('저장된 비정상 점수를 최고 점수 산정에서 제외해야 함', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxScore: '100' });

      await service.getUserBestScore('user1', GameType.SKY_DROP);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('gh.score BETWEEN :minScore AND :maxScore'),
        {
          minScore: 1,
          maxScore: 100000,
          minPlayTimeSeconds: 1,
          maxPlayTimeSeconds: 86400,
          maxScorePerSecond: 2000,
        },
      );
    });

    it('Poke Lounge 최고 점수는 DB를 조회하지 않아야 함', async () => {
      await expect(
        service.getUserBestScore('user1', GameType.POKE_LOUNGE),
      ).resolves.toBe(0);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getUserRank', () => {
    it('should return user rank', async () => {
      repository.query.mockResolvedValue([{ count: '5' }]);

      const result = await service.getUserRank('user1', 100, GameType.SKY_DROP);

      expect(repository.query).toHaveBeenCalled();
      expect(result).toBe(6); // 5명보다 낮으면 6등
    });

    it('should apply date range filter to rank calculation', async () => {
      repository.query.mockResolvedValue([{ count: '2' }]);
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07'),
      };

      const result = await service.getUserRank(
        'user1',
        100,
        GameType.SKY_DROP,
        dateRange,
      );

      // Raw query에 dateRange 파라미터가 전달되어야 함
      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN'),
        [
          GameType.SKY_DROP,
          100,
          1,
          100000,
          1,
          86400,
          2000,
          dateRange.start,
          dateRange.end,
        ],
      );
      expect(result).toBe(3); // 2명보다 낮으면 3등
    });

    it('저장된 비정상 점수를 등수 산정에서 제외해야 함', async () => {
      repository.query.mockResolvedValue([{ count: '5' }]);

      await service.getUserRank('user1', 100, GameType.SKY_DROP);

      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining('score BETWEEN $3 AND $4'),
        [GameType.SKY_DROP, 100, 1, 100000, 1, 86400, 2000],
      );
    });

    it('Poke Lounge 등수는 DB를 조회하지 않아야 함', async () => {
      await expect(
        service.getUserRank('user1', 300, GameType.POKE_LOUNGE),
      ).resolves.toBeNull();
      expect(repository.query).not.toHaveBeenCalled();
    });
  });

  describe('savePokeLoungeState', () => {
    it('Redis에 상태와 두 시간 TTL을 저장하고 최신 revision을 반환해야 함', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000);
      const user = Object.assign(new User(), { id: 'poke-user' });
      const dto: SavePokeLoungeStateDto = {
        state: { room: 'LOUNGE' },
        expectedRevision: 0,
      };
      const stored = {
        revision: 1,
        state: dto.state,
        clientUpdatedAt: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:01.000Z',
      };
      pokeLoungeRedis.savePlayerState.mockResolvedValue(1);
      pokeLoungeRedis.getPlayerState.mockResolvedValue(stored);

      await expect(
        service.savePokeLoungeState(user, dto),
      ).resolves.toMatchObject({
        id: user.id,
        userId: user.id,
        state: dto.state,
        revision: 1,
      });
      expect(pokeLoungeRedis.savePlayerState).toHaveBeenCalledWith({
        userId: user.id,
        state: dto.state,
        expectedRevision: 0,
        clientUpdatedAt: null,
        nowMs: 1_000,
        expiresAtMs: 7_201_000,
      });
    });

    it('구버전 Web 저장은 expectedRevision을 Redis에 전달하지 않아야 함', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000);
      const user = Object.assign(new User(), { id: 'legacy-user' });
      const stored = {
        revision: 1,
        state: { marker: 'legacy' },
        clientUpdatedAt: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:01.000Z',
      };
      pokeLoungeRedis.savePlayerState.mockResolvedValue(1);
      pokeLoungeRedis.getPlayerState.mockResolvedValue(stored);

      await service.savePokeLoungeState(user, {
        state: stored.state,
        clientUpdatedAt: stored.clientUpdatedAt,
      });

      expect(pokeLoungeRedis.savePlayerState).toHaveBeenCalledWith({
        userId: user.id,
        state: stored.state,
        clientUpdatedAt: stored.clientUpdatedAt,
        nowMs: 1_000,
        expiresAtMs: 7_201_000,
      });
    });

    it('Redis revision 충돌은 409로 반환해야 함', async () => {
      pokeLoungeRedis.savePlayerState.mockResolvedValue(null);

      const error = await service
        .savePokeLoungeState(Object.assign(new User(), { id: 'poke-user' }), {
          state: {},
          expectedRevision: 2,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect(pokeLoungeRedis.getPlayerState).not.toHaveBeenCalled();
    });

    it('저장 직후 Redis에서 같은 revision을 읽지 못하면 실패해야 함', async () => {
      pokeLoungeRedis.savePlayerState.mockResolvedValue(2);
      pokeLoungeRedis.getPlayerState.mockResolvedValue({
        revision: 1,
        state: {},
        clientUpdatedAt: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:01.000Z',
      });

      await expect(
        service.savePokeLoungeState(
          Object.assign(new User(), { id: 'poke-user' }),
          { state: {}, expectedRevision: 1 },
        ),
      ).rejects.toThrow('Redis state was not readable after save');
    });
  });

  describe('findPokeLoungeState', () => {
    it('Redis에서 최신 상태를 조회해야 함', async () => {
      pokeLoungeRedis.getPlayerState.mockResolvedValueOnce({
        revision: 4,
        state: { map: 'new-bark-town' },
        clientUpdatedAt: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:01.000Z',
      });

      await expect(
        service.findPokeLoungeState('poke-user'),
      ).resolves.toMatchObject({
        id: 'poke-user',
        userId: 'poke-user',
        revision: 4,
      });
      expect(pokeLoungeRedis.getPlayerState).toHaveBeenCalledWith('poke-user');
    });

    it('Redis 상태가 없으면 NotFoundException을 던져야 함', async () => {
      pokeLoungeRedis.getPlayerState.mockResolvedValue(null);

      await expect(
        service.findPokeLoungeState('poke-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

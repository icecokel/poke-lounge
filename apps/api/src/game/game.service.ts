import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameHistory } from './entities/game-history.entity';
import { User } from '../auth/entities/user.entity';
import { CreateGameHistoryDto } from './dto/create-game-history.dto';
import { SavePokeLoungeStateDto } from './dto/save-poke-lounge-state.dto';
import { GameRankingHistoryDto } from './dto/game-ranking-history.dto';
import { GameType } from './enums/game-type.enum';
import {
  GameSubmissionTrust,
  buildNamedValidScoreCondition,
  buildPositionalValidScoreCondition,
  getGameScorePolicy,
  getGameScorePolicyParams,
  getGameScorePolicyValues,
  isPublicRankingEligible as isScorePublicRankingEligible,
  validateGameScoreSubmission,
} from './game-score-policy';
import {
  PokeLoungeLiveStateService,
  type PokeLoungeRedisPlayerState,
} from '../poke-lounge/poke-lounge-live-state.service';

type MaxScoreRow = {
  maxScore: string | number | null;
};

type RankingProjectionRow = {
  score: string | number;
  createdAt: Date | string;
  firstName: string;
  lastName: string;
};

type RankCountRow = {
  count: string | number;
};

export type TransientPokeLoungeState = {
  id: string;
  userId: string;
  state: Record<string, unknown>;
  revision: number;
  clientUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const GENERIC_GAME_SUBMISSION_TRUST: GameSubmissionTrust = 'client-asserted';
const POKE_LOUNGE_PLAYER_STATE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 게임 비즈니스 로직을 처리하는 서비스
 */
@Injectable()
export class GameService {
  constructor(
    @InjectRepository(GameHistory)
    private gameHistoryRepository: Repository<GameHistory>,
    private readonly pokeLoungeRedis: PokeLoungeLiveStateService,
  ) {}

  /**
   * 유저의 최고 점수 조회 (기간 필터링 지원)
   */
  async getUserBestScore(
    userId: string,
    gameType: GameType,
    dateRange?: { start: Date; end: Date },
  ): Promise<number> {
    if (gameType === GameType.POKE_LOUNGE) {
      return 0;
    }
    const policy = getGameScorePolicy(gameType);
    const query = this.gameHistoryRepository
      .createQueryBuilder('gh')
      .select('MAX(gh.score)', 'maxScore')
      .where('gh.userId = :userId', { userId })
      .andWhere('gh.gameType = :gameType', { gameType })
      .andWhere(
        buildNamedValidScoreCondition('gh'),
        getGameScorePolicyParams(policy),
      );

    if (dateRange) {
      query.andWhere('gh.createdAt BETWEEN :start AND :end', {
        start: dateRange.start,
        end: dateRange.end,
      });
    }

    const result = await query.getRawOne<MaxScoreRow>();
    return result?.maxScore ? Number.parseInt(String(result.maxScore), 10) : 0;
  }

  /**
   * 새로운 게임 기록을 생성하고 저장함
   */
  async createHistory(
    user: User,
    createGameHistoryDto: CreateGameHistoryDto,
  ): Promise<GameHistory> {
    if (createGameHistoryDto.gameType === GameType.POKE_LOUNGE) {
      throw new BadRequestException('Poke Lounge results are transient');
    }
    validateGameScoreSubmission(createGameHistoryDto);

    const history = this.gameHistoryRepository.create({
      ...createGameHistoryDto,
      user: user,
      resultTrust: null,
      sourceKey: null,
    });
    return this.gameHistoryRepository.save(history);
  }

  isPublicRankingEligible(gameType: GameType): boolean {
    return isScorePublicRankingEligible(
      gameType,
      GENERIC_GAME_SUBMISSION_TRUST,
    );
  }

  /**
   * 게임별 랭킹 목록을 조회함 (유저별 최고 점수 기준 Top 10)
   */
  async getRanking(gameType: GameType): Promise<GameRankingHistoryDto[]> {
    if (gameType === GameType.POKE_LOUNGE) {
      return [];
    }
    const policy = getGameScorePolicy(gameType);
    const policyValues = getGameScorePolicyValues(policy);
    const queryValues: Array<string | number> = [gameType, ...policyValues];

    // 유저별 최고 점수 1건만 추린 뒤 전체 상위 10건을 구함
    const rows = await this.gameHistoryRepository.query<RankingProjectionRow[]>(
      `
      SELECT
        ranked.score,
        ranked."createdAt",
        ranked."firstName",
        ranked."lastName"
      FROM (
        SELECT
          gh.score,
          gh."createdAt",
          user_record."firstName",
          user_record."lastName",
          ROW_NUMBER() OVER (
            PARTITION BY gh."userId"
            ORDER BY gh.score DESC, gh."createdAt" ASC, gh.id ASC
          ) AS row_num
        FROM game_history gh
        INNER JOIN "user" user_record ON user_record.id = gh."userId"
        WHERE gh."gameType" = $1
          AND ${buildPositionalValidScoreCondition('gh', 2)}
      ) AS ranked
      WHERE ranked.row_num = 1
      ORDER BY ranked.score DESC, ranked."createdAt" ASC
      LIMIT 10
      `,
      queryValues,
    );

    return rows.map(function mapItem(row, index) {
      return {
        score: Number(row.score),
        rank: index + 1,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
        user: {
          displayName: `${row.firstName} ${row.lastName}`.trim(),
        },
      };
    });
  }

  /**
   * ID를 기준으로 특정 게임 기록을 조회함
   */
  async findHistoryById(id: string): Promise<GameHistory> {
    const history = await this.gameHistoryRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!history) {
      throw new NotFoundException('Game history not found');
    }

    return history;
  }

  async savePokeLoungeState(
    user: User,
    dto: SavePokeLoungeStateDto,
  ): Promise<TransientPokeLoungeState> {
    const nowMs = Date.now();
    const clientUpdatedAt = dto.clientUpdatedAt ?? null;
    const revision = await this.pokeLoungeRedis.savePlayerState({
      userId: user.id,
      state: dto.state,
      ...(dto.expectedRevision === undefined
        ? {}
        : { expectedRevision: dto.expectedRevision }),
      clientUpdatedAt,
      nowMs,
      expiresAtMs: nowMs + POKE_LOUNGE_PLAYER_STATE_TTL_MS,
    });
    if (revision === null) {
      throw new ConflictException(
        'Poke Lounge state revision conflict; reload the latest state',
      );
    }
    const stored = await this.pokeLoungeRedis.getPlayerState(user.id);
    if (!stored || stored.revision !== revision) {
      throw new Error('Poke Lounge Redis state was not readable after save');
    }
    return toTransientPokeLoungeState(user.id, stored);
  }

  async findPokeLoungeState(userId: string): Promise<TransientPokeLoungeState> {
    const state = await this.pokeLoungeRedis.getPlayerState(userId);
    if (!state) {
      throw new NotFoundException('Poke Lounge state not found');
    }
    return toTransientPokeLoungeState(userId, state);
  }

  /**
   * 사용자의 특정 점수에 대한 현재 전체 등수를 계산함
   * @param userId 사용자 ID
   * @param score 현재 점수
   * @param gameType 게임 타입
   * @returns 등수 (1부터 시작)
   */
  async getUserRank(
    _userId: string,
    score: number,
    gameType: GameType,
    dateRange?: { start: Date; end: Date },
  ): Promise<number | null> {
    if (gameType === GameType.POKE_LOUNGE) {
      return null;
    }
    const policy = getGameScorePolicy(gameType);
    const policyValues = getGameScorePolicyValues(policy);
    const queryValues: Array<string | number | Date> = [
      gameType,
      score,
      ...policyValues,
    ];
    let dateRangeCondition = '';
    if (dateRange) {
      const startIndex = queryValues.push(dateRange.start);
      const endIndex = queryValues.push(dateRange.end);
      dateRangeCondition = `AND "createdAt" BETWEEN $${startIndex} AND $${endIndex}`;
    }

    // 유저별 최고 점수가 현재 점수보다 높은 경우만 카운트
    // 서브쿼리로 각 유저의 최고 점수 계산 후 비교
    const result = await this.gameHistoryRepository.query<RankCountRow[]>(
      `
      SELECT COUNT(*) as count
      FROM (
        SELECT "userId", MAX(score) as max_score
        FROM game_history
        WHERE "gameType" = $1
        AND ${buildPositionalValidScoreCondition(undefined, 3)}
        ${dateRangeCondition}
        GROUP BY "userId"
      ) AS user_scores
      WHERE max_score > $2
      `,
      queryValues,
    );

    // (나보다 높은 유저 수) + 1 = 현재 나의 등수
    return Number.parseInt(String(result[0]?.count ?? '0'), 10) + 1;
  }
}

function toTransientPokeLoungeState(
  userId: string,
  state: PokeLoungeRedisPlayerState,
): TransientPokeLoungeState {
  return {
    id: userId,
    userId,
    state: structuredClone(state.state),
    revision: state.revision,
    clientUpdatedAt: state.clientUpdatedAt
      ? new Date(state.clientUpdatedAt)
      : null,
    createdAt: new Date(state.createdAt),
    updatedAt: new Date(state.updatedAt),
  };
}

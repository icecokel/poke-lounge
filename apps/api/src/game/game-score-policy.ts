import { BadRequestException } from '@nestjs/common';
import type { CreateGameHistoryDto } from './dto/create-game-history.dto';
import { GameType } from './enums/game-type.enum';

export type GameScorePolicy = {
  minScore: number;
  maxScore: number;
  minPlayTimeSeconds: number;
  maxPlayTimeSeconds: number;
  maxScorePerSecond: number;
};

export type GameSubmissionTrust = 'client-asserted' | 'verified-room';

export const isPublicRankingEligible = (
  gameType: GameType,
  trust: GameSubmissionTrust,
): boolean => gameType !== GameType.POKE_LOUNGE || trust === 'verified-room';

const GAME_SCORE_POLICIES: Record<GameType, GameScorePolicy> = {
  [GameType.SKY_DROP]: {
    minScore: 1,
    maxScore: 100000,
    minPlayTimeSeconds: 1,
    maxPlayTimeSeconds: 86400,
    maxScorePerSecond: 2000,
  },
  [GameType.POKE_LOUNGE]: {
    minScore: 1,
    maxScore: 1000,
    minPlayTimeSeconds: 1,
    maxPlayTimeSeconds: 86400,
    maxScorePerSecond: 1000,
  },
};

export const getGameScorePolicy = (gameType: GameType): GameScorePolicy => {
  const policy = GAME_SCORE_POLICIES[gameType];
  if (!policy) {
    throw new BadRequestException(`${gameType} score policy is not configured`);
  }
  return policy;
};

export const getGameScorePolicyParams = (policy: GameScorePolicy) => ({
  minScore: policy.minScore,
  maxScore: policy.maxScore,
  minPlayTimeSeconds: policy.minPlayTimeSeconds,
  maxPlayTimeSeconds: policy.maxPlayTimeSeconds,
  maxScorePerSecond: policy.maxScorePerSecond,
});

export const getGameScorePolicyValues = (policy: GameScorePolicy): number[] => [
  policy.minScore,
  policy.maxScore,
  policy.minPlayTimeSeconds,
  policy.maxPlayTimeSeconds,
  policy.maxScorePerSecond,
];

const playTimeColumn = (alias?: string): string =>
  alias ? `${alias}."playTime"` : '"playTime"';

const scoreColumn = (alias?: string): string =>
  alias ? `${alias}.score` : 'score';

export const buildNamedValidScoreCondition = (alias: string): string => {
  const score = scoreColumn(alias);
  const playTime = `${alias}.playTime`;

  return `${score} BETWEEN :minScore AND :maxScore AND (${playTime} IS NULL OR (${playTime} BETWEEN :minPlayTimeSeconds AND :maxPlayTimeSeconds AND ${score} <= ${playTime} * :maxScorePerSecond))`;
};

export const buildPositionalValidScoreCondition = (
  alias: string | undefined,
  firstParamIndex: number,
): string => {
  const score = scoreColumn(alias);
  const playTime = playTimeColumn(alias);
  const param = (offset: number) => `$${firstParamIndex + offset}`;

  return `${score} BETWEEN ${param(0)} AND ${param(1)} AND (${playTime} IS NULL OR (${playTime} BETWEEN ${param(2)} AND ${param(3)} AND ${score} <= ${playTime} * ${param(4)}))`;
};

export const validateGameScoreSubmission = (
  dto: CreateGameHistoryDto,
): void => {
  const policy = getGameScorePolicy(dto.gameType);
  const prefix = `${dto.gameType} score`;

  if (!Number.isInteger(dto.score)) {
    throw new BadRequestException(`${prefix} must be an integer`);
  }

  if (dto.score < policy.minScore || dto.score > policy.maxScore) {
    throw new BadRequestException(
      `${prefix} must be between ${policy.minScore} and ${policy.maxScore}`,
    );
  }

  if (dto.playTime === undefined || dto.playTime === null) {
    return;
  }

  if (!Number.isInteger(dto.playTime)) {
    throw new BadRequestException(
      `${dto.gameType} playTime must be an integer`,
    );
  }

  if (
    dto.playTime < policy.minPlayTimeSeconds ||
    dto.playTime > policy.maxPlayTimeSeconds
  ) {
    throw new BadRequestException(
      `${dto.gameType} playTime must be between ${policy.minPlayTimeSeconds} and ${policy.maxPlayTimeSeconds} seconds`,
    );
  }

  if (dto.score > dto.playTime * policy.maxScorePerSecond) {
    throw new BadRequestException(`${prefix} exceeds allowed score rate`);
  }
};

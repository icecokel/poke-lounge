import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { GameType } from '../enums/game-type.enum';

const GAME_SCORE_DTO_MIN_SCORE = 1;
const GAME_SCORE_DTO_MAX_SCORE = 1_000_000;
const GAME_SCORE_DTO_MIN_PLAY_TIME_SECONDS = 1;
const GAME_SCORE_DTO_MAX_PLAY_TIME_SECONDS = 86_400;

export class CreateGameHistoryDto {
  @ApiProperty({
    description:
      '게임별 서버 정책으로 최종 검증되는 정수 점수. DTO는 전체 게임 타입의 제출 envelope만 검증한다.',
    example: 8500,
    minimum: GAME_SCORE_DTO_MIN_SCORE,
    maximum: GAME_SCORE_DTO_MAX_SCORE,
  })
  @IsInt()
  @Min(GAME_SCORE_DTO_MIN_SCORE)
  @Max(GAME_SCORE_DTO_MAX_SCORE)
  score: number;

  @ApiPropertyOptional({
    description:
      '플레이 시간(초). 제출되면 게임별 서버 정책의 점수 대비 비정상 속도 검증에 사용된다.',
    example: 120,
    minimum: GAME_SCORE_DTO_MIN_PLAY_TIME_SECONDS,
    maximum: GAME_SCORE_DTO_MAX_PLAY_TIME_SECONDS,
  })
  @IsInt()
  @Min(GAME_SCORE_DTO_MIN_PLAY_TIME_SECONDS)
  @Max(GAME_SCORE_DTO_MAX_PLAY_TIME_SECONDS)
  @IsOptional()
  playTime?: number;

  @ApiProperty({
    enum: GameType,
    enumName: 'GameType',
    description:
      '서버에 등록된 게임 타입. 게임별 점수 정책은 서버에서 적용된다.',
    example: GameType.SKY_DROP,
  })
  @IsEnum(GameType)
  gameType: GameType;
}

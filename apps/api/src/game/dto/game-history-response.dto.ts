import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GameType } from '../enums/game-type.enum';

export class GameHistoryUserDto {
  @ApiProperty({ description: '사용자 닉네임', example: '홍길동' })
  displayName: string;
}

export class GameHistoryResponseDto {
  @ApiProperty({
    description: '게임 기록 ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({ description: '점수', example: 100 })
  score: number;

  @ApiProperty({
    description: '게임 타입',
    enum: GameType,
    example: GameType.SKY_DROP,
  })
  gameType: GameType;

  @ApiProperty({
    description: '생성 일시',
    example: '2024-01-30T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({ description: '사용자 정보', type: GameHistoryUserDto })
  user: GameHistoryUserDto;

  @ApiPropertyOptional({
    description: '현재 등수 (1부터 시작, 랭킹 외 시 null)',
    example: 1,
    nullable: true,
    type: Number,
  })
  rank?: number | null;

  @ApiPropertyOptional({
    description: '유저의 역대 최고 점수',
    example: 1200,
    nullable: true,
    type: Number,
  })
  bestScore?: number | null;

  @ApiPropertyOptional({
    description: '전체 기간 랭킹',
    example: 42,
    nullable: true,
    type: Number,
  })
  allTimeRank?: number | null;

  @ApiPropertyOptional({
    description: '금주 랭킹 (KST 월요일 0시 ~ 일요일 24시 기준)',
    example: 5,
    nullable: true,
    type: Number,
  })
  weeklyRank?: number | null;
}

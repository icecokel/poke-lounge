import { ApiProperty } from '@nestjs/swagger';
import { GameHistoryUserDto } from './game-history-response.dto';

export class GameRankingHistoryDto {
  @ApiProperty({ description: '점수', example: 100 })
  score: number;

  @ApiProperty({ description: '순위', example: 1 })
  rank: number;

  @ApiProperty({
    description: '생성 일시',
    example: '2024-01-30T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({ description: '공개 사용자 정보', type: GameHistoryUserDto })
  user: GameHistoryUserDto;
}

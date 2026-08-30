import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PokeLoungeStateResponseDto {
  @ApiProperty({
    description: 'Poke Lounge 상태 저장 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: '상태를 저장한 사용자 ID',
    example: 'google-sub-id',
  })
  userId: string;

  @ApiProperty({
    description: 'Poke Lounge 클라이언트의 저장 상태',
    type: 'object',
    additionalProperties: true,
  })
  state: Record<string, unknown>;

  @ApiProperty({
    description: '서버가 원자적으로 증가시키는 저장 revision',
    example: 4,
    minimum: 0,
  })
  revision: number;

  @ApiProperty({
    description: '서버 저장 생성 시각',
    example: '2026-07-08T12:00:01.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: '서버 저장 갱신 시각',
    example: '2026-07-08T12:00:02.000Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '클라이언트 기준 상태 갱신 시각',
    example: '2026-07-08T12:00:00.000Z',
    nullable: true,
  })
  clientUpdatedAt: Date | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

export class SavePokeLoungeStateDto {
  @ApiProperty({
    description: 'Poke Lounge 클라이언트의 현재 저장 상태',
    type: 'object',
    additionalProperties: true,
    example: {
      trainer: { x: 12, y: 3 },
      party: ['pikachu', 'eevee'],
    },
  })
  @IsObject()
  state: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      '마지막으로 조회하거나 저장한 서버 revision. 신규 저장은 0이며, 값이 일치할 때만 갱신됩니다. 생략은 구버전 Web의 신규 저장 또는 revision 0 마이그레이션 행의 1회 전환에만 허용됩니다.',
    example: 3,
    minimum: 0,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  expectedRevision?: number;

  @ApiPropertyOptional({
    description:
      '진단용 클라이언트 갱신 시각. 저장 순서 판정에는 사용하지 않습니다.',
    example: '2026-07-08T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  clientUpdatedAt?: string;
}

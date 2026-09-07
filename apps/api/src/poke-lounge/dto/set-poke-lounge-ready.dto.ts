import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class SetPokeLoungeReadyDto {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  ready!: boolean;

  @ApiPropertyOptional({
    description:
      'Round whose rendered field is ready; omitted for lobby readiness.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundIndex?: number;
}

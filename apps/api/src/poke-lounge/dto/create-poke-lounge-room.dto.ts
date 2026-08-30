import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import type { CreatePokeLoungeRoomInput } from './../poke-lounge-room.types';

export class CreatePokeLoungeRoomDto implements CreatePokeLoungeRoomInput {
  @ApiPropertyOptional({ example: 'ABC234' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{6}$/)
  roomCode?: string;

  @ApiPropertyOptional({ example: 'player-a' })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiPropertyOptional({ example: 'user-123' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: 'Player A' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    example: 180000,
    description:
      'Test-only override; production preparation is fixed at 180000ms',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundDurationMs?: number;
}

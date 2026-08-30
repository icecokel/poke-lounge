import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { JoinPokeLoungeRoomInput } from './../poke-lounge-room.types';

export class JoinPokeLoungeRoomDto implements JoinPokeLoungeRoomInput {
  @ApiPropertyOptional({ example: 'player-b' })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiProperty({ example: 'session-b' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiPropertyOptional({ example: 'user-456' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: 'Player B' })
  @IsOptional()
  @IsString()
  displayName?: string;
}

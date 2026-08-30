import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { StartPokeLoungeRoomInput } from './../poke-lounge-room.types';

export class StartPokeLoungeRoomDto implements StartPokeLoungeRoomInput {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

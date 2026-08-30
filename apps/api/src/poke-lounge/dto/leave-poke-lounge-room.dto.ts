import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { LeavePokeLoungeRoomInput } from './../poke-lounge-room.types';

export class LeavePokeLoungeRoomDto implements LeavePokeLoungeRoomInput {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

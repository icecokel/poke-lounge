import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { AddPokeLoungeAiParticipantInput } from '../poke-lounge-room.types';

export class ManagePokeLoungeAiParticipantDto implements AddPokeLoungeAiParticipantInput {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

import type { AiDifficulty } from '@poke-lounge/battle/ai-difficulty';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { SetPokeLoungeAiDifficultyInput } from '../poke-lounge-room.types';

export class SetPokeLoungeAiDifficultyDto implements Omit<
  SetPokeLoungeAiDifficultyInput,
  'aiPlayerId'
> {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty({ enum: ['easy', 'normal', 'hard'], example: 'easy' })
  @IsIn(['easy', 'normal', 'hard'])
  difficulty!: AiDifficulty;
}

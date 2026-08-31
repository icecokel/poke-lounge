import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type {
  PokeLoungeMatchResultReason,
  SubmitPokeLoungeMatchResultInput,
} from '../poke-lounge-room.types';

const matchResultReasons: PokeLoungeMatchResultReason[] = [
  'faint',
  'timeout',
  'forfeit',
];

export class SubmitPokeLoungeMatchResultDto implements SubmitPokeLoungeMatchResultInput {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  reportingPlayerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  @IsNotEmpty()
  reportingSessionId!: string;

  @ApiProperty({ example: 'game-round-1-bracket-1-match-1' })
  @IsString()
  @IsNotEmpty()
  matchId!: string;

  @ApiProperty({ example: 'player-a' })
  @IsString()
  @IsNotEmpty()
  winnerPlayerId!: string;

  @ApiProperty({ example: 'player-b' })
  @IsString()
  @IsNotEmpty()
  loserPlayerId!: string;

  @ApiProperty({ enum: matchResultReasons, example: 'faint' })
  @IsIn(matchResultReasons)
  reason!: PokeLoungeMatchResultReason;
}

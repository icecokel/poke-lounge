import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

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
}

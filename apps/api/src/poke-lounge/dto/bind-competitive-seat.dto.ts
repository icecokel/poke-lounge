import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BindCompetitiveSeatDto {
  @ApiProperty({ example: 'session-a', maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  sessionId!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  CompetitiveIndividualValues,
  CompetitivePartyInput,
  CompetitivePartyMemberInput,
} from '@poke-lounge/battle/competitive-party';
import type { UpdatePokeLoungePartySnapshotInput } from '../poke-lounge-room.types';

const COMPETITIVE_STAT_EXAMPLES: CompetitiveIndividualValues = {
  hp: 31,
  attack: 20,
  defense: 25,
  specialAttack: 17,
  specialDefense: 23,
  speed: 19,
};

class CompetitiveIndividualValuesDto implements CompetitiveIndividualValues {
  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.hp,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  hp!: number;

  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.attack,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  attack!: number;

  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.defense,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  defense!: number;

  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.specialAttack,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  specialAttack!: number;

  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.specialDefense,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  specialDefense!: number;

  @ApiProperty({
    example: COMPETITIVE_STAT_EXAMPLES.speed,
    minimum: 0,
    maximum: 31,
  })
  @IsInt()
  @Min(0)
  @Max(31)
  speed!: number;
}

class CompetitivePartyMoveDto {
  @ApiProperty({ example: 55, minimum: 1, maximum: 470 })
  @IsInt()
  @Min(1)
  @Max(470)
  moveId!: number;

  @ApiProperty({ example: 25, minimum: 0 })
  @IsInt()
  @Min(0)
  pp!: number;
}

class CompetitiveEffortValuesDto {
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  hp!: number;
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  attack!: number;
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  defense!: number;
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  speed!: number;
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  specialAttack!: number;
  @ApiProperty({ minimum: 0, maximum: 255 })
  @IsInt()
  @Min(0)
  @Max(255)
  specialDefense!: number;
}
class CompetitivePartyMemberDto implements CompetitivePartyMemberInput {
  @ApiPropertyOptional({ enum: ['male', 'female', 'genderless'] })
  @IsOptional()
  @IsIn(['male', 'female', 'genderless'])
  gender?: 'male' | 'female' | 'genderless';
  @ApiPropertyOptional({ minimum: 0, maximum: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  natureId?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 123 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(123)
  abilityId?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 536 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(536)
  heldItemId?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  statusTurns?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 255 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  happiness?: number;
  @ApiPropertyOptional({ type: CompetitiveEffortValuesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompetitiveEffortValuesDto)
  effortValues?: CompetitiveEffortValuesDto;

  @ApiProperty({ example: 0, minimum: 0, maximum: 5 })
  @IsInt()
  @Min(0)
  @Max(5)
  slotIndex!: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 493 })
  @IsInt()
  @Min(1)
  @Max(493)
  speciesId!: number;

  @ApiProperty({ example: 11, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  level!: number;

  @ApiProperty({ example: 30, minimum: 0 })
  @IsInt()
  @Min(0)
  currentHp!: number;

  @ApiProperty({
    enum: [
      'normal',
      'poisoned',
      'badlyPoisoned',
      'burned',
      'paralyzed',
      'asleep',
      'frozen',
      'fainted',
    ],
    example: 'normal',
  })
  @IsIn([
    'normal',
    'poisoned',
    'badlyPoisoned',
    'burned',
    'paralyzed',
    'asleep',
    'frozen',
    'fainted',
  ])
  status!: CompetitivePartyMemberInput['status'];

  @ApiProperty({ type: CompetitiveIndividualValuesDto })
  @ValidateNested()
  @Type(function callback() {
    return CompetitiveIndividualValuesDto;
  })
  individualValues!: CompetitiveIndividualValuesDto;

  @ApiProperty({ type: [CompetitivePartyMoveDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(function callback() {
    return CompetitivePartyMoveDto;
  })
  moves!: CompetitivePartyMoveDto[];
}

class CompetitivePartyDto implements CompetitivePartyInput {
  @ApiProperty({ example: 2, enum: [2] })
  @Equals(2)
  version!: 2;

  @ApiProperty({ example: 0, minimum: 0, maximum: 5 })
  @IsInt()
  @Min(0)
  @Max(5)
  activeSlotIndex!: number;

  @ApiProperty({ type: [CompetitivePartyMemberDto], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(function callback() {
    return CompetitivePartyMemberDto;
  })
  members!: CompetitivePartyMemberDto[];
}

export class UpdatePokeLoungePartySnapshotDto implements UpdatePokeLoungePartySnapshotInput {
  @ApiProperty({ example: 'player-a' })
  @IsString()
  playerId!: string;

  @ApiProperty({ example: 'session-a' })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({ example: 'Player A' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ type: CompetitivePartyDto })
  @ValidateNested()
  @Type(function callback() {
    return CompetitivePartyDto;
  })
  competitiveParty!: CompetitivePartyDto;
}

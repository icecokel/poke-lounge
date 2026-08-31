import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CanonicalCompetitiveAction } from '@poke-lounge/battle/actions';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@ValidatorConstraint({ name: 'competitiveMoveId', async: false })
class CompetitiveMoveIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      value === 'struggle' ||
      (Number.isSafeInteger(value) &&
        (value as number) >= 1 &&
        (value as number) <= 470)
    );
  }

  defaultMessage(): string {
    return 'moveId must be a numeric catalog ID or struggle';
  }
}

export class CompetitiveActionDto {
  @ApiProperty({ enum: ['move', 'switch'] })
  @IsIn(['move', 'switch'])
  kind!: CanonicalCompetitiveAction['kind'];

  @ApiPropertyOptional({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  @ValidateIf(function callback(value: CompetitiveActionDto) {
    return value.kind === 'move';
  })
  @Validate(CompetitiveMoveIdConstraint)
  moveId?: number | 'struggle';

  @ApiPropertyOptional({ minimum: 0 })
  @ValidateIf(function callback(value: CompetitiveActionDto) {
    return value.kind === 'switch';
  })
  @IsInt()
  @Min(0)
  @Max(5)
  slotIndex?: number;
}

@ValidatorConstraint({ name: 'competitiveActionShape', async: false })
class CompetitiveActionShapeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.entries(record)
      .filter(function filterItem([, entry]) {
        return entry !== undefined;
      })
      .map(function mapItem([key]) {
        return key;
      })
      .sort();

    return record.kind === 'move'
      ? keys.join(',') === 'kind,moveId'
      : record.kind === 'switch' && keys.join(',') === 'kind,slotIndex';
  }

  defaultMessage(): string {
    return 'action must contain exactly one legal move or switch variant';
  }
}

export class SubmitCompetitiveActionDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  assignmentRevision!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  turn!: number;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(UUID_V4_PATTERN)
  clientCommandId!: string;

  @ApiProperty({ type: CompetitiveActionDto })
  @Validate(CompetitiveActionShapeConstraint)
  @ValidateNested()
  @Type(function callback() {
    return CompetitiveActionDto;
  })
  action!: CompetitiveActionDto;
}

export class SubmitSessionCompetitiveActionDto extends SubmitCompetitiveActionDto {
  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/\S/)
  sessionId!: string;
}

export function toCanonicalCompetitiveAction(
  action: CompetitiveActionDto,
): CanonicalCompetitiveAction {
  if (action.kind === 'move' && action.moveId !== undefined) {
    return { kind: 'move', moveId: action.moveId };
  }
  if (action.kind === 'switch' && action.slotIndex !== undefined) {
    return { kind: 'switch', slotIndex: action.slotIndex };
  }
  throw new Error('Competitive action DTO was not validated');
}

import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import type { CompetitiveActionProjection } from '../competitive/competitive-action.types';
import type {
  CompetitiveMatchKind,
  CompetitiveMatchStatus,
} from '../competitive/competitive-match.types';

class CompetitiveMoveStateDto {
  @ApiProperty({ minimum: 1, maximum: 470 })
  moveId!: number;

  @ApiProperty({ minimum: 0 })
  pp!: number;
}

class CompetitiveBattleStatStagesDto {
  @ApiProperty({ minimum: -6, maximum: 6 })
  attack!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  defense!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  specialAttack!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  specialDefense!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  speed!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  accuracy!: number;

  @ApiProperty({ minimum: -6, maximum: 6 })
  evasion!: number;
}

class CompetitiveCombatantStateDto {
  @ApiProperty({ minimum: 1, maximum: 493 })
  speciesId!: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  slotIndex!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  level!: number;

  @ApiProperty({ minimum: 1 })
  maxHp!: number;

  @ApiProperty({ minimum: 0 })
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
  })
  status!: import('@poke-lounge/battle/gen4/types').Gen4Status;

  @ApiProperty({ type: CompetitiveBattleStatStagesDto })
  statStages!: CompetitiveBattleStatStagesDto;

  @ApiProperty({ type: [CompetitiveMoveStateDto] })
  moves!: CompetitiveMoveStateDto[];
}

class Gen4RequestedMoveDto {
  @ApiProperty({ minimum: 0, maximum: 467 }) moveId!: number;
  @ApiProperty({ minimum: 0, maximum: 64 }) pp!: number;
  @ApiProperty({ minimum: 0, maximum: 64 }) maxPp!: number;
  @ApiProperty() disabled!: boolean;
}
class Gen4ActionRequestDto {
  @ApiProperty({ enum: ['move', 'switch', 'wait', 'ended'] }) kind!:
    'move' | 'switch' | 'wait' | 'ended';
  @ApiProperty({ type: [Gen4RequestedMoveDto], maxItems: 4 })
  moves!: Gen4RequestedMoveDto[];
  @ApiProperty({ type: [Number], maxItems: 6 }) switchSlots!: number[];
  @ApiProperty() trapped!: boolean;
  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 467 })
  forcedMoveId!: number | null;
  @ApiProperty() recharge!: boolean;
}
class CompetitivePlayerStateDto {
  @ApiPropertyOptional({ type: Gen4ActionRequestDto })
  actionRequest?: Gen4ActionRequestDto;
  @ApiProperty()
  playerId!: string;

  @ApiProperty({ minimum: 0 })
  activeSlotIndex!: number;

  @ApiProperty({ type: [CompetitiveCombatantStateDto] })
  team!: CompetitiveCombatantStateDto[];
}

class CompetitiveTerminalResultDto {
  @ApiProperty()
  winnerPlayerId!: string;

  @ApiProperty()
  loserPlayerId!: string;

  @ApiProperty({ enum: ['faint', 'forfeit', 'timeout'] })
  reason!: 'faint' | 'forfeit' | 'timeout';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number', enum: [50, 100] },
  })
  scoreByPlayerId!: Record<string, 50 | 100>;
}

class CompetitiveAnimationEventDto {
  @ApiProperty({ enum: ['move', 'status'] }) kind!: 'move' | 'status';
  @ApiProperty() actorPlayerId!: string;
  @ApiProperty() targetPlayerId!: string;
  @ApiProperty({ minimum: 0, maximum: 5 }) actorSlotIndex!: number;
  @ApiProperty({ minimum: 0, maximum: 5 }) targetSlotIndex!: number;
  @ApiProperty({ minimum: 0, maximum: 470 }) moveId!: number;
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
  })
  status!: string;
  @ApiProperty() hit!: boolean;
  @ApiProperty({ minimum: 0, maximum: 65535 }) damage!: number;
  @ApiProperty({ minimum: 0, maximum: 65535 }) actorHp!: number;
  @ApiProperty({ minimum: 0, maximum: 65535 }) targetHp!: number;
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
  })
  actorStatus!: string;
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
  })
  targetStatus!: string;
}
class CompetitiveTurnPresentationDto {
  @ApiProperty({ minimum: 0 }) turn!: number;
  @ApiProperty({ type: [CompetitiveAnimationEventDto], maxItems: 64 })
  events!: CompetitiveAnimationEventDto[];
}

class CompetitiveBattleStateDto {
  @ApiPropertyOptional({ type: CompetitiveTurnPresentationDto })
  lastTurnPresentation?: CompetitiveTurnPresentationDto;
  @ApiProperty({ example: 3, enum: [2, 3] })
  rulesetVersion!: 2 | 3;

  @ApiProperty({ minimum: 0 })
  turn!: number;

  @ApiProperty({ type: [String], minItems: 2, maxItems: 2 })
  participantIds!: [string, string];

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(CompetitivePlayerStateDto) },
  })
  playersById!: Record<string, CompetitivePlayerStateDto>;

  @ApiProperty({ type: CompetitiveTerminalResultDto, nullable: true })
  terminal!: CompetitiveTerminalResultDto | null;
}

@ApiExtraModels(
  Gen4RequestedMoveDto,
  Gen4ActionRequestDto,
  CompetitiveAnimationEventDto,
  CompetitiveTurnPresentationDto,
  CompetitiveMoveStateDto,
  CompetitiveBattleStatStagesDto,
  CompetitiveCombatantStateDto,
  CompetitivePlayerStateDto,
  CompetitiveTerminalResultDto,
  CompetitiveBattleStateDto,
)
export class CompetitiveActionResponseDto implements CompetitiveActionProjection {
  @ApiProperty()
  matchId!: string;

  @ApiProperty({ example: 'game-round-1-bracket-1-match-1' })
  bracketMatchId!: string;

  @ApiProperty({
    enum: ['ranked-head-to-head', 'tournament-unranked'],
  })
  kind!: CompetitiveMatchKind;

  @ApiProperty()
  assignmentRevision!: number;

  @ApiProperty()
  rulesetVersion!: number;

  @ApiProperty()
  rulesetHash!: string;

  @ApiProperty()
  currentTurn!: number;

  @ApiProperty({ minimum: 0 })
  turnEndsAtMs!: number;

  @ApiProperty({ enum: ['pending', 'active', 'completed'] })
  status!: CompetitiveMatchStatus;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  terminalEventId!: string | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  terminalRoomRevision!: number | null;

  @ApiProperty({ type: [String] })
  playerIds!: [string, string];

  @ApiProperty()
  stateHash!: string;

  @ApiProperty({ type: CompetitiveBattleStateDto })
  currentState!: CompetitiveActionProjection['currentState'];

  @ApiProperty({ type: [String] })
  submittedPlayerIds!: string[];

  @ApiProperty({ type: CompetitiveTerminalResultDto, nullable: true })
  terminal!: CompetitiveActionProjection['terminal'];
}

import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import type {
  TournamentBracketState,
  TournamentBye,
  TournamentElimination,
  TournamentMatch,
  TournamentParticipant,
  TournamentRound,
} from '@poke-lounge/battle';
import type {
  CompetitiveTerminalTransition,
  PokeLoungeFinalStanding,
  PokeLoungeMatchResultReason,
  PokeLoungeMatchStatus,
  PokeLoungePublicPartySnapshot,
  PokeLoungeParticipantRole,
  PokeLoungePublicRoomParticipant,
  PokeLoungePublicRoomState,
  PokeLoungeRoomState,
  PokeLoungeRoomStatus,
  PokeLoungeRoundPhase,
  PokeLoungeTournamentMatch,
} from './../poke-lounge-room.types';
import { CompetitiveActionResponseDto } from './competitive-action-response.dto';

const participantRoles: PokeLoungeParticipantRole[] = [
  'participant',
  'spectator',
];
const roomStatuses: PokeLoungeRoomStatus[] = [
  'waiting',
  'round-started',
  'tournament',
  'completed',
  'closed',
];
const roundPhases: PokeLoungeRoundPhase[] = [
  'waiting',
  'round-started',
  'tournament',
  'completed',
];
const matchStatuses: PokeLoungeMatchStatus[] = ['ready', 'completed'];
const matchResultReasons: PokeLoungeMatchResultReason[] = [
  'faint',
  'timeout',
  'forfeit',
  'run',
  'capture',
];
type PokeLoungeRoundState = PokeLoungeRoomState['round'];
type PokeLoungeTournamentState = PokeLoungeRoomState['tournament'];

class PokeLoungeRoomParticipantDto implements PokeLoungePublicRoomParticipant {
  @ApiProperty({ example: 'player-a' })
  playerId!: string;

  @ApiProperty({ example: 'Player A' })
  displayName!: string;

  @ApiProperty({ enum: participantRoles, example: 'participant' })
  role!: PokeLoungeParticipantRole;

  @ApiProperty({ example: true })
  ready!: boolean;

  @ApiProperty({ example: true })
  connected!: boolean;

  @ApiProperty({ example: 1720000000000 })
  joinedAtMs!: number;

  @ApiPropertyOptional({ example: 1720000005000 })
  leftAtMs?: number;
}

class PokeLoungeTournamentMatchDto implements PokeLoungeTournamentMatch {
  @ApiProperty({ example: 'game-round-1-bracket-1-match-1' })
  matchId!: string;

  @ApiProperty({ example: 1 })
  roundNumber!: number;

  @ApiProperty({ example: 1 })
  matchNumber!: number;

  @ApiProperty({ type: () => PokeLoungeTournamentParticipantDto })
  participantA!: TournamentParticipant;

  @ApiProperty({ type: () => PokeLoungeTournamentParticipantDto })
  participantB!: TournamentParticipant;

  @ApiProperty({
    type: [String],
    example: ['player-a', 'player-b'],
    minItems: 2,
    maxItems: 2,
  })
  participantIds!: [string, string];

  @ApiProperty({ enum: matchStatuses, example: 'ready' })
  status!: PokeLoungeMatchStatus;

  @ApiProperty({ type: String, example: 'player-a', nullable: true })
  winnerPlayerId!: string | null;

  @ApiProperty({ type: String, example: 'player-b', nullable: true })
  loserPlayerId!: string | null;

  @ApiProperty({ enum: matchResultReasons, example: 'faint', nullable: true })
  resultReason!: PokeLoungeMatchResultReason | null;

  @ApiProperty({ type: Number, example: 1720000060000, nullable: true })
  completedAtMs!: number | null;
}

class PokeLoungeTournamentParticipantDto implements TournamentParticipant {
  @ApiProperty({ example: 'player-a' })
  playerId!: string;

  @ApiProperty({ example: 'Player A' })
  displayName!: string;

  @ApiProperty({ example: 1 })
  seed!: number;
}

class PokeLoungeTournamentByeDto implements TournamentBye {
  @ApiProperty({ example: 'game-round-1-bracket-1-bye-1' })
  byeId!: string;

  @ApiProperty({ example: 1 })
  roundNumber!: number;

  @ApiProperty({ example: 1 })
  slotNumber!: number;

  @ApiProperty({ type: PokeLoungeTournamentParticipantDto })
  entrant!: TournamentParticipant;
}

class PokeLoungeTournamentRoundSlotDto {
  @ApiProperty({ enum: ['match', 'bye'] })
  kind!: 'match' | 'bye';

  @ApiPropertyOptional({ example: 'game-round-1-bracket-1-match-1' })
  matchId?: string;

  @ApiPropertyOptional({ example: 'game-round-1-bracket-1-bye-1' })
  byeId?: string;
}

class PokeLoungeTournamentRoundDto implements TournamentRound {
  @ApiProperty({ example: 1 })
  roundNumber!: number;

  @ApiProperty({ type: [PokeLoungeTournamentMatchDto] })
  matches!: TournamentMatch[];

  @ApiProperty({ type: [PokeLoungeTournamentByeDto] })
  byes!: TournamentBye[];

  @ApiProperty({ type: [PokeLoungeTournamentRoundSlotDto] })
  slots!: TournamentRound['slots'];
}

class PokeLoungeTournamentEliminationDto implements TournamentElimination {
  @ApiProperty({ example: 'player-b' })
  playerId!: string;

  @ApiProperty({ example: 'Player B' })
  displayName!: string;

  @ApiProperty({ example: 2 })
  seed!: number;

  @ApiProperty({ example: 1 })
  roundNumber!: number;

  @ApiProperty({ example: 'game-round-1-bracket-1-match-1' })
  matchId!: string;

  @ApiProperty({ example: 1 })
  order!: number;
}

class PokeLoungeTournamentBracketDto implements TournamentBracketState {
  @ApiProperty({ example: 1, enum: [1] })
  version!: 1;

  @ApiProperty({ example: 1 })
  gameRoundIndex!: number;

  @ApiProperty({ enum: ['in-progress', 'completed'] })
  status!: TournamentBracketState['status'];

  @ApiProperty({ type: [PokeLoungeTournamentParticipantDto] })
  participants!: TournamentParticipant[];

  @ApiProperty({ type: PokeLoungeTournamentRoundDto, nullable: true })
  currentRound!: TournamentRound | null;

  @ApiProperty({ type: [PokeLoungeTournamentRoundDto] })
  completedRounds!: TournamentRound[];

  @ApiProperty({ type: [PokeLoungeTournamentEliminationDto] })
  eliminations!: TournamentElimination[];

  @ApiProperty({ type: String, example: 'player-a', nullable: true })
  championPlayerId!: string | null;
}

class PokeLoungeFinalStandingDto implements PokeLoungeFinalStanding {
  @ApiProperty({ example: 'player-a' })
  playerId!: string;

  @ApiProperty({ example: 'Player A' })
  displayName!: string;

  @ApiProperty({ example: 1 })
  rank!: number;

  @ApiProperty({ example: 100 })
  score!: number;
}

export class PokeLoungeRepresentativePokemonDto implements NonNullable<
  PokeLoungePublicPartySnapshot['representativePokemon']
> {
  @ApiProperty({ example: 25 })
  speciesId!: number;

  @ApiProperty({ example: 12 })
  level!: number;

  @ApiProperty({ example: 18 })
  currentHp!: number;

  @ApiProperty({ example: 30 })
  maxHp!: number;
}

export class PokeLoungePartySnapshotDto implements PokeLoungePublicPartySnapshot {
  @ApiProperty({ example: 'player-a' })
  playerId!: string;

  @ApiPropertyOptional({ example: 'Player A' })
  displayName?: string;

  @ApiProperty({ type: PokeLoungeRepresentativePokemonDto })
  representativePokemon!: PokeLoungeRepresentativePokemonDto;

  @ApiProperty({ example: 1, minimum: 0 })
  partySize!: number;

  @ApiProperty({ example: 1720000002000 })
  updatedAtMs!: number;
}

class PokeLoungeRoundDto implements PokeLoungeRoundState {
  @ApiProperty({ example: 1 })
  index!: number;

  @ApiProperty({ enum: roundPhases, example: 'waiting' })
  phase!: PokeLoungeRoundPhase;

  @ApiProperty({ example: 60000 })
  durationMs!: number;

  @ApiProperty({ type: Number, example: 1720000000000, nullable: true })
  startedAtMs!: number | null;

  @ApiProperty({ type: Number, example: 1720000060000, nullable: true })
  endsAtMs!: number | null;
}

class PokeLoungeTournamentDto implements PokeLoungeTournamentState {
  @ApiProperty({ example: 2, enum: [2] })
  version!: 2;

  @ApiProperty({ type: PokeLoungeTournamentBracketDto, nullable: true })
  bracket!: TournamentBracketState | null;

  @ApiProperty({
    type: String,
    example: 'game-round-1-bracket-1-match-1',
    nullable: true,
  })
  activeMatchId!: string | null;

  @ApiProperty({ enum: ['casual', 'server'], nullable: true })
  activeMatchAuthority!: PokeLoungeTournamentState['activeMatchAuthority'];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { 'player-a': 100, 'player-b': 50 },
  })
  cumulativeScores!: Record<string, number>;
}

class CompetitiveTerminalTransitionDto implements CompetitiveTerminalTransition {
  @ApiProperty({ type: String, format: 'uuid' })
  terminalEventId!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  terminalRoomRevision!: number;

  @ApiProperty({ type: CompetitiveActionResponseDto })
  projection!: CompetitiveActionResponseDto;
}

@ApiExtraModels(
  PokeLoungePartySnapshotDto,
  PokeLoungeRepresentativePokemonDto,
  CompetitiveActionResponseDto,
  CompetitiveTerminalTransitionDto,
)
export class PokeLoungeRoomResponseDto implements PokeLoungePublicRoomState {
  @ApiProperty({ example: 'ROOM01' })
  roomCode!: string;

  @ApiProperty({ enum: roomStatuses, example: 'waiting' })
  status!: PokeLoungeRoomStatus;

  @ApiPropertyOptional({
    enum: ['legacy-room-restart-required', 'competitive-party-not-ready'],
    example: 'competitive-party-not-ready',
  })
  closeReason?: PokeLoungeRoomState['closeReason'];

  @ApiProperty({ example: 1720000000000 })
  createdAtMs!: number;

  @ApiProperty({ example: 1720000001000 })
  updatedAtMs!: number;

  @ApiProperty({ example: 3, minimum: 0 })
  revision!: number;

  @ApiProperty({ example: 1720001800000 })
  expiresAtMs!: number;

  @ApiProperty({ type: String, example: 'player-a', nullable: true })
  hostPlayerId!: string | null;

  @ApiProperty({ type: [PokeLoungeRoomParticipantDto] })
  participants!: PokeLoungeRoomParticipantDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      $ref: '#/components/schemas/PokeLoungePartySnapshotDto',
    },
  })
  partySnapshots!: Record<string, PokeLoungePartySnapshotDto>;

  @ApiProperty({ type: PokeLoungeRoundDto })
  round!: PokeLoungeRoundDto;

  @ApiProperty({ type: PokeLoungeTournamentDto })
  tournament!: PokeLoungeTournamentDto;

  @ApiProperty({ type: [PokeLoungeFinalStandingDto] })
  finalStandings!: PokeLoungeFinalStandingDto[];

  @ApiProperty({ type: [CompetitiveTerminalTransitionDto], maxItems: 8 })
  competitiveTransitions!: CompetitiveTerminalTransitionDto[];

  @ApiProperty({ type: [CompetitiveActionResponseDto], maxItems: 3 })
  competitiveAssignments!: CompetitiveActionResponseDto[];

  @ApiPropertyOptional({ type: CompetitiveActionResponseDto })
  competitive?: CompetitiveActionResponseDto;
}

import type {
  CanonicalBattleState,
  CanonicalTerminalResult,
} from '@poke-lounge/battle';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { pokeLoungeRevisionTransformer } from './poke-lounge-room.entity';
import type {
  CompetitiveMatchStatus,
  CompetitiveMatchKind,
  CompetitivePlayerAccount,
} from '../competitive/competitive-match.types';

export interface CompetitiveHistoryPublication {
  historyIdByAccountId: Record<string, string>;
}

export const nullablePokeLoungeRevisionTransformer = {
  to(value: number | null): string | null {
    return value === null ? null : pokeLoungeRevisionTransformer.to(value);
  },
  from(value: string | number | null): number | null {
    return value === null ? null : pokeLoungeRevisionTransformer.from(value);
  },
} satisfies ValueTransformer;

@Entity('poke_lounge_competitive_match')
@Unique('UQ_poke_lounge_competitive_match_room_bracket', [
  'roomId',
  'bracketMatchId',
])
@Index('IDX_poke_lounge_competitive_match_status', ['status'])
@Index('UQ_poke_lounge_competitive_match_active_room', ['roomId'], {
  unique: true,
  where: `"status" IN ('pending', 'active')`,
})
@Index('UQ_poke_lounge_competitive_match_terminal_event', ['terminalEventId'], {
  unique: true,
  where: '"terminal_event_id" IS NOT NULL',
})
@Index(
  'IDX_poke_lounge_competitive_match_terminal_recovery',
  ['roomId', 'terminalRoomRevision'],
  {
    where:
      '"terminal_event_id" IS NOT NULL AND "terminal_room_revision" IS NOT NULL',
  },
)
@Check(
  'CHK_poke_lounge_competitive_match_terminal_metadata_pair',
  '("terminal_event_id" IS NULL AND "terminal_room_revision" IS NULL) OR ("terminal_event_id" IS NOT NULL AND "terminal_room_revision" IS NOT NULL)',
)
export class PokeLoungeCompetitiveMatch {
  @PrimaryGeneratedColumn('uuid', { name: 'match_id' })
  matchId: string;

  @Column({ name: 'room_id', type: 'uuid', update: false })
  roomId: string;

  @Column({ name: 'room_code', type: 'varchar', length: 6, update: false })
  roomCode: string;

  @Column({
    name: 'bracket_match_id',
    type: 'varchar',
    length: 128,
    update: false,
  })
  bracketMatchId: string;

  @Column({ name: 'kind', type: 'varchar', length: 32, update: false })
  kind: CompetitiveMatchKind;

  @Column({
    name: 'assignment_revision',
    type: 'bigint',
    transformer: pokeLoungeRevisionTransformer,
    update: false,
  })
  assignmentRevision: number;

  @Column({ name: 'player_accounts', type: 'jsonb', update: false })
  playerAccounts: [CompetitivePlayerAccount, CompetitivePlayerAccount];

  @Column({ name: 'ruleset_version', type: 'integer', update: false })
  rulesetVersion: number;

  @Column({ name: 'ruleset_hash', type: 'char', length: 64, update: false })
  rulesetHash: string;

  @Column({
    name: 'server_seed',
    type: 'char',
    length: 64,
    select: false,
    update: false,
  })
  serverSeed: string;

  @Column({
    name: 'initial_state',
    type: 'jsonb',
    select: false,
    update: false,
  })
  initialState: CanonicalBattleState;

  @Column({
    name: 'initial_state_hash',
    type: 'char',
    length: 64,
    update: false,
  })
  initialStateHash: string;

  @Column({ name: 'current_state', type: 'jsonb', select: false })
  currentState: CanonicalBattleState;

  @Column({ name: 'current_state_hash', type: 'char', length: 64 })
  currentStateHash: string;

  @Column({ name: 'current_turn', type: 'integer', default: 0 })
  currentTurn: number;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'pending' })
  status: CompetitiveMatchStatus;

  @Column({ name: 'terminal_event_id', type: 'uuid', nullable: true })
  terminalEventId: string | null;

  @Column({
    name: 'terminal_room_revision',
    type: 'bigint',
    nullable: true,
    transformer: nullablePokeLoungeRevisionTransformer,
  })
  terminalRoomRevision: number | null;

  @Column({
    name: 'terminal_result',
    type: 'jsonb',
    nullable: true,
    select: false,
  })
  terminalResult: CanonicalTerminalResult | null;

  @Column({
    name: 'history_publication',
    type: 'jsonb',
    nullable: true,
    select: false,
  })
  historyPublication: CompetitiveHistoryPublication | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

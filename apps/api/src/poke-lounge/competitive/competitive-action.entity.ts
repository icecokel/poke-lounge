import type { CanonicalCompetitiveAction } from '@poke-lounge/battle';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type {
  CompetitiveActionProjection,
  CompetitiveActionReceiptStatus,
} from './competitive-action.types';

@Entity('poke_lounge_competitive_action')
@Unique('UQ_poke_lounge_competitive_action_turn_actor', [
  'matchId',
  'turn',
  'actorPlayerId',
])
@Unique('UQ_poke_lounge_competitive_action_actor_command', [
  'matchId',
  'actorPlayerId',
  'clientCommandId',
])
@Index('IDX_poke_lounge_competitive_action_match_turn', ['matchId', 'turn'])
export class PokeLoungeCompetitiveAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'turn', type: 'integer' })
  turn: number;

  @Column({ name: 'actor_player_id', type: 'varchar', length: 128 })
  actorPlayerId: string;

  @Column({
    name: 'actor_account_id',
    type: 'varchar',
    length: 255,
    select: false,
  })
  actorAccountId: string;

  @Column({ name: 'client_command_id', type: 'uuid' })
  clientCommandId: string;

  @Column({ name: 'action', type: 'jsonb', select: false })
  action: CanonicalCompetitiveAction;

  @Column({ name: 'canonical_action', type: 'text', select: false })
  canonicalAction: string;

  @Column({ name: 'request_hash', type: 'char', length: 64, select: false })
  requestHash: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: CompetitiveActionReceiptStatus;

  @Column({ name: 'response', type: 'jsonb', select: false })
  response: CompetitiveActionProjection;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}

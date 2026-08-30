import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import {
  PokeLoungeRoom,
  pokeLoungeRevisionTransformer,
} from './poke-lounge-room.entity';

@Entity('poke_lounge_room_command')
@Unique('UQ_poke_lounge_room_command_room_actor_key', [
  'roomId',
  'actorPlayerId',
  'idempotencyKey',
])
@Unique('UQ_poke_lounge_room_command_actor_key', [
  'actorPlayerId',
  'idempotencyKey',
])
export class PokeLoungeRoomCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @ManyToOne(() => PokeLoungeRoom, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'room_id',
    foreignKeyConstraintName: 'FK_poke_lounge_room_command_room_id',
  })
  room: PokeLoungeRoom;

  @Column({ name: 'actor_player_id', type: 'varchar', length: 128 })
  actorPlayerId: string;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ name: 'response_state', type: 'jsonb' })
  responseState: PokeLoungeRoomSnapshot;

  @Column({
    name: 'response_revision',
    type: 'bigint',
    transformer: pokeLoungeRevisionTransformer,
  })
  responseRevision: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

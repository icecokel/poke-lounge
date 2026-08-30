import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import type { PokeLoungeRoomState } from '../poke-lounge-room.types';

export const pokeLoungeRevisionTransformer = {
  to(value: unknown): string {
    return parsePokeLoungeRevision(value).toString();
  },
  from(value: unknown): number {
    return parsePokeLoungeRevision(value);
  },
} satisfies ValueTransformer;

@Entity('poke_lounge_room')
@Unique('UQ_poke_lounge_room_room_code', ['roomCode'])
@Index('IDX_poke_lounge_room_expires_at', ['expiresAt'])
@Index('IDX_poke_lounge_room_room_code_revision', ['roomCode', 'revision'])
export class PokeLoungeRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_code', type: 'varchar', length: 6 })
  roomCode: string;

  @Column({ name: 'state', type: 'jsonb' })
  state: PokeLoungeRoomState;

  @Column({
    name: 'revision',
    type: 'bigint',
    default: 0,
    transformer: pokeLoungeRevisionTransformer,
  })
  revision: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

function parsePokeLoungeRevision(value: unknown): number {
  const revision = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(
      'Poke Lounge revision is outside the safe integer range',
    );
  }

  return revision;
}

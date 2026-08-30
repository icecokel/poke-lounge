import {
  CreateDateColumn,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('poke_lounge_competitive_seat')
@Unique('UQ_poke_lounge_competitive_seat_room_session', ['roomId', 'sessionId'])
@Unique('UQ_poke_lounge_competitive_seat_room_player', ['roomId', 'playerId'])
@Unique('UQ_poke_lounge_competitive_seat_room_account', ['roomId', 'accountId'])
export class PokeLoungeCompetitiveSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'session_id', type: 'varchar', length: 256 })
  sessionId: string;

  @Column({ name: 'player_id', type: 'varchar', length: 128 })
  playerId: string;

  @Column({ name: 'account_id', type: 'varchar', length: 255 })
  accountId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

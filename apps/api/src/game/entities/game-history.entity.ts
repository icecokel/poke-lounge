import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { GameType } from '../enums/game-type.enum';
import type { GameSubmissionTrust } from '../game-score-policy';

@Entity()
export class GameHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  score: number;

  @Column({
    type: 'enum',
    enum: GameType,
    default: GameType.SKY_DROP,
  })
  gameType: GameType;

  @Column({ type: 'int', nullable: true })
  playTime?: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  resultTrust: GameSubmissionTrust | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  sourceKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne(() => User)
  user: User;
}

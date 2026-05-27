import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Relation,
} from 'typeorm';
import { User } from './User';
import { Challenge } from './Challenge';

@Entity('challenge_completions')
@Index(['userId', 'completedAt'])
@Index(['challengeId'])
export class ChallengeCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  challengeId: string;

  @Column({ type: 'int' })
  pointsEarned: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  listenPercentage: number;

  /** Bull job id — unique when set so retries do not double-credit points */
  @Column({ type: 'varchar', nullable: true, unique: true })
  bullJobId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  completedAt: Date;

  @ManyToOne(() => User, (u) => u.completions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @ManyToOne(() => Challenge, (c) => c.completions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challengeId' })
  challenge: Relation<Challenge>;
}

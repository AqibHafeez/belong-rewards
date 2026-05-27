import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Relation,
} from 'typeorm';
import { ChallengeCompletion } from './ChallengeCompletion';
import { RewardRedemption } from './RewardRedemption';
import { RefreshToken } from './RefreshToken';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Index()
  @Column({ type: 'int', default: 0 })
  totalPoints: number;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ChallengeCompletion, (c) => c.user)
  completions: Relation<ChallengeCompletion[]>;

  @OneToMany(() => RewardRedemption, (r) => r.user)
  redemptions: Relation<RewardRedemption[]>;

  @OneToMany(() => RefreshToken, (t) => t.user)
  refreshTokens: Relation<RefreshToken[]>;
}

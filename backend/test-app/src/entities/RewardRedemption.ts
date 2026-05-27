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
import { Reward } from './Reward';

export type RedemptionStatus = 'pending' | 'fulfilled' | 'cancelled';

@Entity('reward_redemptions')
@Index(['userId', 'redeemedAt'])
export class RewardRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  rewardId: string;

  @Column({ type: 'int' })
  pointsSpent: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'fulfilled', 'cancelled'],
    default: 'pending',
  })
  status: RedemptionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  redeemedAt: Date;

  @ManyToOne(() => User, (u) => u.redemptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @ManyToOne(() => Reward, (r) => r.redemptions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rewardId' })
  reward: Relation<Reward>;
}

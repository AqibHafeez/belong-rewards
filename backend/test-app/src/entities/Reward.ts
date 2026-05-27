import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
  Relation,
} from 'typeorm';
import { RewardRedemption } from './RewardRedemption';

@Entity('rewards')
export class Reward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int' })
  pointsCost: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => RewardRedemption, (r) => r.reward)
  redemptions: Relation<RewardRedemption[]>;
}

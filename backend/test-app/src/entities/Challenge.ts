import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
  Relation,
} from 'typeorm';
import { ChallengeCompletion } from './ChallengeCompletion';

export type Difficulty = 'easy' | 'medium' | 'hard'; // How about moving this to DB level?

@Entity('challenges')
@Index(['isActive', 'difficulty'])
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  title: string;

  @Column({ type: 'varchar' })
  artist: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'int' })
  durationSeconds: number;

  @Column({ type: 'enum', enum: ['easy', 'medium', 'hard'] })
  difficulty: Difficulty;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ChallengeCompletion, (c) => c.challenge)
  completions: Relation<ChallengeCompletion[]>;
}

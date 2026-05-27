import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { ChallengeCompletion } from '../entities/ChallengeCompletion';
import { RewardRedemption } from '../entities/RewardRedemption';
import { AppError, HttpStatus } from '../errors';
import type { PaginationOptions } from '../types';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  totalPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  totalPoints: number;
  completionsCount: number;
  totalPointsEarned: number;
  redemptionsCount: number;
  totalPointsSpent: number;
}

export class UserService {
  constructor(private readonly db: DataSource) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.db.getRepository(User).findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(HttpStatus.NOT_FOUND, 'User not found');
    }
    return this.toProfile(user);
  }

  async updateProfile(
    userId: string,
    updates: { displayName?: string },
  ): Promise<UserProfile> {
    const userRepo = this.db.getRepository(User);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(HttpStatus.NOT_FOUND, 'User not found');
    }

    if (updates.displayName !== undefined) {
      user.displayName = updates.displayName;
    }

    const saved = await userRepo.save(user);
    return this.toProfile(saved);
  }

  async getStats(userId: string): Promise<UserStats> {
    const [completionStats, redemptionStats, user] = await Promise.all([
      this.db
        .getRepository(ChallengeCompletion)
        .createQueryBuilder('cc')
        .select('COUNT(cc.id)', 'count')
        .addSelect('COALESCE(SUM(cc.pointsEarned), 0)', 'total')
        .where('cc.userId = :userId', { userId })
        .getRawOne<{ count: string; total: string }>(),

      this.db
        .getRepository(RewardRedemption)
        .createQueryBuilder('rr')
        .select('COUNT(rr.id)', 'count')
        .addSelect('COALESCE(SUM(rr.pointsSpent), 0)', 'total')
        .where('rr.userId = :userId', { userId })
        .getRawOne<{ count: string; total: string }>(),

      this.db.getRepository(User).findOne({ where: { id: userId } }),
    ]);

    if (!user) {
      throw new AppError(HttpStatus.NOT_FOUND, 'User not found');
    }

    return {
      totalPoints: user.totalPoints,
      completionsCount: parseInt(completionStats?.count ?? '0', 10),
      totalPointsEarned: parseInt(completionStats?.total ?? '0', 10),
      redemptionsCount: parseInt(redemptionStats?.count ?? '0', 10),
      totalPointsSpent: parseInt(redemptionStats?.total ?? '0', 10),
    };
  }

  async getCompletions(userId: string, options: PaginationOptions) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [items, total] = await this.db
      .getRepository(ChallengeCompletion)
      .findAndCount({
        where: { userId },
        relations: { challenge: true },
        order: { completedAt: 'DESC' },
        skip,
        take: limit,
      });

    return {
      data: items.map((item) => ({
        id: item.id,
        pointsEarned: item.pointsEarned,
        listenPercentage: Number(item.listenPercentage),
        completedAt: item.completedAt,
        challenge: {
          id: item.challenge.id,
          title: item.challenge.title,
          artist: item.challenge.artist,
          difficulty: item.challenge.difficulty,
          points: item.challenge.points,
        },
      })),
      total,
    };
  }

  async getRedemptions(userId: string, options: PaginationOptions) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [items, total] = await this.db
      .getRepository(RewardRedemption)
      .findAndCount({
        where: { userId },
        relations: { reward: true },
        order: { redeemedAt: 'DESC' },
        skip,
        take: limit,
      });

    return {
      data: items.map((item) => ({
        id: item.id,
        pointsSpent: item.pointsSpent,
        status: item.status,
        redeemedAt: item.redeemedAt,
        reward: {
          id: item.reward.id,
          name: item.reward.name,
          description: item.reward.description,
        },
      })),
      total,
    };
  }

  // ─── private helpers ───────────────────────────────────────────────────────

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      totalPoints: user.totalPoints,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

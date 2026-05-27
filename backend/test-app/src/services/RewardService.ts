import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Reward } from '../entities/Reward';
import { RewardRedemption } from '../entities/RewardRedemption';
import { User } from '../entities/User';
import { AppError, HttpStatus } from '../errors';
import { REDIS_LEADERBOARD_KEY } from '../utils/constants';
import type { PaginationOptions } from '../types';

export class RewardService {
  constructor(
    private readonly db: DataSource,
    private readonly redis: Redis,
  ) {}

  async list(options: PaginationOptions) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [rewards, total] = await this.db
      .getRepository(Reward)
      .findAndCount({
        where: { isAvailable: true },
        order: { pointsCost: 'ASC' },
        skip,
        take: limit,
      });

    return { data: rewards, total };
  }

  /**
   * Atomically deducts points and creates a redemption record.
   * Uses SELECT FOR UPDATE to prevent double-spend under concurrent requests.
   */
  async redeem(
    userId: string,
    rewardId: string,
  ): Promise<{ redemption: RewardRedemption; remainingPoints: number }> {
    const reward = await this.db
      .getRepository(Reward)
      .findOne({ where: { id: rewardId } });

    if (!reward) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Reward not found');
    }
    if (!reward.isAvailable) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'Reward is not currently available');
    }

    const { redemption, remainingPoints } = await this.db.transaction(async (manager) => {
      // Lock the user row — concurrent redemptions for the same user queue up here
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .getOne();

      if (!user) {
        throw new AppError(HttpStatus.NOT_FOUND, 'User not found');
      }

      if (user.totalPoints < reward.pointsCost) {
        const shortfall = reward.pointsCost - user.totalPoints;
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          `Insufficient points. You need ${shortfall} more point(s) to redeem this reward.`,
        );
      }

      user.totalPoints -= reward.pointsCost;
      await manager.getRepository(User).save(user);

      const redemption = await manager.getRepository(RewardRedemption).save(
        manager.getRepository(RewardRedemption).create({
          userId,
          rewardId,
          pointsSpent: reward.pointsCost,
          status: 'pending', // If we want to have validation before giving to the customer
        }),
      );

      return { redemption, remainingPoints: user.totalPoints };
    });

    // Keep Redis leaderboard in sync — points went down
    await this.redis.zadd(REDIS_LEADERBOARD_KEY, remainingPoints, userId);

    return { redemption, remainingPoints };
  }

  async getHistory(userId: string, options: PaginationOptions) {
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
          pointsCost: item.reward.pointsCost,
        },
      })),
      total,
    };
  }
}

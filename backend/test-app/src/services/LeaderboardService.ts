import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { User } from '../entities/User';
import { AppError, HttpStatus } from '../errors';
import { REDIS_LEADERBOARD_KEY } from '../utils/constants';
import type { LeaderboardEntry } from '../types';

export class LeaderboardService {
  constructor(
    private readonly db: DataSource,
    private readonly redis: Redis,
  ) {}

  async getTopFans(
    page: number,
    limit: number,
  ): Promise<{ data: LeaderboardEntry[]; total: number }> {
    const skip = (page - 1) * limit;

    // Redis returns [member, score, member, score, ...]
    const [rawEntries, total] = await Promise.all([
      this.redis.zrevrange(REDIS_LEADERBOARD_KEY, skip, skip + limit - 1, 'WITHSCORES'),
      this.redis.zcard(REDIS_LEADERBOARD_KEY),
    ]);

    if (rawEntries.length === 0) {
      return { data: [], total };
    }

    const entries: { userId: string; score: number }[] = [];
    for (let i = 0; i < rawEntries.length; i += 2) {
      entries.push({
        userId: rawEntries[i],
        score: parseFloat(rawEntries[i + 1]),
      });
    }

    // Fetch tie-aware rank for each unique score using a Redis pipeline
    const uniqueScores = [...new Set(entries.map((e) => e.score))];
    const pipeline = this.redis.pipeline();
    for (const score of uniqueScores) {
      // Count users with strictly higher score → rank = count + 1
      pipeline.zcount(REDIS_LEADERBOARD_KEY, `(${score}`, '+inf');
    }
    const pipelineResults = (await pipeline.exec()) ?? [];
    const scoreToRank = new Map<number, number>();
    uniqueScores.forEach((score, i) => {
      const count = (pipelineResults[i]?.[1] as number) ?? 0;
      scoreToRank.set(score, count + 1);
    });

    // Enrich with display names from DB (single query for whole page)
    const userIds = entries.map((e) => e.userId);
    const users = await this.db
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.displayName'])
      .whereInIds(userIds)
      .getMany();

    const displayNameMap = new Map(users.map((u) => [u.id, u.displayName]));

    const data: LeaderboardEntry[] = entries.map((e) => ({
      rank: scoreToRank.get(e.score) ?? skip + 1,
      userId: e.userId,
      displayName: displayNameMap.get(e.userId) ?? null,
      totalPoints: e.score,
    }));

    return { data, total };
  }

  async getMyRank(userId: string): Promise<{ rank: number; totalPoints: number }> {
    const score = await this.redis.zscore(REDIS_LEADERBOARD_KEY, userId);

    if (score === null) {
      // User not in leaderboard yet — find their DB score, default rank to last
      const user = await this.db
        .getRepository(User)
        .findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError(HttpStatus.NOT_FOUND, 'User not found');
      }

      const total = await this.redis.zcard(REDIS_LEADERBOARD_KEY);
      return { rank: total + 1, totalPoints: user.totalPoints };
    }

    const numericScore = parseFloat(score);
    // Count users with strictly more points
    const ahead = await this.redis.zcount(
      REDIS_LEADERBOARD_KEY,
      `(${numericScore}`,
      '+inf',
    );

    return { rank: ahead + 1, totalPoints: numericScore };
  }

  async syncFromDB(): Promise<void> {
    const users = await this.db
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.totalPoints'])
      .where('u.totalPoints > 0')
      .getMany();

    if (users.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const user of users) {
      pipeline.zadd(REDIS_LEADERBOARD_KEY, user.totalPoints, user.id);
    }
    await pipeline.exec();
  }
}

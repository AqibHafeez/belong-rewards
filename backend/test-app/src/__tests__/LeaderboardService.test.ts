import { DataSource, SelectQueryBuilder } from 'typeorm';
import Redis from 'ioredis';
import { LeaderboardService } from '../services/LeaderboardService';
import { User } from '../entities/User';
import { HttpStatus } from '../utils/HttpStatus';

// ─── factories ────────────────────────────────────────────────────────────────

function buildMockRedis(overrides: Partial<Record<string, jest.Mock>> = {}): jest.Mocked<Partial<Redis>> {
  return {
    zrevrange:  jest.fn().mockResolvedValue([]),
    zcard:      jest.fn().mockResolvedValue(0),
    zscore:     jest.fn().mockResolvedValue(null),
    zcount:     jest.fn().mockResolvedValue(0),
    zadd:       jest.fn().mockResolvedValue(1),
    pipeline:   jest.fn().mockReturnValue({
      zadd:   jest.fn().mockReturnThis(),
      zcount: jest.fn().mockReturnThis(),
      exec:   jest.fn().mockResolvedValue([]),
    }),
    ...overrides,
  };
}

function buildUserQueryBuilder(users: Partial<User>[]) {
  return {
    select:      jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    whereInIds:  jest.fn().mockReturnThis(),
    getMany:     jest.fn().mockResolvedValue(users),
  } as unknown as SelectQueryBuilder<User>;
}

function buildMockDb(users: Partial<User>[] = []): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(users[0] ?? null),
      createQueryBuilder: jest.fn().mockReturnValue(buildUserQueryBuilder(users)),
    }),
  } as unknown as DataSource;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('LeaderboardService', () => {

  // ── getTopFans ───────────────────────────────────────────────────────────────

  describe('getTopFans', () => {
    it('returns empty list when leaderboard is empty', async () => {
      const redis = buildMockRedis();
      const db = buildMockDb();
      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getTopFans(1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('parses Redis entries and enriches with display names', async () => {
      // Redis ZREVRANGE WITHSCORES returns [member, score, member, score, ...]
      const redis = buildMockRedis({
        zrevrange: jest.fn().mockResolvedValue(['user-1', '500', 'user-2', '300']),
        zcard: jest.fn().mockResolvedValue(2),
        pipeline: jest.fn().mockReturnValue({
          zcount: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 0], [null, 1]]), // user-1: 0 ahead, user-2: 1 ahead
        }),
      });
      const db = buildMockDb([
        { id: 'user-1', displayName: 'Alice' },
        { id: 'user-2', displayName: 'Bob' },
      ]);

      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getTopFans(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ userId: 'user-1', totalPoints: 500, rank: 1 });
      expect(result.data[1]).toMatchObject({ userId: 'user-2', totalPoints: 300, rank: 2 });
    });

    it('assigns the same rank to tied users', async () => {
      // Both users have 500 pts → both should be rank 1
      const redis = buildMockRedis({
        zrevrange: jest.fn().mockResolvedValue(['user-1', '500', 'user-2', '500']),
        zcard: jest.fn().mockResolvedValue(2),
        pipeline: jest.fn().mockReturnValue({
          zcount: jest.fn().mockReturnThis(),
          // Only one unique score (500), 0 users ahead → rank 1
          exec: jest.fn().mockResolvedValue([[null, 0]]),
        }),
      });
      const db = buildMockDb([
        { id: 'user-1', displayName: 'Alice' },
        { id: 'user-2', displayName: 'Bob' },
      ]);

      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getTopFans(1, 20);

      expect(result.data[0].rank).toBe(1);
      expect(result.data[1].rank).toBe(1); // tied — same rank
    });
  });

  // ── getMyRank ────────────────────────────────────────────────────────────────

  describe('getMyRank', () => {
    it('returns correct rank based on users ahead', async () => {
      // 2 users have more points → rank 3
      const redis = buildMockRedis({
        zscore: jest.fn().mockResolvedValue('300'),
        zcount: jest.fn().mockResolvedValue(2),
      });
      const db = buildMockDb();

      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getMyRank('user-1');

      expect(result.rank).toBe(3);
      expect(result.totalPoints).toBe(300);
    });

    it('returns rank 1 when no one has more points', async () => {
      const redis = buildMockRedis({
        zscore: jest.fn().mockResolvedValue('1000'),
        zcount: jest.fn().mockResolvedValue(0),
      });
      const db = buildMockDb();

      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getMyRank('user-1');

      expect(result.rank).toBe(1);
    });

    it('returns total+1 rank when user not in Redis yet', async () => {
      const redis = buildMockRedis({
        zscore: jest.fn().mockResolvedValue(null), // not in sorted set
        zcard:  jest.fn().mockResolvedValue(5),    // 5 users in leaderboard
      });
      const db = buildMockDb([{ id: 'user-1', totalPoints: 0 }]);

      const result = await new LeaderboardService(db, redis as unknown as Redis)
        .getMyRank('user-1');

      expect(result.rank).toBe(6); // 5 + 1
      expect(result.totalPoints).toBe(0);
    });

    it('throws 404 when user not in Redis and not in DB', async () => {
      const redis = buildMockRedis({ zscore: jest.fn().mockResolvedValue(null) });
      const db = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(null),
          createQueryBuilder: jest.fn().mockReturnValue(buildUserQueryBuilder([])),
        }),
      } as unknown as DataSource;

      await expect(
        new LeaderboardService(db, redis as unknown as Redis).getMyRank('ghost'),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
    });
  });

  // ── syncFromDB ───────────────────────────────────────────────────────────────

  describe('syncFromDB', () => {
    it('bulk-ZADDs all users with points > 0', async () => {
      const pipelineMock = { zadd: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
      const redis = buildMockRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const db = buildMockDb([
        { id: 'u-1', totalPoints: 500 },
        { id: 'u-2', totalPoints: 300 },
      ]);

      await new LeaderboardService(db, redis as unknown as Redis).syncFromDB();

      expect(pipelineMock.zadd).toHaveBeenCalledTimes(2);
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('skips pipeline when no users have points', async () => {
      const pipelineMock = { zadd: jest.fn(), exec: jest.fn() };
      const redis = buildMockRedis({ pipeline: jest.fn().mockReturnValue(pipelineMock) });
      const db = buildMockDb([]); // no users

      await new LeaderboardService(db, redis as unknown as Redis).syncFromDB();

      expect(pipelineMock.exec).not.toHaveBeenCalled();
    });
  });
});

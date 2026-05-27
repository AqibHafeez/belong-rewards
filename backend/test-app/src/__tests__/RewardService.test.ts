import { DataSource, EntityManager, Repository } from 'typeorm';
import Redis from 'ioredis';
import { RewardService } from '../services/RewardService';
import { Reward } from '../entities/Reward';
import { RewardRedemption } from '../entities/RewardRedemption';
import { User } from '../entities/User';
import { HttpStatus } from '../utils/HttpStatus';
import { REDIS_LEADERBOARD_KEY } from '../utils/constants';

// ─── factories ────────────────────────────────────────────────────────────────

function makeReward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: 'reward-1',
    name: 'Early Access Pass',
    description: 'Get early access',
    pointsCost: 200,
    isAvailable: true,
    createdAt: new Date(),
    redemptions: [],
    ...overrides,
  };
}

function makeUser(totalPoints: number): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hash',
    displayName: 'Test',
    totalPoints,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completions: [],
    redemptions: [],
    refreshTokens: [],
  };
}

function buildMockDbWithTransaction(
  rewardFindResult: Reward | null,
  userInTransaction: User,
): DataSource {
  const rewardRepo = { findOne: jest.fn().mockResolvedValue(rewardFindResult) };
  const redemptionRepo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest.fn().mockImplementation((r) => Promise.resolve({ ...r, id: 'redemption-1', redeemedAt: new Date() })),
    create: jest.fn().mockImplementation((dto) => dto),
  };

  return {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Reward) return rewardRepo;
      return redemptionRepo;
    }),
    transaction: jest.fn().mockImplementation(async (cb: (manager: EntityManager) => unknown) => {
      const userRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(userInTransaction),
        }),
        save: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
      };
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === User) return userRepo;
          return redemptionRepo;
        }),
      };
      return cb(manager as unknown as EntityManager);
    }),
  } as unknown as DataSource;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('RewardService', () => {
  let mockRedis: jest.Mocked<Partial<Redis>>;

  beforeEach(() => {
    mockRedis = { zadd: jest.fn().mockResolvedValue(1) };
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns only available rewards', async () => {
      const rewards = [makeReward()];
      const rewardRepo = { findAndCount: jest.fn().mockResolvedValue([rewards, 1]) };
      const db = { getRepository: jest.fn().mockReturnValue(rewardRepo) } as unknown as DataSource;

      const result = await new RewardService(db, mockRedis as unknown as Redis)
        .list({ page: 1, limit: 10 });

      expect(rewardRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isAvailable: true } }),
      );
      expect(result.total).toBe(1);
    });
  });

  // ── redeem ───────────────────────────────────────────────────────────────────

  describe('redeem', () => {
    it('deducts points and creates redemption on success', async () => {
      const reward = makeReward({ pointsCost: 200 });
      const user = makeUser(500);
      const db = buildMockDbWithTransaction(reward, user);
      const service = new RewardService(db, mockRedis as unknown as Redis);

      const { remainingPoints } = await service.redeem('user-1', 'reward-1');

      expect(remainingPoints).toBe(300); // 500 - 200
      expect(mockRedis.zadd).toHaveBeenCalledWith(REDIS_LEADERBOARD_KEY, 300, 'user-1');
    });

    it('throws 404 when reward not found', async () => {
      const db = buildMockDbWithTransaction(null, makeUser(500));

      await expect(
        new RewardService(db, mockRedis as unknown as Redis).redeem('user-1', 'missing'),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
    });

    it('throws 400 when reward is unavailable', async () => {
      const reward = makeReward({ isAvailable: false });
      const db = buildMockDbWithTransaction(reward, makeUser(500));

      await expect(
        new RewardService(db, mockRedis as unknown as Redis).redeem('user-1', 'reward-1'),
      ).rejects.toMatchObject({ statusCode: HttpStatus.BAD_REQUEST });
    });

    it('throws 400 with shortfall message when points insufficient', async () => {
      const reward = makeReward({ pointsCost: 500 });
      const user = makeUser(100); // only 100 pts, needs 500
      const db = buildMockDbWithTransaction(reward, user);

      await expect(
        new RewardService(db, mockRedis as unknown as Redis).redeem('user-1', 'reward-1'),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('400'), // shortfall message
      });
    });

    it('does not update Redis when transaction fails', async () => {
      const reward = makeReward({ pointsCost: 200 });
      const db = {
        getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(reward) }),
        transaction: jest.fn().mockRejectedValue(new Error('DB error')),
      } as unknown as DataSource;

      await expect(
        new RewardService(db, mockRedis as unknown as Redis).redeem('user-1', 'reward-1'),
      ).rejects.toThrow('DB error');

      expect(mockRedis.zadd).not.toHaveBeenCalled();
    });
  });

  // ── getHistory ───────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns paginated redemption history with reward details', async () => {
      const redemption: Partial<RewardRedemption> = {
        id: 'r-1',
        pointsSpent: 200,
        status: 'pending',
        redeemedAt: new Date(),
        reward: makeReward(),
      };
      const redemptionRepo = {
        findAndCount: jest.fn().mockResolvedValue([[redemption], 1]),
      };
      const db = {
        getRepository: jest.fn().mockReturnValue(redemptionRepo),
      } as unknown as DataSource;

      const result = await new RewardService(db, mockRedis as unknown as Redis)
        .getHistory('user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.data[0].reward.name).toBe('Early Access Pass');
    });
  });
});

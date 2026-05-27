import { DataSource, SelectQueryBuilder } from 'typeorm';
import Bull from 'bull';
import { ChallengeService } from '../services/ChallengeService';
import { Challenge } from '../entities/Challenge';
import { User } from '../entities/User';
import { HttpStatus } from '../utils/HttpStatus';
import { CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT } from '../utils/constants';
import { challengeEvents } from '../events/challengeEvents';

jest.mock('../events/challengeEvents', () => ({
  CHALLENGE_COMPLETED: 'challenge.completed',
  challengeEvents: {
    emitAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── factories ────────────────────────────────────────────────────────────────

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'challenge-1',
    title: 'All Night',
    artist: 'Camo & Krooked',
    description: 'desc',
    points: 150,
    durationSeconds: 219,
    difficulty: 'easy',
    isActive: true,
    createdAt: new Date(),
    completions: [],
    ...overrides,
  };
}

function makeQueryBuilder(results: unknown, count = 0) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([results, count]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: '0', total: '0' }),
  } as unknown as SelectQueryBuilder<Challenge>;
  return qb;
}

function buildMockDb(challengeRepo = {}, completionRepo = {}, userRepo = {}): DataSource {
  return {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Challenge) return challengeRepo;
      if (entity === User) return userRepo;
      return completionRepo;
    }),
    transaction: jest.fn().mockImplementation(async (cb) => {
      const manager = {
        getRepository: jest.fn().mockReturnValue({
          save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
          create: jest.fn().mockImplementation((dto) => dto),
        }),
        createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder([])),
      };
      return cb(manager);
    }),
  } as unknown as DataSource;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ChallengeService', () => {
  let mockQueue: jest.Mocked<Partial<Bull.Queue>>;

  beforeEach(() => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  });

  describe('list', () => {
    it('returns paginated challenges', async () => {
      const challenges = [makeChallenge()];
      const qb = makeQueryBuilder(challenges, 1);
      const challengeRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const db = buildMockDb(challengeRepo);
      const service = new ChallengeService(db);

      const result = await service.list({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('applies difficulty filter when provided', async () => {
      const qb = makeQueryBuilder([], 0);
      const challengeRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const db = buildMockDb(challengeRepo);
      const service = new ChallengeService(db);

      await service.list({ page: 1, limit: 10, difficulty: 'hard' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'c.difficulty = :difficulty',
        { difficulty: 'hard' },
      );
    });
  });

  describe('getById', () => {
    it('returns the challenge when found', async () => {
      const challenge = makeChallenge();
      const challengeRepo = { findOne: jest.fn().mockResolvedValue(challenge) };
      const db = buildMockDb(challengeRepo);

      const result = await new ChallengeService(db).getById('challenge-1');

      expect(result.id).toBe('challenge-1');
    });

    it('throws 404 when not found', async () => {
      const challengeRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const db = buildMockDb(challengeRepo);

      await expect(
        new ChallengeService(db).getById('missing'),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
    });
  });

  describe('enqueueCompletion', () => {
    it('enqueues job and returns jobId + pointsEarned', async () => {
      const challenge = makeChallenge({ points: 150 });
      const challengeRepo = { findOne: jest.fn().mockResolvedValue(challenge) };
      const db = buildMockDb(challengeRepo);

      const result = await new ChallengeService(db)
        .enqueueCompletion('user-1', 'challenge-1', 100, mockQueue as unknown as Bull.Queue);

      expect(mockQueue.add).toHaveBeenCalledWith({
        userId: 'user-1',
        challengeId: 'challenge-1',
        listenPercentage: 100,
      });
      expect(result.jobId).toBe('job-1');
      expect(result.pointsEarned).toBe(150);
    });

    it('throws 404 when challenge not found', async () => {
      const challengeRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const db = buildMockDb(challengeRepo);

      await expect(
        new ChallengeService(db)
          .enqueueCompletion('u', 'missing', 100, mockQueue as unknown as Bull.Queue),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
    });

    it('throws 400 when challenge is inactive', async () => {
      const challengeRepo = {
        findOne: jest.fn().mockResolvedValue(makeChallenge({ isActive: false })),
      };
      const db = buildMockDb(challengeRepo);

      await expect(
        new ChallengeService(db)
          .enqueueCompletion('u', 'challenge-1', 100, mockQueue as unknown as Bull.Queue),
      ).rejects.toMatchObject({ statusCode: HttpStatus.BAD_REQUEST });
    });
  });

  describe('calculatePoints (via enqueueCompletion)', () => {
    async function getPoints(challengePoints: number, listenPct: number) {
      const challengeRepo = {
        findOne: jest.fn().mockResolvedValue(makeChallenge({ points: challengePoints })),
      };
      const db = buildMockDb(challengeRepo);
      const { pointsEarned } = await new ChallengeService(db)
        .enqueueCompletion('u', 'c', listenPct, mockQueue as unknown as Bull.Queue);
      return pointsEarned;
    }

    it('awards full points at 100% listen', async () => {
      expect(await getPoints(150, 100)).toBe(150);
    });

    it(`awards full points at exactly ${CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT}% (threshold)`, async () => {
      expect(await getPoints(150, CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT)).toBe(150);
    });

    it(`awards proportional points below ${CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT}%`, async () => {
      expect(await getPoints(150, 50)).toBe(75);
    });

    it('awards 0 points at 0% listen', async () => {
      expect(await getPoints(150, 0)).toBe(0);
    });

    it('floors fractional points', async () => {
      expect(await getPoints(300, 33)).toBe(99);
    });
  });

  describe('processCompletionJob (idempotency)', () => {
    const jobData = {
      userId: 'user-1',
      challengeId: 'challenge-1',
      listenPercentage: 100,
    };

    function buildJobProcessorDb(insertResults: Array<{ identifiers: Array<{ id?: string }> }>) {
      const increment = jest.fn().mockResolvedValue(undefined);
      let insertAttempt = 0;

      const insertChain = {
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockImplementation(() => {
          const result = insertResults[insertAttempt] ?? { identifiers: [] };
          insertAttempt += 1;
          return Promise.resolve(result);
        }),
      };

      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue(insertChain),
        }),
        increment,
      };

      const challengeRepo = {
        findOne: jest.fn().mockResolvedValue(makeChallenge({ points: 150 })),
      };
      const userRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'user-1', totalPoints: 150 }),
      };

      const db = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === Challenge) return challengeRepo;
          if (entity === User) return userRepo;
          return {};
        }),
        transaction: jest.fn().mockImplementation(async (cb: (m: typeof manager) => unknown) => cb(manager)),
      } as unknown as DataSource;

      return { db, increment, insertChain };
    }

    beforeEach(() => {
      jest.mocked(challengeEvents.emitAsync).mockClear();
    });

    it('credits points only once when the same Bull job is processed twice', async () => {
      const { db, increment } = buildJobProcessorDb([
        { identifiers: [{ id: 'completion-1' }] },
        { identifiers: [] },
      ]);

      const service = new ChallengeService(db);
      const job = { id: 'job-42', data: jobData } as Bull.Job;

      await service.processCompletionJob(job);
      await service.processCompletionJob(job);

      expect(increment).toHaveBeenCalledTimes(1);
      expect(increment).toHaveBeenCalledWith(User, { id: 'user-1' }, 'totalPoints', 150);
    });

    it('still emits leaderboard sync on retry without crediting points again', async () => {
      const { db, increment } = buildJobProcessorDb([
        { identifiers: [{ id: 'completion-1' }] },
        { identifiers: [] },
      ]);

      const service = new ChallengeService(db);
      const job = { id: 'job-99', data: jobData } as Bull.Job;

      await service.processCompletionJob(job);
      await service.processCompletionJob(job);

      expect(increment).toHaveBeenCalledTimes(1);
      expect(challengeEvents.emitAsync).toHaveBeenCalledTimes(2);
      expect(challengeEvents.emitAsync).toHaveBeenLastCalledWith(
        'challenge.completed',
        expect.objectContaining({
          userId: 'user-1',
          newTotalPoints: 150,
          pointsEarned: 0,
        }),
      );
    });
  });
});

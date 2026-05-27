import { DataSource } from 'typeorm';
import Bull from 'bull';
import { Challenge, Difficulty } from '../entities/Challenge';
import { ChallengeCompletion } from '../entities/ChallengeCompletion';
import { User } from '../entities/User';
import { AppError, HttpStatus } from '../errors';
import { challengeEvents, CHALLENGE_COMPLETED } from '../events/challengeEvents';
import {
  CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT,
  LISTEN_PERCENTAGE_MAX,
} from '../utils/constants';
import type { PaginationOptions } from '../types';

export interface CompletionJobData {
  userId: string;
  challengeId: string;
  listenPercentage: number;
}

export class ChallengeService {
  constructor(private readonly db: DataSource) {}

  async list(options: PaginationOptions & { difficulty?: Difficulty; isActive?: boolean }) {
    const { page, limit, difficulty, isActive = true } = options;
    const skip = (page - 1) * limit;

    const qb = this.db
      .getRepository(Challenge)
      .createQueryBuilder('c')
      .where('c.isActive = :isActive', { isActive })
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (difficulty) {
      qb.andWhere('c.difficulty = :difficulty', { difficulty });
    }

    const [challenges, total] = await qb.getManyAndCount();
    return { data: challenges, total };
  }

  async getById(id: string): Promise<Challenge> {
    const challenge = await this.db
      .getRepository(Challenge)
      .findOne({ where: { id } });

    if (!challenge) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Challenge not found');
    }
    return challenge;
  }

  async enqueueCompletion(
    userId: string,
    challengeId: string,
    listenPercentage: number,
    queue: Bull.Queue<CompletionJobData>,
  ): Promise<{ jobId: Bull.JobId; pointsEarned: number }> {
    const challenge = await this.db
      .getRepository(Challenge)
      .findOne({ where: { id: challengeId } });

    if (!challenge) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Challenge not found');
    }
    if (!challenge.isActive) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'Challenge is not active');
    }

    const pointsEarned = this.calculatePoints(challenge.points, listenPercentage);
    const job = await queue.add({ userId, challengeId, listenPercentage });
    return { jobId: job.id, pointsEarned };
  }

  /**
   * Bull worker processor — runs asynchronously off the HTTP thread.
   * 1. Persists completion + increments points in a DB transaction.
   * 2. Emits challenge.completed for side-effects (Redis leaderboard update).
   */
  async processCompletionJob(job: Bull.Job<CompletionJobData>): Promise<void> {
    const { userId, challengeId, listenPercentage } = job.data;

    const challenge = await this.db
      .getRepository(Challenge)
      .findOne({ where: { id: challengeId } });

    if (!challenge) {
      throw new Error(`Challenge ${challengeId} not found during job processing`);
    }

    const pointsEarned = this.calculatePoints(challenge.points, listenPercentage);

    await this.db.transaction(async (manager) => {
      await manager.getRepository(ChallengeCompletion).save(
        manager.getRepository(ChallengeCompletion).create({
          userId,
          challengeId,
          pointsEarned,
          listenPercentage,
        }),
      );

      await manager
        .createQueryBuilder()
        .update(User)
        .set({ totalPoints: () => `"totalPoints" + ${pointsEarned}` })
        .where('id = :userId', { userId })
        .execute();
    });

    const updated = await this.db.getRepository(User).findOne({ where: { id: userId } });
    if (!updated) {
      throw new Error(`User ${userId} not found after completion processing`);
    }

    await challengeEvents.emitAsync(CHALLENGE_COMPLETED, {
      userId,
      challengeId,
      pointsEarned,
      listenPercentage,
      newTotalPoints: updated.totalPoints,
    });
  }

  /** Business rule: ≥80% listen earns full points; below that is proportional */
  private calculatePoints(challengePoints: number, listenPercentage: number): number {
    return listenPercentage >= CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT
      ? challengePoints
      : Math.floor(challengePoints * (listenPercentage / LISTEN_PERCENTAGE_MAX));
  }
}

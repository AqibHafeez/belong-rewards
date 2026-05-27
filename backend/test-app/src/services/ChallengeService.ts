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
   * Idempotent on bullJobId: retries after a successful insert do not double-credit points.
   * 1. INSERT completion ON CONFLICT (bullJobId) DO NOTHING
   * 2. If inserted, increment totalPoints in the same transaction
   * 3. Emit challenge.completed (also on retry to heal Redis if a prior run failed after commit)
   */
  async processCompletionJob(job: Bull.Job<CompletionJobData>): Promise<void> {
    const { userId, challengeId, listenPercentage } = job.data;
    const bullJobId = String(job.id);

    const challenge = await this.db
      .getRepository(Challenge)
      .findOne({ where: { id: challengeId } });

    if (!challenge) {
      throw new Error(`Challenge ${challengeId} not found during job processing`);
    }

    const pointsEarned = this.calculatePoints(challenge.points, listenPercentage);

    let pointsCredited = false;

    await this.db.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(ChallengeCompletion)
        .values({
          userId,
          challengeId,
          pointsEarned,
          listenPercentage,
          bullJobId,
        })
        .orIgnore()
        .execute();

      const inserted =
        Array.isArray(insertResult.identifiers) &&
        insertResult.identifiers.length > 0 &&
        insertResult.identifiers[0]?.id != null;

      if (!inserted) {
        return;
      }

      await manager.increment(User, { id: userId }, 'totalPoints', pointsEarned);
      pointsCredited = true;
    });

    const updated = await this.db.getRepository(User).findOne({ where: { id: userId } });
    if (!updated) {
      throw new Error(`User ${userId} not found after completion processing`);
    }

    await challengeEvents.emitAsync(CHALLENGE_COMPLETED, {
      userId,
      challengeId,
      pointsEarned: pointsCredited ? pointsEarned : 0,
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

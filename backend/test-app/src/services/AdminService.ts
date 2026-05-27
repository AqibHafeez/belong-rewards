import { DataSource } from 'typeorm';
import { Challenge, Difficulty } from '../entities/Challenge';
import { Reward } from '../entities/Reward';
import { AppError, HttpStatus } from '../errors';

export interface CreateChallengeDto {
  title: string;
  artist: string;
  description: string;
  points: number;
  durationSeconds: number;
  difficulty: Difficulty;
  isActive?: boolean;
}

export interface UpdateChallengeDto {
  title?: string;
  artist?: string;
  description?: string;
  points?: number;
  durationSeconds?: number;
  difficulty?: Difficulty;
  isActive?: boolean;
}

export interface CreateRewardDto {
  name: string;
  description: string;
  pointsCost: number;
  isAvailable?: boolean;
}

export interface UpdateRewardDto {
  name?: string;
  description?: string;
  pointsCost?: number;
  isAvailable?: boolean;
}

export class AdminService {
  constructor(private readonly db: DataSource) {}

  // ── Challenges ───────────────────────────────────────────────────────────────

  async createChallenge(dto: CreateChallengeDto): Promise<Challenge> {
    const repo = this.db.getRepository(Challenge);

    const existing = await repo.findOne({ where: { title: dto.title } });
    if (existing) {
      throw new AppError(HttpStatus.CONFLICT, 'A challenge with this title already exists');
    }

    return repo.save(repo.create({ ...dto, isActive: dto.isActive ?? true }));
  }

  async updateChallenge(id: string, dto: UpdateChallengeDto): Promise<Challenge> {
    const repo = this.db.getRepository(Challenge);

    const challenge = await repo.findOne({ where: { id } });
    if (!challenge) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Challenge not found');
    }

    Object.assign(challenge, dto);
    return repo.save(challenge);
  }

  async deactivateChallenge(id: string): Promise<{ id: string }> {
    const repo = this.db.getRepository(Challenge);

    const challenge = await repo.findOne({ where: { id } });
    if (!challenge) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Challenge not found');
    }

    await repo.update(id, { isActive: false });
    return { id };
  }

  // ── Rewards ──────────────────────────────────────────────────────────────────

  async createReward(dto: CreateRewardDto): Promise<Reward> {
    const repo = this.db.getRepository(Reward);

    const existing = await repo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new AppError(HttpStatus.CONFLICT, 'A reward with this name already exists');
    }

    return repo.save(repo.create({ ...dto, isAvailable: dto.isAvailable ?? true }));
  }

  async updateReward(id: string, dto: UpdateRewardDto): Promise<Reward> {
    const repo = this.db.getRepository(Reward);

    const reward = await repo.findOne({ where: { id } });
    if (!reward) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Reward not found');
    }

    Object.assign(reward, dto);
    return repo.save(reward);
  }

  async deactivateReward(id: string): Promise<{ id: string }> {
    const repo = this.db.getRepository(Reward);

    const reward = await repo.findOne({ where: { id } });
    if (!reward) {
      throw new AppError(HttpStatus.NOT_FOUND, 'Reward not found');
    }

    await repo.update(id, { isAvailable: false });
    return { id };
  }
}

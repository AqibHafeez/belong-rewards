import { DataSource, IsNull } from 'typeorm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { config } from '../config';
import { AppError } from '../errors';
import { TokenHelper } from '../utils/TokenHelper';
import type { TokenPair } from '../types';

export class AuthService {
  constructor(private readonly db: DataSource) {}

  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<TokenPair> {
    const userRepo = this.db.getRepository(User);

    const existing = await userRepo.findOne({ where: { email } });
    if (existing) {
      throw new AppError(409, 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const user = userRepo.create({ email, passwordHash, displayName: displayName ?? null });
    await userRepo.save(user);

    return TokenHelper.issueTokenPair(user.id, this.db);
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const userRepo = this.db.getRepository(User);

    const user = await userRepo.findOne({ where: { email } });
    if (!user) {
      // Constant-time guard: prevents timing-based email enumeration
      await bcrypt.hash('__dummy__', config.auth.bcryptRounds);
      throw new AppError(401, 'Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'Account temporarily locked. Try again later.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const updates: Partial<User> = { failedLoginAttempts: attempts };
      if (attempts >= config.auth.maxFailedAttempts) {
        updates.lockedUntil = new Date(Date.now() + config.auth.lockDurationMs);
      }
      await userRepo.update(user.id, updates);
      throw new AppError(401, 'Invalid credentials');
    }

    // Reset failed counter on successful login
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await userRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    }

    return TokenHelper.issueTokenPair(user.id, this.db);
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    let payload: { userId: string };
    try {
      payload = jwt.verify(rawToken, config.jwt.refreshSecret) as { userId: string };
    } catch {
      throw new AppError(401, 'Invalid refresh token');
    }

    const tokenHash = TokenHelper.hash(rawToken);
    const tokenRepo = this.db.getRepository(RefreshToken);

    const stored = await tokenRepo.findOne({ where: { tokenHash } });
    if (!stored) {
      throw new AppError(401, 'Invalid refresh token');
    }

    // Reuse detection: already-revoked token presented → potential token theft
    if (stored.revokedAt) {
      // Invalidate every active session for this user (nuclear option)
      await tokenRepo.update(
        { userId: payload.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new AppError(401, 'Refresh token reuse detected. All sessions invalidated.');
    }

    if (stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token expired');
    }

    // Rotate: revoke consumed token, issue a fresh pair
    await tokenRepo.update(stored.id, { revokedAt: new Date() });
    return TokenHelper.issueTokenPair(payload.userId, this.db);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = TokenHelper.hash(rawToken);
    await this.db
      .getRepository(RefreshToken)
      .update({ tokenHash }, { revokedAt: new Date() });
  }
}

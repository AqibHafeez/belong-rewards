import crypto from 'crypto';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../entities/RefreshToken';
import { config } from '../config';
import type { TokenPair } from '../types';


export class TokenHelper {

  static hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static async issueTokenPair(
    userId: string,
    db: DataSource,
  ): Promise<TokenPair> {
    const accessToken = jwt.sign(
      { userId, jti: randomUUID() },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiresIn } as jwt.SignOptions,
    );

    const rawRefreshToken = jwt.sign(
      { userId, jti: randomUUID() },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions,
    );

    const tokenHash = TokenHelper.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + config.jwt.refreshTtlMs);

    const tokenRepo = db.getRepository(RefreshToken);
    await tokenRepo.save(
      tokenRepo.create({ userId, tokenHash, expiresAt, revokedAt: null }),
    );

    return { accessToken, refreshToken: rawRefreshToken };
  }
}

import { DataSource, Repository, UpdateResult } from 'typeorm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { AppError } from '../errors';
import { HttpStatus } from '../utils/HttpStatus';
import { TokenHelper } from '../utils/TokenHelper';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: bcrypt.hashSync('Password@1', 1),
    displayName: 'Test',
    totalPoints: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completions: [],
    redemptions: [],
    refreshTokens: [],
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86400_000),
    revokedAt: null,
    createdAt: new Date(),
    user: {} as User,
    ...overrides,
  };
}

function buildMockDb(
  userRepo: Partial<Repository<User>>,
  tokenRepo: Partial<Repository<RefreshToken>>,
): DataSource {
  return {
    getRepository: jest.fn().mockImplementation((entity) =>
      entity === User ? userRepo : tokenRepo,
    ),
  } as unknown as DataSource;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let tokenRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    tokenRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto: unknown) => dto),
      save: jest.fn().mockImplementation((t: unknown) => Promise.resolve(t)),
      update: jest.fn().mockResolvedValue({} as UpdateResult),
    };
    jest.spyOn(TokenHelper, 'issueTokenPair').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a user and returns token pair', async () => {
      const userRepoMock = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'user-1' })),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      };
      const db = buildMockDb(userRepoMock, tokenRepoMock);
      const service = new AuthService(db);

      const result = await service.register('new@example.com', 'Password@1');

      expect(userRepoMock.findOne).toHaveBeenCalledWith({ where: { email: 'new@example.com' } });
      expect(userRepoMock.save).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });

    it('throws 409 when email already exists', async () => {
      const userRepoMock = { findOne: jest.fn().mockResolvedValue(makeUser()) };
      const db = buildMockDb(userRepoMock, tokenRepoMock);
      const service = new AuthService(db);

      await expect(service.register('test@example.com', 'Password@1'))
        .rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT });
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns token pair on valid credentials', async () => {
      const user = makeUser({ passwordHash: await bcrypt.hash('Password@1', 1) });
      const userRepoMock = {
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
      };
      const db = buildMockDb(userRepoMock, tokenRepoMock);
      const service = new AuthService(db);

      const result = await service.login('test@example.com', 'Password@1');
      expect(result.accessToken).toBe('access-token');
    });

    it('throws 401 on wrong password', async () => {
      const user = makeUser({ passwordHash: await bcrypt.hash('correct', 1) });
      const userRepoMock = {
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
      };
      const db = buildMockDb(userRepoMock, tokenRepoMock);

      await expect(new AuthService(db).login('test@example.com', 'wrong'))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED });
    });

    it('throws 401 when user not found (constant-time)', async () => {
      const userRepoMock = { findOne: jest.fn().mockResolvedValue(null) };
      const db = buildMockDb(userRepoMock, tokenRepoMock);

      await expect(new AuthService(db).login('ghost@example.com', 'pass'))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED });
    });

    it('throws 423 when account is locked', async () => {
      const user = makeUser({ lockedUntil: new Date(Date.now() + 60_000) });
      const userRepoMock = { findOne: jest.fn().mockResolvedValue(user) };
      const db = buildMockDb(userRepoMock, tokenRepoMock);

      await expect(new AuthService(db).login('test@example.com', 'any'))
        .rejects.toMatchObject({ statusCode: HttpStatus.LOCKED });
    });

    it('sets lockedUntil after max failed attempts', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('correct', 1),
        failedLoginAttempts: 4, // one more will hit the limit
      });
      const userRepoMock = {
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
      };
      const db = buildMockDb(userRepoMock, tokenRepoMock);
      await new AuthService(db).login('test@example.com', 'wrong').catch(() => {});

      expect(userRepoMock.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ lockedUntil: expect.any(Date) }),
      );
    });
  });

  // ── refresh ──────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    const rawToken = jwt.sign(
      { userId: 'user-1' },
      process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
      { expiresIn: '7d' },
    );
    const tokenHash = TokenHelper.hash(rawToken);

    it('rotates token on valid refresh', async () => {
      const stored = makeRefreshToken({ tokenHash });
      tokenRepoMock.findOne!.mockResolvedValue(stored);

      const db = buildMockDb({}, tokenRepoMock);
      const result = await new AuthService(db).refresh(rawToken);

      expect(tokenRepoMock.update).toHaveBeenCalledWith(stored.id, { revokedAt: expect.any(Date) });
      expect(result.accessToken).toBe('access-token');
    });

    it('throws 401 on invalid JWT', async () => {
      const db = buildMockDb({}, tokenRepoMock);
      await expect(new AuthService(db).refresh('invalid.token.here'))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED });
    });

    it('throws 401 when token not found in DB', async () => {
      tokenRepoMock.findOne!.mockResolvedValue(null);
      const db = buildMockDb({}, tokenRepoMock);
      await expect(new AuthService(db).refresh(rawToken))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED });
    });

    it('revokes ALL sessions and throws 401 on reuse detection', async () => {
      const revoked = makeRefreshToken({ tokenHash, revokedAt: new Date() });
      tokenRepoMock.findOne!.mockResolvedValue(revoked);

      const db = buildMockDb({}, tokenRepoMock);
      await expect(new AuthService(db).refresh(rawToken))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED, message: /reuse/i });

      // Should have tried to revoke all active sessions
      expect(tokenRepoMock.update).toHaveBeenCalled();
    });

    it('throws 401 on expired token', async () => {
      const expired = makeRefreshToken({
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      });
      tokenRepoMock.findOne!.mockResolvedValue(expired);

      const db = buildMockDb({}, tokenRepoMock);
      await expect(new AuthService(db).refresh(rawToken))
        .rejects.toMatchObject({ statusCode: HttpStatus.UNAUTHORIZED });
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('marks the token as revoked', async () => {
      const db = buildMockDb({}, tokenRepoMock);
      const rawToken = 'some.raw.token';
      const hash = TokenHelper.hash(rawToken);

      await new AuthService(db).logout(rawToken);

      expect(tokenRepoMock.update).toHaveBeenCalledWith(
        { tokenHash: hash },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});

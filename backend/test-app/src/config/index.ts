import dotenv from 'dotenv';
import {
  DB_POOL_MIN_DEFAULT,
  DB_POOL_SIZE_DEFAULT,
  RATE_LIMIT_AUTH_MAX_DEFAULT,
  RATE_LIMIT_GLOBAL_MAX_DEFAULT,
  RATE_LIMIT_WINDOW_DEFAULT,
} from '../utils/constants';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  adminApiKey: process.env.ADMIN_API_KEY || '',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'belong',
    password: process.env.DB_PASSWORD || 'belong_dev',
    database: process.env.DB_DATABASE || 'fan_rewards',
    poolSize: parseInt(process.env.DB_POOL_SIZE || String(DB_POOL_SIZE_DEFAULT), 10),
    poolMin: parseInt(process.env.DB_POOL_MIN || String(DB_POOL_MIN_DEFAULT), 10),
  },

  rateLimit: {
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || String(RATE_LIMIT_GLOBAL_MAX_DEFAULT), 10),
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || String(RATE_LIMIT_AUTH_MAX_DEFAULT), 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || RATE_LIMIT_WINDOW_DEFAULT,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshTtlMs: parseInt(process.env.JWT_REFRESH_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10),
  },

  auth: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10),
    lockDurationMs: parseInt(process.env.LOCK_DURATION_MS || String(15 * 60 * 1000), 10),
  },
};

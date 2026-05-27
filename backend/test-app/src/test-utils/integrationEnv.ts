import * as dotenv from 'dotenv';

dotenv.config();

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT_TEST || '5433';
process.env.DB_DATABASE = process.env.DB_DATABASE_TEST || 'fan_rewards_test';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'belong';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'belong_dev';

process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.RATE_LIMIT_GLOBAL_MAX = '10000';
process.env.RATE_LIMIT_AUTH_MAX = '10000';
